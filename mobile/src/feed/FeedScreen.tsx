/**
 * FeedScreen — full-screen vertical PAGING feed for React Native (ADO #127,
 * docs/FEED_DIRECTION.md §3.1). The native counterpart of the web
 * `src/feed/FeedScreen.tsx`: one game fills the viewport, native vertical swipe is
 * the next/prev gesture, and a snapping `FlatList` (`pagingEnabled` + per-item
 * height) settles each game to the top. There is no progress bar and no "N of M"
 * — the feed is endless.
 *
 * Separation of concerns (CLAUDE.md §4): this surface owns ONLY presentation,
 * paging, and which card is active. {@link useFeedController} owns the endless deck
 * + active index; the per-template renderers own card interaction. FeedScreen
 * resolves a renderer for each card via the injected {@link RendererRegistry} only
 * — there is NO switch on `templateType` anywhere, so adding a new game (M4) never
 * touches this file (CLAUDE.md §6). M3 injects a template-agnostic STUB registry.
 *
 * Active-card detection: a game becomes ACTIVE when it snaps into view, detected
 * via `onViewableItemsChanged`; FeedScreen calls `setActiveIndex`, which
 * materialises more cards ahead (endless). Only the active card ±`WINDOW_RADIUS`
 * mount their real renderer; the rest render a same-height placeholder (perf).
 *
 * Free-scroll semantics (#106 parity, docs/FEED_DIRECTION.md §3.2): each game runs
 * a local lifecycle — not-engaged → engaged → resolved — and the per-game timer
 * arms on ENGAGEMENT (first interaction), not on becoming active. Swiping past an
 * un-engaged game is a SKIP (no resolution); engaging then leaving before resolve
 * is an ABANDONED attempt; a played game resolves correct/incorrect/timeout
 * unchanged. The lifecycle callbacks are the telemetry seam for M5 — this file
 * emits the signals but does NOT post telemetry.
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';

import { getCardById as getCatalogCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { CardResolution, CardStartContext } from '../core/templates/contract';
import { resolveRenderer } from './rendererRegistry';
import type { RendererRegistry, TemplateRenderer } from './rendererRegistry';
import { stubRendererRegistry } from './stubRenderer';
import type { FeedBatchSource } from '../core/feed/feedDeck';
import { useFeedController } from './useFeedController';

/** Slides within this many of the active index mount their real renderer. */
const WINDOW_RADIUS = 1;

/**
 * A game counts as active once it is at least this % visible. With per-item
 * full-screen height + paging, exactly one item clears the bar at rest.
 * Module-constant so the `FlatList` viewability config stays referentially stable
 * (changing it on the fly is unsupported by `VirtualizedList`).
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

/**
 * Default anonymous seed for deck composition. Telemetry's persisted anonymous id
 * is M5; until then the feed seeds from a stable constant so composition is
 * deterministic. SEAM: M5 injects the real persisted id via `anonymousUserId`.
 */
const DEFAULT_ANONYMOUS_USER_ID = 'anonymous';

export type FeedScreenProps = {
  /**
   * Test/wiring seam: maps each `templateType` to its renderer (dependency
   * inversion). Defaults to the M3 {@link stubRendererRegistry}; M4 swaps in the
   * real renderers. Must be referentially stable.
   */
  registry?: RendererRegistry;
  /** Test seam: deterministic feed batch source. Defaults to seeded catalog. */
  source?: FeedBatchSource;
  /**
   * The anonymous id seeding deck composition. Defaults to a stable placeholder
   * (telemetry identity is M5).
   */
  anonymousUserId?: string;
  /** Test seam: cardId → card resolver. Defaults to the authored catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** Test seam: wall clock for the per-card start context. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Wiring seam: the feed instance id used as the per-card start
   * `context.sessionId` (and, in M5, telemetry's `sessionId` envelope) so both
   * agree on one id per feed visit. Defaults to a fresh per-mount id.
   */
  feedId?: string;
  /**
   * Notified once per game when it becomes the ACTIVE/focused card (snaps into
   * view), NOT when merely mounted. Fires for the first card on mount and once per
   * index thereafter (no refire on revisit). Seam for M5 telemetry (`Card_Rendered`).
   */
  onCardActive?: (index: number, cardId: string) => void;
  /**
   * Notified once per game when the player first ENGAGES it (first `onAttempt`).
   * Engagement arms the per-game timer and distinguishes a skip from an abandon.
   * Seam for M5 telemetry (`Card_Attempted`); fires at most once per index.
   */
  onCardEngaged?: (index: number, cardId: string) => void;
  /**
   * Notified once per game that is swiped past WITHOUT engaging it — a SKIP (no
   * score, no resolution). Seam for M5 telemetry (`Card_Skipped`).
   */
  onCardSkipped?: (index: number, cardId: string) => void;
  /**
   * Notified once per game that was engaged but left BEFORE it resolved — an
   * ABANDONED attempt (distinct from a clean skip). Seam for M5 (`Card_Abandoned`).
   */
  onCardAbandoned?: (index: number, cardId: string) => void;
  /**
   * Notified once per local resolution (correct/incorrect/timeout). The feed
   * itself never advances on resolve; seam for M5 telemetry (`Card_Resolved`).
   */
  onCardResolved?: (index: number, resolution: CardResolution) => void;
};

/**
 * #106: gate the per-game timer on ENGAGEMENT. Until the player interacts with a
 * game we hand the renderer a card whose `timeLimitMs` is non-finite, so the
 * shared {@link useCardTimer} skips arming its countdown. On the first interaction
 * the real card flows through and the timer arms a fresh, full-duration countdown
 * from the engage instant.
 *
 * Template-AGNOSTIC: `timeLimitMs` is the one timing primitive common to every
 * {@link LiquidCard} config, so a single override works for all renderers with NO
 * switch on `templateType`. The override preserves the card's discriminant and
 * every other field, so the result is the same card variant with a swapped limit.
 */
function timerGatedCard(card: LiquidCard, engaged: boolean): LiquidCard {
  if (engaged) return card;
  return {
    ...card,
    config: { ...card.config, timeLimitMs: Number.POSITIVE_INFINITY },
  } as LiquidCard;
}

/** A best-effort per-mount feed id; RN engines may lack `crypto.randomUUID`. */
function makeFeedId(anonymousUserId: string, stamp: number): string {
  return globalThis.crypto?.randomUUID?.() ?? `feed-${anonymousUserId}-${stamp}`;
}

export default function FeedScreen({
  registry = stubRendererRegistry,
  source,
  anonymousUserId = DEFAULT_ANONYMOUS_USER_ID,
  getCardById = getCatalogCardById,
  now,
  feedId: feedIdProp,
  onCardActive,
  onCardEngaged,
  onCardSkipped,
  onCardAbandoned,
  onCardResolved,
}: FeedScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  // Fallback keeps per-item layout non-zero in headless test envs where the
  // window dimensions can report 0 (real devices always report a real height).
  const slideHeight = windowHeight || 800;

  const nowFn = now ?? Date.now;
  // A per-mount feed instance id + a single "active at" stamp: the `elapsedMs`
  // origin for the card start context. The interaction timer no longer arms from
  // here — each slide arms it from its own engage instant (#106).
  const [activeAtMs] = useState(() => nowFn());
  const [feedId] = useState(
    () => feedIdProp ?? makeFeedId(anonymousUserId, activeAtMs),
  );

  const { cards, activeIndex, setActiveIndex } = useFeedController({
    anonymousUserId,
    source,
  });

  // Stable handle to `setActiveIndex` for the once-created viewability callback
  // (`VirtualizedList` does not support changing `onViewableItemsChanged` on the
  // fly, so the handler must keep one identity for the feed's lifetime).
  const setActiveIndexRef = useRef(setActiveIndex);
  setActiveIndexRef.current = setActiveIndex;

  // When slides snap into view, the most-visible one becomes active — which
  // materialises more cards ahead → endless. Created once; reads the live
  // controller handle through a ref.
  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let bestIndex: number | null = null;
      for (const token of viewableItems) {
        if (!token.isViewable || token.index === null) continue;
        // Deterministic pick: the lowest viewable index (at rest only one item
        // clears the visibility threshold anyway).
        if (bestIndex === null || token.index < bestIndex) {
          bestIndex = token.index;
        }
      }
      if (bestIndex !== null) setActiveIndexRef.current(bestIndex);
    },
  );

  // --- Per-game lifecycle (#106) -------------------------------------------
  // Tracked in refs so transitions never trigger a render and each latches at
  // most once per game instance:
  //   - `engagedRef`: indices the player interacted with (≥1 `onAttempt`).
  //   - `resolutionsRef`: indices that resolved (played to completion).
  //   - `skippedRef` / `abandonedRef`: indices already classified on leave. They
  //     latch INDEPENDENTLY: a game skipped, then revisited + engaged + left again
  //     must still emit the honest `onCardAbandoned` — while neither classification
  //     ever fires twice.
  const engagedRef = useRef<Set<number>>(new Set());
  const resolutionsRef = useRef<Map<number, CardResolution>>(new Map());
  const skippedRef = useRef<Set<number>>(new Set());
  const abandonedRef = useRef<Set<number>>(new Set());

  // Stable refs for the leave effect + the activation effect so neither re-creates
  // as the parent's props/deck change.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onCardSkippedRef = useRef(onCardSkipped);
  onCardSkippedRef.current = onCardSkipped;
  const onCardAbandonedRef = useRef(onCardAbandoned);
  onCardAbandonedRef.current = onCardAbandoned;
  const onCardActiveRef = useRef(onCardActive);
  onCardActiveRef.current = onCardActive;

  // A game becoming ACTIVE (snapping into view) is its `Card_Rendered` moment —
  // distinct from mounting. Fire the activation seam for the first card on mount
  // and once per index thereafter; latched per index so revisiting never refires.
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

  // Record the resolution locally and do NOT advance — the user swipes on. A
  // resolved game is "played", so leaving it is neither a skip nor an abandon.
  //
  // Idempotent per game instance — a given slide resolves AT MOST ONCE:
  //   - the engaging tap on a single-tap template flips this card's `timeLimitMs`
  //     ∞→finite in the SAME tick it resolves, re-arming a fresh countdown on an
  //     already-resolved slide; that phantom timeout is dropped by the
  //     `resolutionsRef.has` short-circuit.
  //   - an engaged-then-abandoned slide stays mounted within `WINDOW_RADIUS`, so
  //     its armed timer keeps running and would later fire a `timeout` for a game
  //     already classified as abandoned on leave — also dropped here.
  const handleResolve = useCallback(
    (index: number, resolution: CardResolution) => {
      if (resolutionsRef.current.has(index)) return; // already resolved once.
      if (skippedRef.current.has(index) || abandonedRef.current.has(index)) {
        return; // already classified on leave — not a live resolution.
      }
      resolutionsRef.current.set(index, resolution);
      onCardResolved?.(index, resolution);
    },
    [onCardResolved],
  );

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
      // Engaged-then-left → an ABANDONED attempt. Latched independently of skip so
      // a previously-skipped, then-engaged game can still emit it once.
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

  const renderItem = useCallback(
    ({ item: cardId, index }: ListRenderItemInfo<string>) => (
      <FeedSlide
        index={index}
        cardId={cardId}
        height={slideHeight}
        windowed={Math.abs(index - activeIndex) <= WINDOW_RADIUS}
        registry={registry}
        getCardById={getCardById}
        feedId={feedId}
        activeAtMs={activeAtMs}
        now={nowFn}
        onEngage={handleEngage}
        onResolve={handleResolve}
      />
    ),
    [
      slideHeight,
      activeIndex,
      registry,
      getCardById,
      feedId,
      activeAtMs,
      nowFn,
      handleEngage,
      handleResolve,
    ],
  );

  return (
    <FlatList
      testID="feed-list"
      style={styles.list}
      data={cards}
      keyExtractor={keyForIndex}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({
        length: slideHeight,
        offset: slideHeight * index,
        index,
      })}
      pagingEnabled
      snapToInterval={slideHeight}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChangedRef.current}
      viewabilityConfig={VIEWABILITY_CONFIG}
      accessibilityLabel="Game feed. Swipe up for the next game, down for the previous."
    />
  );
}

/** Stable keyExtractor — slide identity is its position in the endless deck. */
function keyForIndex(_cardId: string, index: number): string {
  return String(index);
}

type FeedSlideProps = {
  index: number;
  cardId: string;
  height: number;
  /** Whether this slide is close enough to the active card to mount its game. */
  windowed: boolean;
  registry: RendererRegistry;
  getCardById: (cardId: string) => LiquidCard | undefined;
  feedId: string;
  activeAtMs: number;
  /** Wall clock for stamping this slide's engage instant (#106). */
  now: () => number;
  /** Notify the feed that this game was engaged (first interaction). */
  onEngage: (index: number, cardId: string) => void;
  onResolve: (index: number, resolution: CardResolution) => void;
};

/**
 * One full-viewport slide. Inside the active window it mounts the card's renderer
 * (resolved via the registry — template-agnostic); outside it renders a
 * lightweight placeholder of the SAME height so paging geometry is correct without
 * paying to mount every game. Memoised so far-off placeholders don't re-render as
 * the active index moves.
 */
const FeedSlide = memo(function FeedSlide({
  index,
  cardId,
  height,
  windowed,
  registry,
  getCardById,
  feedId,
  activeAtMs,
  now,
  onEngage,
  onResolve,
}: FeedSlideProps) {
  const card = windowed ? getCardById(cardId) : undefined;
  const Renderer = card ? resolveRenderer(registry, card) : undefined;

  // #106: the engage instant — null until the player first interacts with this
  // game. Local to the slide so engagement (and thus timer-arming) is per-game. A
  // ref guards the one-time engage notification independently of render timing.
  const [engageAtMs, setEngageAtMs] = useState<number | null>(null);
  const engagedOnceRef = useRef(false);
  const handleAttempt = useCallback(
    (_signals?: Record<string, number | string | boolean>) => {
      if (engagedOnceRef.current) return;
      engagedOnceRef.current = true;
      setEngageAtMs(now());
      onEngage(index, cardId);
    },
    [now, onEngage, index, cardId],
  );

  // Mount the game only inside the window AND when the card + renderer resolve; a
  // missing card/renderer falls back to the placeholder (fail-safe, never a crash).
  if (card && Renderer) {
    const engaged = engageAtMs !== null;
    const context: CardStartContext = {
      sessionId: feedId,
      cardIndex: index,
      activeAtMs,
      // #106: timing origin is the engage instant. Before engagement it falls back
      // to `activeAtMs`, but the timer is gated off anyway (`timerGatedCard` hands
      // the renderer a non-finite limit until the player interacts).
      interactionEnabledAtMs: engageAtMs ?? activeAtMs,
    };
    const Game = Renderer as TemplateRenderer<LiquidCard>;
    return (
      <View style={[styles.slide, { height }]} testID={`feed-slide-${index}`}>
        {/* creatorHandle already includes the leading `@` (catalog convention). */}
        <Text style={styles.byline} testID={`feed-byline-${index}`}>
          {card.creatorHandle}
        </Text>
        <View style={styles.game} testID={`feed-game-${index}`}>
          <Game
            // #106: until engaged, the renderer's timer stays disarmed.
            key={`${feedId}:${index}`}
            card={timerGatedCard(card, engaged)}
            context={context}
            onAttempt={handleAttempt}
            onResolve={(resolution: CardResolution) => onResolve(index, resolution)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.slide, { height }]} testID={`feed-slide-${index}`}>
      <View style={styles.placeholder} testID={`feed-placeholder-${index}`}>
        {/* Decorative only — hidden from screen readers (off-screen filler). */}
        <Text
          style={styles.placeholderText}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          Game loading…
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  slide: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  byline: {
    color: '#9aa0aa',
    fontSize: 15,
    fontWeight: '600',
  },
  game: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#4a4a55',
    fontSize: 15,
  },
});
