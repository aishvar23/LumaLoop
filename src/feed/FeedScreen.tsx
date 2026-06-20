/**
 * FeedScreen — full-screen vertical swipe/snap feed surface (Azure DevOps #105,
 * docs/FEED_DIRECTION.md §3.1).
 *
 * Mounted at the PREVIEW route `/feed` (additive — `/` keeps the bounded
 * start-screen/session/receipt until #107 swaps the default). One game fills the
 * viewport; native vertical touch scroll IS the swipe on mobile, with CSS
 * scroll-snap settling each game to the top (see `FeedScreen.css`). Keyboard /
 * non-touch users get Arrow/Space navigation and an accessible landmark.
 *
 * Separation of concerns (CLAUDE.md §4): this surface owns ONLY presentation and
 * scroll. {@link useFeedController} (#104) owns the endless deck + which card is
 * active; the per-template renderers own card interaction. FeedScreen resolves a
 * renderer for each card via the injected {@link RendererRegistry} only — there
 * is NO switch on `templateType` anywhere, so adding a new game never touches
 * this file (CLAUDE.md §6).
 *
 * Scope guard: resolve handling here is intentionally SIMPLE. A resolved game is
 * recorded locally and its feedback/explanation step stays visible (via the feed
 * registry's gate); the feed does NOT auto-advance — the user swipes on. Full
 * skip / engage-then-abandon / timer-arms-on-engagement semantics are #106; the
 * SEAMs are marked below rather than implemented here.
 */

import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { getCardById as getCatalogCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import { resolveRenderer } from '../session/rendererRegistry';
import type { RendererRegistry, TemplateRenderer } from '../session/rendererRegistry';
import type { CardResolution, CardStartContext } from '../templates/contract';
import { getAnonymousUserId } from '../telemetry/anonymousUser';
import { feedRegistry } from '../ui/feedRegistry';
import type { FeedBatchSource } from './feedDeck';
import { useFeedController } from './useFeedController';
import './FeedScreen.css';

/** Slides within this many of the active index mount their real renderer. */
const WINDOW_RADIUS = 1;

export type FeedScreenProps = {
  /**
   * Test seam: maps each `templateType` to its renderer (dependency inversion).
   * Defaults to the shipped {@link feedRegistry} (each renderer behind the
   * uniform feedback/explanation gate). Must be referentially stable.
   */
  registry?: RendererRegistry;
  /** Test seam: deterministic feed batch source. Defaults to seeded catalog. */
  source?: FeedBatchSource;
  /**
   * Test seam: a fixed anonymous id for deterministic composition. When omitted
   * (real usage) it resolves to the real persisted id (Technical Design §10).
   */
  anonymousUserId?: string;
  /** Test seam: cardId → card resolver. Defaults to the authored catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** Test seam: wall clock for the per-card start context. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * SEAM (#106 / telemetry): notified once per local resolution. The feed itself
   * never advances on resolve; this is where skip/abandon/telemetry wiring lands.
   */
  onCardResolved?: (index: number, resolution: CardResolution) => void;
};

/** True when motion should be reduced; safe in non-DOM/test environments. */
function prefersReducedMotion(): boolean {
  try {
    return (
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
  } catch {
    return false;
  }
}

/** Best-effort `scrollIntoView` — jsdom/older engines may lack it; never throws. */
function scrollSlideIntoView(el: HTMLElement, reduceMotion: boolean): void {
  try {
    el.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  } catch {
    // Best-effort only — navigation already updated the controller's active index.
  }
}

export default function FeedScreen({
  registry = feedRegistry,
  source,
  anonymousUserId,
  getCardById = getCatalogCardById,
  now,
  onCardResolved,
}: FeedScreenProps) {
  // Resolve the real persisted anonymous id ONCE per mount (Technical Design
  // §10); tests inject a fixed id for deterministic composition.
  const [resolvedAnonymousUserId] = useState(
    () => anonymousUserId ?? getAnonymousUserId(),
  );
  // A per-mount feed instance id + a single "active at" stamp for the card start
  // context. Real arm-on-engagement timing is #106; here the context is static.
  const nowFn = now ?? Date.now;
  const [feedId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? `feed-${resolvedAnonymousUserId}`,
  );
  const [activeAtMs] = useState(() => nowFn());

  const { cards, activeIndex, setActiveIndex, next, prev } = useFeedController({
    anonymousUserId: resolvedAnonymousUserId,
    source,
  });

  // Stable handle to `setActiveIndex` for the long-lived IntersectionObserver
  // callback (the controller's callbacks are already stable, but capturing via a
  // ref keeps the observer effect free of re-creation churn).
  const setActiveIndexRef = useRef(setActiveIndex);
  setActiveIndexRef.current = setActiveIndex;

  // index → slide element, populated by the stable ref callback at commit. Used
  // to (a) observe each slide and (b) scroll a slide into view on keyboard nav.
  const slideEls = useRef<Map<number, HTMLElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const registerSlide = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const index = Number(el.dataset.index);
    slideEls.current.set(index, el);
    observerRef.current?.observe(el);
  }, []);

  // One IntersectionObserver for the whole feed: when a slide snaps into view it
  // becomes the active card, which materialises more cards ahead → endless.
  useEffect(() => {
    const IO = globalThis.IntersectionObserver;
    if (!IO) return undefined; // non-DOM/test env without the API: degrade.
    const observer = new IO(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (!best) return;
        const raw = (best.target as HTMLElement).dataset.index;
        if (raw === undefined) return;
        setActiveIndexRef.current(Number(raw));
      },
      { threshold: [0.5, 0.75] },
    );
    observerRef.current = observer;
    for (const el of slideEls.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Observe slides materialised after the initial mount (the deck only grows).
  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;
    for (const el of slideEls.current.values()) observer.observe(el);
  }, [cards.length]);

  // Keyboard / non-touch navigation: ArrowDown/Space → next, ArrowUp → prev.
  // After the controller advances we scroll the target slide into view so the
  // visual position matches the active card (respecting reduced-motion).
  const pendingScrollRef = useRef<number | null>(null);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        pendingScrollRef.current = activeIndex + 1;
        next();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        pendingScrollRef.current = Math.max(0, activeIndex - 1);
        prev();
      }
    },
    [activeIndex, next, prev],
  );

  useEffect(() => {
    const target = pendingScrollRef.current;
    if (target === null) return;
    pendingScrollRef.current = null;
    const el = slideEls.current.get(target);
    if (el) scrollSlideIntoView(el, prefersReducedMotion());
  }, [activeIndex]);

  // SEAM (#106): first interaction will arm the per-game timer + engagement
  // signal. Today it is a no-op forwarded to the renderers' `onAttempt`.
  const handleAttempt = useCallback(() => {}, []);

  // SEAM (#106): record the resolution locally and do NOT advance — the user
  // swipes on. The gate keeps the feedback/explanation visible. Skip /
  // engage-then-abandon semantics + telemetry wiring land in #106.
  const resolutionsRef = useRef<Map<number, CardResolution>>(new Map());
  const handleResolve = useCallback(
    (index: number, resolution: CardResolution) => {
      resolutionsRef.current.set(index, resolution);
      onCardResolved?.(index, resolution);
    },
    [onCardResolved],
  );

  return (
    <section className="feed-screen" aria-labelledby="feed-screen-heading">
      <h1 id="feed-screen-heading" className="feed-screen__visually-hidden">
        Game feed
      </h1>
      <p className="feed-screen__visually-hidden">
        Swipe up for the next game and down for the previous, or use the Down and
        Up arrow keys.
      </p>
      <div
        className="feed-screen__scroller"
        data-testid="feed-scroller"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-labelledby="feed-screen-heading"
      >
        {cards.map((cardId, index) => (
          <FeedSlide
            key={index}
            index={index}
            cardId={cardId}
            windowed={Math.abs(index - activeIndex) <= WINDOW_RADIUS}
            registry={registry}
            getCardById={getCardById}
            feedId={feedId}
            activeAtMs={activeAtMs}
            registerSlide={registerSlide}
            onAttempt={handleAttempt}
            onResolve={handleResolve}
          />
        ))}
      </div>
    </section>
  );
}

type FeedSlideProps = {
  index: number;
  cardId: string;
  /** Whether this slide is close enough to the active card to mount its game. */
  windowed: boolean;
  registry: RendererRegistry;
  getCardById: (cardId: string) => LiquidCard | undefined;
  feedId: string;
  activeAtMs: number;
  registerSlide: (el: HTMLElement | null) => void;
  onAttempt: (signals?: Record<string, number | string | boolean>) => void;
  onResolve: (index: number, resolution: CardResolution) => void;
};

/**
 * One full-viewport slide. Inside the active window it mounts the card's
 * renderer (resolved via the registry — template-agnostic); outside it renders a
 * lightweight placeholder of the SAME height so scroll/snap geometry is correct
 * without paying to mount every game. Memoised so far-off placeholders don't
 * re-render as the active index moves.
 */
const FeedSlide = memo(function FeedSlide({
  index,
  cardId,
  windowed,
  registry,
  getCardById,
  feedId,
  activeAtMs,
  registerSlide,
  onAttempt,
  onResolve,
}: FeedSlideProps) {
  const card = windowed ? getCardById(cardId) : undefined;
  const Renderer = card ? resolveRenderer(registry, card) : undefined;

  // Mount the game only inside the window AND when the card + renderer resolve;
  // a missing card/renderer falls back to the placeholder (fail-safe, never a
  // crash — mirrors the controller's missing-renderer guard).
  if (card && Renderer) {
    const context: CardStartContext = {
      sessionId: feedId,
      cardIndex: index,
      activeAtMs,
      interactionEnabledAtMs: activeAtMs,
    };
    return (
      <div className="feed-slide" data-index={index} data-testid="feed-slide" ref={registerSlide}>
        {/* creatorHandle already includes the leading `@` (catalog convention). */}
        <p className="feed-slide__byline">{card.creatorHandle}</p>
        <div className="feed-slide__game" data-testid={`feed-game-${index}`}>
          {createElement(Renderer as TemplateRenderer<LiquidCard>, {
            key: `${feedId}:${index}`,
            card,
            context,
            onAttempt,
            onResolve: (resolution: CardResolution) => onResolve(index, resolution),
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="feed-slide" data-index={index} data-testid="feed-slide" ref={registerSlide}>
      <div
        className="feed-slide__placeholder"
        data-testid={`feed-placeholder-${index}`}
        aria-hidden="true"
      >
        Game loading…
      </div>
    </div>
  );
});
