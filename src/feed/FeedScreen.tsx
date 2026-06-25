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
 * registry's gate); the feed does NOT auto-advance — the user swipes on.
 *
 * Free-scroll semantics (#106, docs/FEED_DIRECTION.md §3.2): each game runs a
 * local lifecycle — not-engaged → engaged → resolved. The per-game COUNTDOWN now
 * arms on ACTIVATION (the game appearing/snapping into view), not on first
 * interaction, so an immediate-play puzzle is timed from the moment it is on
 * screen and answerable; pre-phase games (watch/preview/Start) still start their
 * countdown at their own answer-phase start (see `timerGatedCard`). ENGAGEMENT
 * (first interaction) is still tracked, but only to classify leave behaviour:
 * swiping past an un-engaged game is a SKIP (no resolution); engaging then
 * leaving before resolve is an ABANDONED attempt; a game that resolves
 * (correct/incorrect/timeout) is played. A game left active long enough to time
 * out resolves as a TIMEOUT even if never engaged (the countdown runs on appear).
 * The lifecycle callbacks below are the telemetry seam for #108 — this file emits
 * the signals but does NOT post telemetry.
 */

import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

import { getCardById as getCatalogCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import { resolveRenderer } from '../session/rendererRegistry';
import type {
  RendererRegistry,
  TemplateRenderer,
} from '../session/rendererRegistry';
import type { CardResolution, CardStartContext } from '../templates/contract';
import { getAnonymousUserId } from '../telemetry/anonymousUser';
import { resolveCategoryTheme } from '../ui/categoryTheme';
import { feedRegistry } from '../ui/feedRegistry';
import CardSocialRail from '../social/CardSocialRail';
import { CardScoreProvider } from './cardScoreContext';
import type { CardScore } from './scoring';
import type { FeedBatchSource } from './feedDeck';
import FeedScoreHud from './FeedScoreHud';
import type { ScoreStore } from './scoreStore';
import { useFeedController } from './useFeedController';
import { useFeedScore } from './useFeedScore';
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
   * Already-played cardIds for the signed-in user, skipped in the endless feed
   * (D2). Threaded into the controller's composition; ignored when an explicit
   * `source` is supplied. Best-effort — an empty/omitted set means "skip
   * nothing", and the composer's exhaustion fallback keeps the feed endless.
   */
  excludeCardIds?: ReadonlySet<string> | readonly string[];
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
   * Wiring seam: the feed instance id used as the per-card start `context.
   * sessionId` AND (in `FeedRoute`) as telemetry's `sessionId` envelope, so both
   * agree on one id per feed visit. Defaults to a fresh per-mount UUID.
   */
  feedId?: string;
  /**
   * Notified once per game when it becomes the ACTIVE/focused card (snaps into
   * view), NOT when merely mounted. Fires for the first card on mount and once
   * per index thereafter (no refire on revisit). Seam for #108 telemetry
   * (`Card_Rendered`).
   */
  onCardActive?: (index: number, cardId: string) => void;
  /**
   * Notified once per game when the player first ENGAGES it (first `onAttempt`).
   * Engagement arms the per-game timer and distinguishes a skip from an abandon.
   * Seam for #108 telemetry (`Card_Attempted`); fires at most once per index.
   */
  onCardEngaged?: (index: number, cardId: string) => void;
  /**
   * Notified once per game that is swiped past WITHOUT engaging it — a SKIP (no
   * score, no resolution). Seam for #108 telemetry (`Card_Skipped`).
   */
  onCardSkipped?: (index: number, cardId: string) => void;
  /**
   * Notified once per game that was engaged but left BEFORE it resolved — an
   * ABANDONED attempt (distinct from a clean skip). Seam for #108 telemetry
   * (`Card_Abandoned`).
   */
  onCardAbandoned?: (index: number, cardId: string) => void;
  /**
   * Notified once per local resolution (correct/incorrect/timeout). The feed
   * itself never advances on resolve; seam for #108 telemetry (`Card_Resolved`).
   */
  onCardResolved?: (index: number, resolution: CardResolution) => void;
  /**
   * Notified once per local resolution WITH the Phase-4 per-card score that the
   * SAME resolution path just computed (the HUD's points/streak for this card).
   * This is the accounts-pivot seam (a `game_plays` row is recorded from it) — it
   * rides the existing `handleResolve` flow, not a parallel observer, and stays
   * template-agnostic (the score is the universal points value, no `templateType`
   * branch). Fires at most once per index, after `onCardResolved`.
   */
  onCardScored?: (index: number, resolution: CardResolution, score: CardScore) => void;
  /**
   * Test seam: the Phase-4 best-run persistence store. Defaults to the real
   * best-effort `localStorage` store; pass `null` to disable persistence (tests).
   */
  scoreStore?: ScoreStore | null;
};

/**
 * Gate the per-game timer on ACTIVATION. Until a slide is the ACTIVE/focused
 * card we hand the renderer a card whose `timeLimitMs` is non-finite, so the
 * shared {@link useCardTimer} skips arming its countdown (the hook bails on a
 * non-finite limit). Once the slide becomes active the real card flows through
 * and the timer arms a fresh, full-duration countdown from the activation
 * instant — so the countdown starts the moment the game appears (the card snaps
 * into view), NOT on the player's first interaction.
 *
 * This is template-AGNOSTIC: `timeLimitMs` is the one timing primitive common to
 * every {@link LiquidCard} config, so a single override works for all renderers
 * with NO switch on `templateType`. The cast mirrors the one localized, sound
 * escape hatch documented in `rendererRegistry.ts`: the override preserves the
 * card's discriminant and every other field, so the result is the same card
 * variant with a swapped time limit.
 *
 * IMMEDIATE-PLAY vs PRE-PHASE — why activation-gating is correct for BOTH, with
 * no per-template flag:
 *  - IMMEDIATE-PLAY games (spot_it, tiny_logic, quick_math, …) pass `card`
 *    straight into {@link useCardTimer} on mount, so flipping the limit finite on
 *    activation arms their countdown the instant the card appears (the requested
 *    behaviour).
 *  - PRE-PHASE games (memory_sequence's watch, what_changed's preview, n_back /
 *    color_word / rule_flip's Start→stream) mount their `useCardTimer` ONLY
 *    inside the answer-phase subtree, which renders AFTER the pre-phase ends. So
 *    even though this override makes the limit finite as soon as they activate,
 *    their inner timer does not exist until the answer phase begins — it arms at
 *    the real round-start, never during the pre-phase. The pre-phase itself is
 *    independently held by each renderer's `isActive` gate (or its Start button),
 *    so a pre-mounted neighbour never advances either.
 *
 * Neighbour safety: a windowed-but-not-focused slide stays non-finite, so its
 * timer can never run — only the ACTIVE slide's timer arms. Per-slide latching of
 * resolutions (see `handleResolve`) drops any phantom timeout from a re-armed
 * timer when a slide re-activates.
 */
function timerGatedCard(card: LiquidCard, armed: boolean): LiquidCard {
  if (armed) return card;
  return {
    ...card,
    config: { ...card.config, timeLimitMs: Number.POSITIVE_INFINITY },
  } as LiquidCard;
}

export default function FeedScreen({
  registry = feedRegistry,
  source,
  excludeCardIds,
  anonymousUserId,
  getCardById = getCatalogCardById,
  now,
  feedId: feedIdProp,
  onCardActive,
  onCardEngaged,
  onCardSkipped,
  onCardAbandoned,
  onCardResolved,
  onCardScored,
  scoreStore,
}: FeedScreenProps) {
  // Resolve the real persisted anonymous id ONCE per mount (Technical Design
  // §10); tests inject a fixed id for deterministic composition.
  const [resolvedAnonymousUserId] = useState(
    () => anonymousUserId ?? getAnonymousUserId(),
  );
  // A per-mount feed instance id + a single "active at" stamp. This stamp is now
  // only a FALLBACK origin for the card start context: each slide stamps its own
  // per-activation instant and arms its timer from there (see FeedSlide), so the
  // countdown starts when the game appears.
  const nowFn = now ?? Date.now;
  const [feedId] = useState(
    () =>
      feedIdProp ??
      globalThis.crypto?.randomUUID?.() ??
      `feed-${resolvedAnonymousUserId}`,
  );
  const [activeAtMs] = useState(() => nowFn());

  const { cards, activeIndex, setActiveIndex, next, prev } = useFeedController({
    anonymousUserId: resolvedAnonymousUserId,
    source,
    excludeCardIds,
  });

  // Phase 4: the GAME-POINTS accumulator. It folds each resolution through the
  // pure scoring core (template-agnostic), drives the HUD, and exposes the per-
  // card score the result card reads via context. It hooks the SAME resolution
  // path the feed already uses (see `handleResolve`), not a parallel observer.
  const score = useFeedScore({ getCardById, store: scoreStore });

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
  // Scroll the already-prefetched target inside the feed container itself so
  // the document never moves and CSS snap owns the final resting position.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        const target = activeIndex + 1;
        event.currentTarget.scrollTop =
          target * event.currentTarget.clientHeight;
        next();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const target = Math.max(0, activeIndex - 1);
        event.currentTarget.scrollTop =
          target * event.currentTarget.clientHeight;
        prev();
      }
    },
    [activeIndex, next, prev],
  );

  // Per-game lifecycle (#106), tracked in refs so it never triggers a render and
  // each transition latches exactly once per game instance:
  //   - `engagedRef`: indices the player has interacted with (≥1 `onAttempt`).
  //   - `resolutionsRef`: indices that have resolved (played to completion).
  //   - `skippedRef` / `abandonedRef`: indices already classified on leave. They
  //     latch INDEPENDENTLY (#108): a game skipped, then revisited + engaged +
  //     left again must still emit the honest `onCardAbandoned` even though it was
  //     previously skipped — while neither classification ever fires twice.
  const engagedRef = useRef<Set<number>>(new Set());
  const resolutionsRef = useRef<Map<number, CardResolution>>(new Map());
  const skippedRef = useRef<Set<number>>(new Set());
  const abandonedRef = useRef<Set<number>>(new Set());

  // Stable refs for the long-lived leave effect + the per-slide engage callback,
  // so neither re-creates as the parent's props/deck change (file convention).
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onCardSkippedRef = useRef(onCardSkipped);
  onCardSkippedRef.current = onCardSkipped;
  const onCardAbandonedRef = useRef(onCardAbandoned);
  onCardAbandonedRef.current = onCardAbandoned;
  const onCardActiveRef = useRef(onCardActive);
  onCardActiveRef.current = onCardActive;

  // A game becoming ACTIVE (snapping into view) is its `Card_Rendered` moment
  // (#108, docs/FEED_DIRECTION.md §3.1) — distinct from mounting. Fire the
  // activation seam for the first card on mount and once per index thereafter;
  // latched per index so revisiting a game never refires (matches the telemetry
  // factory's per-index Card_Rendered latch).
  const activatedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (activatedRef.current.has(activeIndex)) return;
    const cardId = cardsRef.current[activeIndex];
    if (cardId === undefined) return;
    activatedRef.current.add(activeIndex);
    onCardActiveRef.current?.(activeIndex, cardId);
  }, [activeIndex]);

  // First interaction ENGAGES a game: record it and fire the engage seam once.
  const handleEngage = useCallback(
    (index: number, cardId: string) => {
      if (engagedRef.current.has(index)) return;
      engagedRef.current.add(index);
      onCardEngaged?.(index, cardId);
    },
    [onCardEngaged],
  );

  // Record the resolution locally and do NOT advance — the user swipes on; the
  // gate keeps the feedback/explanation visible. A resolved game is "played", so
  // leaving it is neither a skip nor an abandon.
  //
  // Idempotent per game instance — a given slide resolves AT MOST ONCE:
  //   - BLOCKER guard: the engaging tap on a single-tap template flips this card's
  //     `timeLimitMs` from ∞ (timer-gated off) to finite in the SAME tick it
  //     resolves, which re-runs `useCardTimer`'s arm effect, resets its
  //     `resolvedRef`, and arms a fresh countdown on an already-resolved slide.
  //     That phantom timer later forwards a second ['timeout'] resolution. The
  //     `resolutionsRef.has` short-circuit drops it so we never double-signal.
  //   - MAJOR guard: an engaged-then-abandoned slide stays mounted within
  //     `WINDOW_RADIUS`, so its armed timer keeps running and would later fire a
  //     `timeout` for a game we already classified as abandoned on leave. Once a
  //     slide has been classified (skip OR abandon) we ignore any later resolution
  //     for that index.
  const handleResolve = useCallback(
    (index: number, resolution: CardResolution) => {
      if (resolutionsRef.current.has(index)) return; // already resolved once.
      if (skippedRef.current.has(index) || abandonedRef.current.has(index)) {
        return; // already classified on leave — not a live resolution.
      }
      resolutionsRef.current.set(index, resolution);
      // Phase 4: fold into the GAME-POINTS accumulator (idempotent per index in
      // the hook too) BEFORE the telemetry seam, so the per-card score is recorded
      // by the time the result card mounts via the feedback gate.
      scoreOnResolvedRef.current(index, resolution);
      onCardResolved?.(index, resolution);
      // Accounts pivot: surface the just-computed per-card score on the SAME path
      // so a `game_plays` row can be recorded with the HUD's points. Reads it back
      // from the score hook (set synchronously above), so points always agree.
      const cardScore = getCardScoreRef.current(index);
      if (cardScore) onCardScoredRef.current?.(index, resolution, cardScore);
    },
    [onCardResolved],
  );

  // Stable refs for the score lookup + the accounts-pivot seam used in the stable
  // `handleResolve` (so it never re-creates as those props change).
  const getCardScoreRef = useRef(score.getCardScore);
  getCardScoreRef.current = score.getCardScore;
  const onCardScoredRef = useRef(onCardScored);
  onCardScoredRef.current = onCardScored;

  // Stable handle to the score hook's resolution folder for `handleResolve`.
  const scoreOnResolvedRef = useRef(score.onCardResolved);
  scoreOnResolvedRef.current = score.onCardResolved;

  // When the active game changes, classify the game we LEFT (#106): a resolved
  // game is done; an engaged-but-unresolved game is an ABANDONED attempt; an
  // un-engaged game is a clean SKIP. Latched per index so it fires at most once.
  const prevActiveRef = useRef(activeIndex);
  useEffect(() => {
    const left = prevActiveRef.current;
    if (left === activeIndex) return;
    prevActiveRef.current = activeIndex;
    if (resolutionsRef.current.has(left)) return; // played → not skip/abandon.
    const cardId = cardsRef.current[left];
    if (cardId === undefined) return;
    if (engagedRef.current.has(left)) {
      // Engaged-then-left → an ABANDONED attempt. Latched independently of skip
      // so a previously-skipped, then-engaged game can still emit it once (#108).
      if (abandonedRef.current.has(left)) return;
      abandonedRef.current.add(left);
      onCardAbandonedRef.current?.(left, cardId);
    } else {
      // Left without engaging → a clean SKIP, at most once per instance.
      if (skippedRef.current.has(left)) return;
      skippedRef.current.add(left);
      onCardSkippedRef.current?.(left, cardId);
    }
  }, [activeIndex]);

  // The per-card score lookup handed to the feedback gate via context. Stable
  // identity (the hook's `getCardScore` is stable); the gate re-reads on the
  // hook's `version` bump, which re-renders the tree on each resolution.
  const getCardScore = score.getCardScore;

  return (
    <CardScoreProvider value={getCardScore}>
      <section className="feed-screen" aria-labelledby="feed-screen-heading">
        <h1 id="feed-screen-heading" className="feed-screen__visually-hidden">
          Game feed
        </h1>
        <p className="feed-screen__visually-hidden">
          Swipe up for the next game and down for the previous, or use the Down
          and Up arrow keys.
        </p>
        {/* Phase 4: a small, unobtrusive game-points HUD (points + current
            streak). Accent-aware, guardrail-safe copy. */}
        <FeedScoreHud
          totalPoints={score.state.totalPoints}
          currentStreak={score.state.currentStreak}
        />
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
              active={index === activeIndex}
              registry={registry}
              getCardById={getCardById}
              feedId={feedId}
              activeAtMs={activeAtMs}
              now={nowFn}
              registerSlide={registerSlide}
              onEngage={handleEngage}
              onResolve={handleResolve}
            />
          ))}
        </div>
      </section>
    </CardScoreProvider>
  );
}

type FeedSlideProps = {
  index: number;
  cardId: string;
  /** Whether this slide is close enough to the active card to mount its game. */
  windowed: boolean;
  /**
   * Whether this slide is THE active/focused card (snapped into view), as opposed
   * to a windowed-but-pre-mounted neighbour. Threaded to the renderer as `isActive`
   * so timed PRE-phases (e.g. `memory_sequence`'s watch flash, `what_changed`'s
   * preview) hold until activation rather than elapsing off-screen. Template-
   * agnostic — the feed never branches on `templateType`.
   */
  active: boolean;
  registry: RendererRegistry;
  getCardById: (cardId: string) => LiquidCard | undefined;
  feedId: string;
  activeAtMs: number;
  /** Wall clock for stamping this slide's activation instant (timer origin). */
  now: () => number;
  registerSlide: (el: HTMLElement | null) => void;
  /** Notify the feed that this game was engaged (first interaction). */
  onEngage: (index: number, cardId: string) => void;
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
  active,
  registry,
  getCardById,
  feedId,
  activeAtMs,
  now,
  registerSlide,
  onEngage,
  onResolve,
}: FeedSlideProps) {
  const card = windowed ? getCardById(cardId) : undefined;
  const Renderer = card ? resolveRenderer(registry, card) : undefined;

  // The per-slide ACTIVATION instant — null until this slide first becomes the
  // focused card. The countdown now arms on activation (the game APPEARING), so
  // this is the timing origin for the card start context AND the gate that flips
  // `timeLimitMs` finite. Latched once so re-activating a slide keeps its
  // original origin (and `timerGatedCard` keeps the limit finite from then on).
  const [activatedAtMs, setActivatedAtMs] = useState<number | null>(null);
  useEffect(() => {
    if (!active || activatedAtMs !== null) return;
    setActivatedAtMs(now());
  }, [active, activatedAtMs, now]);

  // The engage instant is still tracked, but ONLY to drive the skip-vs-abandon
  // telemetry classification (first interaction) — it no longer gates the timer.
  // A ref guards the one-time engage notification independently of render timing.
  const engagedOnceRef = useRef(false);
  const handleAttempt = useCallback(
    (_signals?: Record<string, number | string | boolean>) => {
      if (engagedOnceRef.current) return;
      engagedOnceRef.current = true;
      onEngage(index, cardId);
    },
    [onEngage, index, cardId],
  );

  // Mount the game only inside the window AND when the card + renderer resolve;
  // a missing card/renderer falls back to the placeholder (fail-safe, never a
  // crash — mirrors the controller's missing-renderer guard).
  if (card && Renderer) {
    // Arm the timer once the slide has activated (the countdown starts on
    // appear). Until then the card carries a non-finite limit so a pre-mounted
    // neighbour's timer never runs. `armed` latches on first activation.
    const armed = activatedAtMs !== null;
    // The timing origin is the slide's own activation instant (not the stale
    // per-feed mount stamp), so `elapsedMs` measures from when THIS game appeared
    // and equals the countdown duration on timeout. For IMMEDIATE-PLAY games the
    // puzzle is answerable on appear, so `interactionEnabledAtMs` is also the
    // activation instant (TTI measures from appear). PRE-PHASE renderers override
    // `interactionEnabledAtMs` themselves with their answer-phase start, so their
    // TTI / `interactionElapsedMs` still exclude the pre-phase.
    const originMs = activatedAtMs ?? activeAtMs;
    const context: CardStartContext = {
      sessionId: feedId,
      cardIndex: index,
      activeAtMs: originMs,
      interactionEnabledAtMs: originMs,
    };
    return (
      <div
        className="feed-slide"
        data-index={index}
        data-testid="feed-slide"
        // Derive the slide's accent generically from the card's category and seed
        // the local `--accent*` aliases (Phase 3). Every descendant — the
        // category chip, the game's selected/active states, the primary button,
        // the result card — reads ONE accent, so the feed stays template- and
        // category-agnostic (no branching on `templateType`). The category-tinted
        // gradient wash is painted by `.feed-slide` from `--accent-tint`.
        style={slideAccentStyle(card.category)}
        ref={registerSlide}
      >
        <div className="feed-slide__ambient" aria-hidden="true">
          <span className="feed-slide__orb feed-slide__orb--one" />
          <span className="feed-slide__orb feed-slide__orb--two" />
          <span className="feed-slide__grid-texture" />
        </div>
        <SlideTopChrome
          category={card.category}
          difficulty={card.difficulty}
          estimatedSeconds={card.estimatedSeconds}
        />
        <div
          className="feed-slide__game"
          data-testid={`feed-game-${index}`}
          data-template={card.templateType}
          data-difficulty={card.difficulty}
          // Phase 5: drive the activation-gated entrance animation. Only the
          // focused slide carries `data-active="true"`, so a pre-mounted
          // neighbour stays still until it actually snaps into view (motion is
          // gated on activation, NOT mount — see FeedScreen.css). Visual-only;
          // it never feeds back into timing/`isActive` game logic.
          data-active={active ? 'true' : 'false'}
        >
          <div className="feed-slide__game-light" aria-hidden="true">
            <span className="feed-slide__game-orbit" />
            <span className="feed-slide__game-sweep" />
          </div>
          <GamePostChrome
            templateType={card.templateType}
            mechanic={card.puzzleDna.mechanic}
            difficulty={card.difficulty}
          />
          <div className="feed-slide__game-content">
            {createElement(Renderer as TemplateRenderer<LiquidCard>, {
              key: `${feedId}:${index}`,
              // Until the slide activates, the renderer's timer stays disarmed;
              // on activation the real finite limit flows through and the
              // countdown starts (immediate-play arms now; pre-phase renderers
              // arm their inner timer at their own answer-phase start).
              card: timerGatedCard(card, armed),
              context,
              // Activation signal (#137 review fix): only the focused slide is
              // active. Renderers with a timed PRE-phase (memory_sequence's watch,
              // what_changed's preview) hold until this is true, so a pre-mounted
              // slide's pre-phase cannot elapse off-screen. Template-agnostic; most
              // renderers ignore it.
              isActive: active,
              onAttempt: handleAttempt,
              onResolve: (resolution: CardResolution) =>
                onResolve(index, resolution),
            })}
          </div>
        </div>
        {/* Per-card social surface (likes + comments) — a FEED-LAYER concern
            keyed by cardId, NOT per-template (no switch on templateType, never
            touches the renderer's logic). Activation-gated: it loads only when
            this slide is the focused one (`active`), so pre-mounted neighbours
            don't fetch. Renders nothing when there's no social provider. */}
        <div className="feed-slide__social">
          <CardSocialRail cardId={cardId} active={active} />
        </div>
        <SlideBottomChrome creatorHandle={card.creatorHandle} index={index} />
      </div>
    );
  }

  return (
    <div
      className="feed-slide"
      data-index={index}
      data-testid="feed-slide"
      ref={registerSlide}
    >
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

/**
 * Seed the slide's local accent aliases from the card's category (Phase 3). The
 * values live in `tokens.css`; {@link resolveCategoryTheme} maps the category to
 * its `--cat-*` token references and we assign them to the generic `--accent*`
 * custom properties the descendants read. Typed via CSS custom-property keys.
 */
function slideAccentStyle(category: string): CSSProperties {
  const t = resolveCategoryTheme(category);
  return {
    '--accent': t.accent,
    '--accent-deep': t.accentDeep,
    '--accent-tint': t.accentTint,
  } as CSSProperties;
}

/** Format a category id ("visual_attention") into a chip label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Generic human-readable label for a template id ("spot_it" → "Spot it"). */
function templateLabel(templateType: string): string {
  return categoryLabel(templateType);
}

function templateDescription(templateType: string): string | null {
  if (templateType === 'prism_path') {
    return 'Rotate mirrors to guide a beam from IN to the star while avoiding blockers. Tap mirrors to flip / and \\, then fire when the preview reaches the target.';
  }
  return null;
}

function difficultyLevel(difficulty: string): number {
  if (difficulty === 'extremely_hard') return 5;
  if (difficulty === 'hard') return 4;
  if (difficulty === 'medium') return 3;
  if (difficulty === 'easy') return 2;
  return 1;
}

function templateMonogram(templateType: string): string {
  return templateType
    .split('_')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Stable nine-cell fingerprint derived from the template id; no template switch. */
function templateFingerprint(templateType: string): readonly boolean[] {
  let hash = 2166136261;
  for (const char of templateType) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: 9 }, (_, index) => {
    const bit = (hash >>> (index % 24)) & 1;
    return bit === 1 || index === 4;
  });
}

/**
 * Identity strip for the game object. The template name and authored mechanic
 * replace the redundant "Playable" badge; the deterministic fingerprint gives
 * every template a recognizable visual signature without branching in the feed.
 */
function GamePostChrome({
  templateType,
  mechanic,
  difficulty,
}: {
  templateType: string;
  mechanic: string;
  difficulty: string;
}) {
  const level = difficultyLevel(difficulty);
  const fingerprint = templateFingerprint(templateType);
  const label = templateLabel(templateType);
  const description = templateDescription(templateType);
  return (
    <div className="feed-slide__game-kicker">
      <span className="feed-slide__template-mark" aria-hidden="true">
        <span className="feed-slide__template-monogram">
          {templateMonogram(templateType)}
        </span>
        <span className="feed-slide__fingerprint">
          {fingerprint.map((filled, index) => (
            <span key={index} data-filled={filled ? 'true' : 'false'} />
          ))}
        </span>
      </span>
      <span className="feed-slide__template-copy">
        <span
          className="feed-slide__template-label"
          data-description={description ?? undefined}
          data-has-description={description ? 'true' : 'false'}
          title={description ?? undefined}
          tabIndex={description ? 0 : undefined}
          aria-label={description ? `${label}. ${description}` : undefined}
        >
          {label}
        </span>
        <span className="feed-slide__mechanic-label">
          {categoryLabel(mechanic.replace(/-/g, '_'))}
        </span>
      </span>
      <span
        className="feed-slide__level"
        aria-label={`${categoryLabel(difficulty)} difficulty`}
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            aria-hidden="true"
            data-filled={step <= level ? 'true' : 'false'}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * Top-of-slide chrome (Phase 3): a small category CHIP, accent-tinted from the
 * slide's `--accent`. It names the performance category in modest, guardrail-safe
 * copy (no IQ/trait language) and is purely informative — colour is never the sole
 * signal (the chip text carries the meaning). Decorative to assistive tech beyond
 * its text label.
 */
function SlideTopChrome({
  category,
  difficulty,
  estimatedSeconds,
}: {
  category: string;
  difficulty: string;
  estimatedSeconds: number;
}) {
  return (
    <div className="feed-slide__top">
      <span className="feed-slide__brand">
        <span className="feed-slide__brand-mark" aria-hidden="true">
          L
        </span>
        <span className="feed-slide__brand-name">LumaLoop</span>
        <span className="feed-slide__brand-mode">Discover</span>
      </span>
      <span className="feed-slide__meta">
        <span className="feed-slide__chip">{categoryLabel(category)}</span>
        <span className="feed-slide__meta-pill">
          {categoryLabel(difficulty)}
        </span>
        <span className="feed-slide__meta-pill">~{estimatedSeconds}s</span>
      </span>
    </div>
  );
}

/**
 * Bottom-of-slide social chrome (Phase 3, mirroring mobile #135): the creator
 * byline styled like a feed author — an accent monogram avatar + the `@handle` —
 * on the left, and an animated "Swipe up" cue on the right. The byline text is the
 * meaning; the avatar is decorative. The swipe cue is hidden from assistive tech
 * (the feed landmark already carries the swipe instruction) and its motion degrades
 * under `prefers-reduced-motion` (global.css gates animation).
 */
function SlideBottomChrome({
  creatorHandle,
  index,
}: {
  creatorHandle: string;
  index: number;
}) {
  // creatorHandle already includes the leading `@` (catalog convention); the
  // monogram is the first letter of the handle, ignoring that `@`.
  const monogram = (creatorHandle.replace(/^@/, '')[0] ?? '?').toUpperCase();
  return (
    <div className="feed-slide__chrome">
      <span className="feed-slide__author">
        <span className="feed-slide__avatar" aria-hidden="true">
          {monogram}
        </span>
        {/* creatorHandle already carries the leading `@` (catalog convention). */}
        <span className="feed-slide__author-copy">
          <span
            className="feed-slide__byline"
            data-testid={`feed-byline-${index}`}
          >
            {creatorHandle}
          </span>
          <span className="feed-slide__creator-caption">
            Original playable challenge
          </span>
        </span>
      </span>
      <span className="feed-slide__swipe" aria-hidden="true">
        Swipe up
        <span className="feed-slide__swipe-chevron">⌃</span>
      </span>
    </div>
  );
}
