/**
 * FeedScreen — full-screen vertical PAGING feed for React Native (ADO #127,
 * docs/FEED_DIRECTION.md §3.1). The native counterpart of the web
 * `src/feed/FeedScreen.tsx`: one game fills the viewport, native vertical swipe is
 * the next/prev gesture, and a snapping `FlatList` (`pagingEnabled` + per-item
 * height) settles each game to one full viewport. The game content is CENTERED in
 * the middle of that immersive, full-bleed slide (MP2, #134) — TikTok/Reels-style,
 * not pinned to the top. There is no progress bar and no "N of M" — the feed is
 * endless.
 *
 * Separation of concerns (CLAUDE.md §4): this surface owns ONLY presentation,
 * paging, and which card is active. {@link useFeedController} owns the endless deck
 * + active index; the per-template renderers own card interaction. FeedScreen
 * resolves a renderer for each card via the injected {@link RendererRegistry} only
 * — there is NO switch on `templateType` anywhere, so adding a new game never
 * touches this file (CLAUDE.md §6). It defaults to the {@link feedRegistry} — the
 * four real native renderers, each behind the uniform feedback/explanation
 * {@link FeedbackGate} (#133); tests inject a stub/fake registry.
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
  type ReactNode,
} from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import {
  colors,
  fontSize,
  fontWeight,
  radius,
  space,
  PAGE_BACKGROUND,
  slideGradient,
  categoryAccent,
  motion,
} from './templates/tokens';
import { useReducedMotion } from './useReducedMotion';
import { getCardById as getCatalogCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { CardResolution, CardStartContext } from '../core/templates/contract';
import { resolveRenderer } from './rendererRegistry';
import type { RendererRegistry, TemplateRenderer } from './rendererRegistry';
import { feedRegistry } from './FeedbackGate';
import type { FeedBatchSource } from '../core/feed/feedDeck';
import { CardScoreProvider } from './cardScoreContext';
import type { CardScore } from '../core/feed/scoring';
import FeedScoreHud from './FeedScoreHud';
import type { ScoreStore } from './scoreStore';
import { useFeedController } from './useFeedController';
import { useFeedScore } from './useFeedScore';

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
   * inversion). Defaults to the {@link feedRegistry} — the four real native
   * renderers, each behind the uniform feedback/explanation gate (#133); tests
   * inject a stub/fake. Must be referentially stable.
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
  /**
   * Notified when a game's explanation first becomes visible as post-resolution
   * feedback (Design §8.2/§9.4). As of #133 this is the UNIFORM feedback step the
   * feed-level {@link FeedbackGate} shows for EVERY resolution (correct/incorrect/
   * timeout), not a per-renderer reveal — so it fires once per played card on the
   * active slide. Template-agnostic: the feed forwards the gate's
   * `onExplanationViewed` seam without branching on type. Seam for M5 telemetry
   * (`Card_Explanation_Viewed`).
   */
  onCardExplanationViewed?: (index: number, cardId: string) => void;
  /**
   * Accounts pivot: notified once per resolution that ALSO produced a Phase-4
   * score, AFTER {@link onCardResolved}, with that card's points (the SAME value
   * the HUD/result card show — not a recomputation). The signed-in `game_plays`
   * recorder rides this seam (see `useRecordGamePlay`); a resolution with no score
   * (should not happen) is not forwarded. Template-agnostic: the feed never
   * branches on `templateType`. Fires at most once per index.
   */
  onCardScored?: (
    index: number,
    resolution: CardResolution,
    score: CardScore,
  ) => void;
  /**
   * Test seam: the Phase-4 best-run persistence store. Defaults to the real
   * best-effort AsyncStorage store; pass `null` to disable persistence (tests).
   */
  scoreStore?: ScoreStore | null;
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
  registry = feedRegistry,
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
  onCardExplanationViewed,
  onCardScored,
  scoreStore,
}: FeedScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  // Fallback keeps per-item layout non-zero in headless test envs where the
  // window dimensions can report 0 (real devices always report a real height).
  const slideHeight = windowHeight || 800;

  // MP2 (#134): device safe-area insets. Each full-bleed slide spans the whole
  // viewport over the feed's edge-to-edge dark background, but pads its CENTERED
  // content clear of the notch/home indicator. The padding lives INSIDE the
  // fixed-height slide, so paging geometry (`slideHeight`) is unaffected.
  const insets = useSafeAreaInsets();

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

  // Phase 4: the GAME-POINTS accumulator. It folds each resolution through the
  // shared pure scoring core (template-agnostic), drives the HUD, and exposes the
  // per-card score the result card reads via context. It hooks the SAME resolution
  // path the feed already uses (see `handleResolve`), not a parallel observer.
  const score = useFeedScore({ getCardById, store: scoreStore });
  const scoreOnResolvedRef = useRef(score.onCardResolved);
  scoreOnResolvedRef.current = score.onCardResolved;
  // Accounts pivot: stable handles to read this card's score + forward it to the
  // `onCardScored` seam (the signed-in `game_plays` recorder), mirroring web.
  const getCardScoreRef = useRef(score.getCardScore);
  getCardScoreRef.current = score.getCardScore;
  const onCardScoredRef = useRef(onCardScored);
  onCardScoredRef.current = onCardScored;

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
  const onCardExplanationViewedRef = useRef(onCardExplanationViewed);
  onCardExplanationViewedRef.current = onCardExplanationViewed;

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
      // Phase 4: fold into the GAME-POINTS accumulator (idempotent per index in
      // the hook too) BEFORE the telemetry seam, so the per-card score is recorded
      // by the time the result card renders via the feedback gate.
      scoreOnResolvedRef.current(index, resolution);
      onCardResolved?.(index, resolution);
      // Accounts pivot: forward this card's score (read AFTER folding it in) to the
      // `onCardScored` seam so the signed-in `game_plays` recorder persists the row.
      const cardScore = getCardScoreRef.current(index);
      if (cardScore) onCardScoredRef.current?.(index, resolution, cardScore);
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

  // Forward a renderer's explanation reveal (#129, M5) to the feed-level seam via
  // a stable callback reading the live ref, so FeedSlide stays referentially
  // stable and never re-renders just because the parent's handler identity moved.
  const handleExplanationViewed = useCallback((index: number, cardId: string) => {
    onCardExplanationViewedRef.current?.(index, cardId);
  }, []);

  const renderItem = useCallback(
    ({ item: cardId, index }: ListRenderItemInfo<string>) => (
      <FeedSlide
        index={index}
        cardId={cardId}
        height={slideHeight}
        insets={insets}
        windowed={Math.abs(index - activeIndex) <= WINDOW_RADIUS}
        active={index === activeIndex}
        registry={registry}
        getCardById={getCardById}
        feedId={feedId}
        activeAtMs={activeAtMs}
        now={nowFn}
        onEngage={handleEngage}
        onResolve={handleResolve}
        onExplanationViewed={handleExplanationViewed}
      />
    ),
    [
      slideHeight,
      insets,
      activeIndex,
      registry,
      getCardById,
      feedId,
      activeAtMs,
      nowFn,
      handleEngage,
      handleResolve,
      handleExplanationViewed,
    ],
  );

  return (
    <CardScoreProvider value={score.getCardScore}>
      <View style={styles.root}>
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
        {/* Phase 4: the small, unobtrusive game-points HUD (points + current
            streak), overlaid clear of the device notch. Accent-aware,
            guardrail-safe copy. */}
        <FeedScoreHud
          totalPoints={score.state.totalPoints}
          currentStreak={score.state.currentStreak}
          topInset={insets.top}
        />
      </View>
    </CardScoreProvider>
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
  /**
   * Device safe-area insets (MP2, #134). Padded INSIDE the fixed-height slide so
   * the centered content clears the notch/home indicator while the dark slide
   * background stays full-bleed. Same value on every slide (real game + windowed
   * placeholder) so paging geometry is identical.
   */
  insets: EdgeInsets;
  /** Whether this slide is close enough to the active card to mount its game. */
  windowed: boolean;
  /**
   * Whether this slide is THE active/focused card (snapped into view), as opposed
   * to a windowed-but-pre-mounted neighbour. Threaded to the renderer as `isActive`
   * so timed PRE-phases (e.g. `what_changed`'s preview) hold until activation rather
   * than elapsing off-screen. Template-agnostic — the feed never branches on type.
   */
  active: boolean;
  registry: RendererRegistry;
  getCardById: (cardId: string) => LiquidCard | undefined;
  feedId: string;
  activeAtMs: number;
  /** Wall clock for stamping this slide's engage instant (#106). */
  now: () => number;
  /** Notify the feed that this game was engaged (first interaction). */
  onEngage: (index: number, cardId: string) => void;
  onResolve: (index: number, resolution: CardResolution) => void;
  /**
   * Notify the feed that this game revealed its explanation (#129, M5). Now fired
   * by the feed-level {@link FeedbackGate} when the uniform feedback/explanation
   * step becomes visible (#133), not by the renderers themselves.
   */
  onExplanationViewed: (index: number, cardId: string) => void;
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
  insets,
  windowed,
  active,
  registry,
  getCardById,
  feedId,
  activeAtMs,
  now,
  onEngage,
  onResolve,
  onExplanationViewed,
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
      <View
        style={[styles.slide, slideInsetStyle(insets), { height }]}
        testID={`feed-slide-${index}`}
      >
        <SlideBackground />
        {/* Phase 3: a category CHIP at the top, accent-tinted from the card's
            category. The chip text carries the meaning (guardrail-safe copy, no
            IQ/trait language); colour only reinforces it. */}
        <CategoryChip category={card.category} />
        {/* MP2 (#134): center the game (and, via the gate, the feedback step)
            vertically + horizontally in the slide. The full-width inner wrapper
            keeps games spanning the padded content box rather than collapsing to
            their intrinsic width under `alignItems: 'center'`. */}
        <View style={styles.game} testID={`feed-game-${index}`}>
          {/* Phase 5: animate the game in when its slide becomes ACTIVE (fade +
              lift + slight scale). Gated on activation, NOT mount, so a pre-
              mounted neighbour stays still until it snaps into view — avoiding
              the documented pre-mounted-neighbour pitfall. Visual-only: it never
              feeds back into timing/`isActive` game logic. */}
          <ActiveEntrance active={active} style={styles.gameContent}>
            <Game
              // #106: until engaged, the renderer's timer stays disarmed.
              key={`${feedId}:${index}`}
              card={timerGatedCard(card, engaged)}
              context={context}
              // Activation signal (#128 review fix): only the focused slide is
              // active. Renderers with a timed PRE-phase (what_changed's preview)
              // hold until this is true, so a pre-mounted slide's preview cannot
              // elapse off-screen. Template-agnostic; most renderers ignore it.
              isActive={active}
              onAttempt={handleAttempt}
              onResolve={(resolution: CardResolution) => onResolve(index, resolution)}
              onExplanationViewed={() => onExplanationViewed(index, cardId)}
            />
          </ActiveEntrance>
        </View>
        {/* MP3 (#135): the social-feed author byline as a bottom-left overlay
            (avatar monogram + @handle) plus a subtle swipe-up affordance — so each
            slide reads like a Reels/TikTok card, not a plain page. Phase 3: the
            avatar is tinted with the card's category accent. */}
        <SlideChrome
          creatorHandle={card.creatorHandle}
          category={card.category}
          index={index}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.slide, slideInsetStyle(insets), { height }]}
      testID={`feed-slide-${index}`}
    >
      <SlideBackground />
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

/**
 * Active-card entrance (Phase 5). Fades + lifts + slightly scales its children
 * in when the slide becomes the ACTIVE/focused card. The animation is gated on
 * ACTIVATION, not mount: the driver only runs on the inactive→active transition
 * (tracked via a ref), so a pre-mounted neighbour (which mounts with
 * `active={false}`) stays still until it actually snaps into view — the same
 * activation gating the renderers' timed pre-phases use. Purely visual: it never
 * touches the timer / `isActive` game logic.
 *
 * Reduced-motion: when the OS "reduce motion" preference is on, it snaps to the
 * final value (no movement), honouring the accessibility requirement
 * (AccessibilityInfo via {@link useReducedMotion}). The first card is active on
 * mount, so it also animates in once on first paint (parity with web).
 */
function ActiveEntrance({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: object;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  // Start hidden if this slide mounts already-active (first card) so the entrance
  // plays once on first paint; an inactive pre-mounted neighbour starts shown so
  // swiping to it never reveals a half-faded card before the driver kicks in.
  const anim = useRef(new Animated.Value(active ? 0 : 1)).current;

  useEffect(() => {
    if (reducedMotion || !active) {
      // Reduced-motion → snap to final (no movement). Inactive → stay settled so
      // the card is fully shown the instant it becomes the focused slide's
      // neighbour, and the entrance drives only on the next activation.
      anim.setValue(1);
      return undefined;
    }
    // Active (either mounted-active or just transitioned in): reset to hidden and
    // animate in. The reset is the activation gate — it only runs while active,
    // so a pre-mounted neighbour never animates until it snaps into view.
    anim.setValue(0);
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: motion.base,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // `anim` is stable (useRef); intentionally keyed on activation + preference.
  }, [active, reducedMotion, anim]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.985, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The full-bleed slide background: a subtle vertical dark gradient over the page
 * colour for depth (MP3 #135). Non-interactive and hidden from assistive tech so it
 * never intercepts a swipe/tap or adds noise; the slide keeps its own solid
 * {@link PAGE_BACKGROUND} underneath so paging never flashes a seam.
 */
function SlideBackground() {
  return (
    <LinearGradient
      colors={slideGradient.colors}
      locations={slideGradient.locations}
      start={slideGradient.start}
      end={slideGradient.end}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * The bottom-of-slide social chrome (MP3 #135): the creator byline styled like a
 * feed author (avatar monogram circle + @handle) on the left, and a subtle
 * swipe-up cue on the right. Tapping the byline is a no-op seam — a real creator
 * profile is a later phase (Design later phases); the press just acknowledges so
 * the affordance reads as tappable.
 */
function SlideChrome({
  creatorHandle,
  category,
  index,
}: {
  creatorHandle: string;
  category: string;
  index: number;
}) {
  // creatorHandle already includes the leading `@` (catalog convention); the
  // monogram is the first letter of the handle, ignoring that `@`.
  const monogram = (creatorHandle.replace(/^@/, '')[0] ?? '?').toUpperCase();
  // Phase 3: tint the avatar with the card's category accent (template-agnostic).
  const { accent } = categoryAccent(category);
  return (
    <View style={styles.chrome}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Creator ${creatorHandle}`}
        accessibilityHint="Creator profiles are coming soon"
        onPress={noop}
        style={styles.bylinePressable}
      >
        <View style={[styles.avatar, { backgroundColor: accent }]}>
          <Text style={styles.avatarText}>{monogram}</Text>
        </View>
        <Text style={styles.byline} testID={`feed-byline-${index}`}>
          {creatorHandle}
        </Text>
      </Pressable>
      {/* Decorative scroll affordance — the FlatList already carries the
          screen-reader swipe instruction, so hide this from assistive tech. */}
      <Text
        style={styles.swipeHint}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        Swipe up  ⌃
      </Text>
    </View>
  );
}

/** No-op seam for the (later-phase) tappable creator profile. */
function noop() {}

/** Format a category id ("visual_attention") into a chip label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The top-of-slide category chip (Phase 3, native parallel of web's
 * `.feed-slide__chip`): an accent-tinted pill naming the performance category in
 * modest, guardrail-safe copy (no IQ/trait language). The chip text carries the
 * meaning — colour only reinforces it.
 */
function CategoryChip({ category }: { category: string }) {
  const { accent, tint } = categoryAccent(category);
  return (
    <View style={styles.chipRow}>
      <View style={[styles.chip, { borderColor: accent, backgroundColor: tint }]}>
        <Text style={styles.chipText}>{categoryLabel(category)}</Text>
      </View>
    </View>
  );
}

/** Base horizontal slide padding so centered games aren't edge-to-edge cramped. */
const SLIDE_PADDING_X = 20;
/** Base vertical slide padding, stacked ON TOP of the device safe-area insets. */
const SLIDE_PADDING_Y = 32;

/**
 * MP2 (#134): the inset-aware padding for a full-bleed slide. The device safe-area
 * insets are added to the base padding so the slide's CONTENT clears the notch/home
 * indicator, while the slide's dark background still fills edge-to-edge. Applied to
 * BOTH the real game slide and the windowed placeholder so their inner geometry
 * matches; padding lives inside the fixed-height slide, so paging is unaffected.
 */
function slideInsetStyle(insets: EdgeInsets) {
  return {
    paddingTop: SLIDE_PADDING_Y + insets.top,
    paddingBottom: SLIDE_PADDING_Y + insets.bottom,
    paddingLeft: SLIDE_PADDING_X + insets.left,
    paddingRight: SLIDE_PADDING_X + insets.right,
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BACKGROUND,
  },
  list: {
    flex: 1,
    backgroundColor: PAGE_BACKGROUND,
  },
  slide: {
    width: '100%',
    // Each slide carries the dark background too, so the feed stays full-bleed
    // immersive edge-to-edge even as windowed slides mount/unmount; the gradient
    // (SlideBackground) layers over this solid base for depth (MP3 #135).
    backgroundColor: PAGE_BACKGROUND,
  },
  // MP2 (#134): center the game content in the middle of the viewport, not pinned
  // to the top — TikTok/Reels-style. Template-agnostic: centering happens here at
  // the slide/feed level, never per game.
  game: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Full-width box inside the centered game container, so games (and the feedback
  // step) span the padded content width instead of shrinking to intrinsic width.
  gameContent: {
    width: '100%',
  },
  // Phase 3: the top-of-slide category chip row.
  chipRow: {
    flexDirection: 'row',
    marginBottom: space.md,
  },
  chip: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  // MP3 (#135): the bottom social chrome row — byline left, swipe cue right.
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  bylinePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexShrink: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  byline: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  swipeHint: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginLeft: space.sm,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
  },
});
