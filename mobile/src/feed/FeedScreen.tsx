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
 * all shipped native renderers, each behind the uniform feedback/explanation
 * {@link FeedbackGate} (#133); tests inject a stub/fake registry.
 *
 * Active-card detection: a game becomes ACTIVE when it snaps into view, detected
 * via `onViewableItemsChanged`; FeedScreen calls `setActiveIndex`, which
 * materialises more cards ahead (endless). Only the active card ±`WINDOW_RADIUS`
 * mount their real renderer; the rest render a same-height placeholder (perf).
 *
 * Free-scroll semantics (#106 parity, docs/FEED_DIRECTION.md §3.2): each game runs
 * a local lifecycle — not-engaged → engaged → resolved. The per-game COUNTDOWN now
 * arms on ACTIVATION (the game appearing/snapping into view), not on first
 * interaction, so an immediate-play puzzle is timed from the moment it is on screen
 * and answerable; pre-phase games (watch/preview/Start) still start their countdown
 * at their own answer-phase start (see `timerGatedCard`). ENGAGEMENT (first
 * interaction) is still tracked, but only to classify leave behaviour: swiping past
 * an un-engaged game is a SKIP (no resolution); engaging then leaving before
 * resolve is an ABANDONED attempt; a game that resolves (correct/incorrect/timeout)
 * is played. A game left active long enough to time out resolves as a TIMEOUT even
 * if never engaged. The lifecycle callbacks are the telemetry seam for M5 — this
 * file emits the signals but does NOT post telemetry.
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
  ScrollView,
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
  elevation,
  motion,
} from './templates/tokens';
import { GameThemeProvider } from './templates/GameTheme';
import { useReducedMotion } from './useReducedMotion';
import { getCardById as getCatalogCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
} from '../core/templates/contract';
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
import CardSocialRail from '../social/CardSocialRail';

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
   * inversion). Defaults to the {@link feedRegistry} — all shipped native
   * renderers, each behind the uniform feedback/explanation gate (#133); tests
   * inject a stub/fake. Must be referentially stable.
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
   * Pin this card as the FIRST slide — a featured-game deep link (so tapping a
   * specific game opens THAT game). Threaded into the controller; ignored when an
   * explicit `source` is supplied (tests).
   */
  startCardId?: string;
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
 * Gate the per-game timer on ACTIVATION. Until a slide is the ACTIVE/focused card
 * we hand the renderer a card whose `timeLimitMs` is non-finite, so the shared
 * {@link useCardTimer} skips arming its countdown. Once the slide becomes active
 * the real card flows through and the timer arms a fresh, full-duration countdown
 * from the activation instant — so the countdown starts the moment the game
 * appears (snaps into view), NOT on the player's first interaction.
 *
 * Template-AGNOSTIC: `timeLimitMs` is the one timing primitive common to every
 * {@link LiquidCard} config, so a single override works for all renderers with NO
 * switch on `templateType`. The override preserves the card's discriminant and
 * every other field, so the result is the same card variant with a swapped limit.
 *
 * IMMEDIATE-PLAY vs PRE-PHASE — why activation-gating is correct for BOTH, with no
 * per-template flag:
 *  - IMMEDIATE-PLAY games pass `card` straight into {@link useCardTimer} on mount,
 *    so flipping the limit finite on activation arms their countdown the instant
 *    the card appears.
 *  - PRE-PHASE games (what_changed's preview, memory_sequence's watch, n_back /
 *    color_word / rule_flip's Start→stream) mount their `useCardTimer` ONLY inside
 *    the answer-phase subtree, which renders AFTER the pre-phase ends, so their
 *    inner timer arms at the real round-start, never during the pre-phase. The
 *    pre-phase itself is independently held by each renderer's `isActive` gate (or
 *    its Start button), so a pre-mounted neighbour never advances either.
 *
 * Neighbour safety: a windowed-but-not-focused slide stays non-finite, so its
 * timer can never run — only the ACTIVE slide's timer arms.
 */
function timerGatedCard(card: LiquidCard, armed: boolean): LiquidCard {
  if (armed) return card;
  return {
    ...card,
    config: { ...card.config, timeLimitMs: Number.POSITIVE_INFINITY },
  } as LiquidCard;
}

/** A best-effort per-mount feed id; RN engines may lack `crypto.randomUUID`. */
function makeFeedId(anonymousUserId: string, stamp: number): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `feed-${anonymousUserId}-${stamp}`
  );
}

export default function FeedScreen({
  registry = feedRegistry,
  source,
  excludeCardIds,
  startCardId,
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
  // A per-mount feed instance id + a single "active at" stamp. This stamp is now
  // only a FALLBACK origin for the card start context: each slide stamps its own
  // per-activation instant and arms its timer from there (see FeedSlide), so the
  // countdown starts when the game appears.
  const [activeAtMs] = useState(() => nowFn());
  const [feedId] = useState(
    () => feedIdProp ?? makeFeedId(anonymousUserId, activeAtMs),
  );

  const { cards, activeIndex, setActiveIndex } = useFeedController({
    anonymousUserId,
    source,
    excludeCardIds,
    startCardId,
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
  const handleExplanationViewed = useCallback(
    (index: number, cardId: string) => {
      onCardExplanationViewedRef.current?.(index, cardId);
    },
    [],
  );

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
  /** Wall clock for stamping this slide's activation instant (timer origin). */
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

  // The per-slide ACTIVATION instant — null until this slide first becomes the
  // focused card. The countdown now arms on activation (the game APPEARING), so
  // this is the timing origin for the card start context AND the gate that flips
  // `timeLimitMs` finite. Latched once so re-activating a slide keeps its origin.
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

  // Mount the game only inside the window AND when the card + renderer resolve; a
  // missing card/renderer falls back to the placeholder (fail-safe, never a crash).
  if (card && Renderer) {
    // Arm the timer once the slide has activated (countdown starts on appear).
    // Until then the card carries a non-finite limit so a pre-mounted neighbour's
    // timer never runs. `armed` latches on first activation.
    const armed = activatedAtMs !== null;
    // The timing origin is the slide's own activation instant (not the stale
    // per-feed mount stamp), so `elapsedMs` measures from when THIS game appeared.
    // For IMMEDIATE-PLAY games the puzzle is answerable on appear, so
    // `interactionEnabledAtMs` is also the activation instant. PRE-PHASE renderers
    // override `interactionEnabledAtMs` themselves with their answer-phase start.
    const originMs = activatedAtMs ?? activeAtMs;
    const context: CardStartContext = {
      sessionId: feedId,
      cardIndex: index,
      activeAtMs: originMs,
      interactionEnabledAtMs: originMs,
    };
    const Game = Renderer as TemplateRenderer<LiquidCard>;
    const gameTheme = categoryAccent(card.category);
    return (
      <View
        style={[styles.slide, slideInsetStyle(insets), { height }]}
        testID={`feed-slide-${index}`}
      >
        <SlideBackground category={card.category} />
        {/* Phase 3: a category CHIP at the top, accent-tinted from the card's
            category. The chip text carries the meaning (guardrail-safe copy, no
            IQ/trait language); colour only reinforces it. */}
        <FeedHeader
          category={card.category}
          difficulty={card.difficulty}
          timeLimitMs={card.config.timeLimitMs}
        />
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
          <ActiveEntrance
            active={active}
            style={[
              styles.gameContent,
              styles.gameShell,
              {
                borderColor: gameTheme.border,
                backgroundColor: '#11141d',
                shadowColor: gameTheme.accent,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.gameGlow,
                { backgroundColor: gameTheme.accent },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.gameEdge,
                { backgroundColor: gameTheme.accent },
              ]}
            />
            <BoundedGameContent testID={`feed-game-scroll-${index}`}>
              <GamePostChrome
                templateType={card.templateType}
                mechanic={card.puzzleDna.mechanic}
                difficulty={card.difficulty}
                accent={gameTheme.accent}
              />
              <View style={styles.gameBody}>
                <GameThemeProvider category={card.category}>
                  <Game
                    // Until the slide activates, the renderer's timer stays
                    // disarmed; on activation the real finite limit flows through
                    // and the countdown starts (immediate-play arms now; pre-phase
                    // renderers arm their inner timer at their answer-phase start).
                    key={`${feedId}:${index}`}
                    card={timerGatedCard(card, armed)}
                    context={context}
                    // Activation signal (#128 review fix): only the focused slide is
                    // active. Renderers with a timed PRE-phase (what_changed's preview)
                    // hold until this is true, so a pre-mounted slide's preview cannot
                    // elapse off-screen. Template-agnostic; most renderers ignore it.
                    isActive={active}
                    onAttempt={handleAttempt}
                    onResolve={(resolution: CardResolution) =>
                      onResolve(index, resolution)
                    }
                    onExplanationViewed={() =>
                      onExplanationViewed(index, cardId)
                    }
                  />
                </GameThemeProvider>
              </View>
            </BoundedGameContent>
          </ActiveEntrance>
        </View>
        {/* Per-card social surface (likes + comments) — a FEED-LAYER concern
            keyed by cardId, NOT per-template (no switch on templateType, never
            touches the renderer's logic). Activation-gated: it loads only when
            this slide is the focused one (`active`). Renders nothing when there
            is no social provider. */}
        <CardSocialRail cardId={cardId} active={active} />
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
 * Keeps a renderer inside the center region reserved between the feed header and
 * creator chrome. Most games remain ordinary, non-scrolling cards; scrolling is
 * enabled only when measured content is taller than the available viewport. This
 * prevents a tall answer phase from covering either adjacent row without making
 * the feed controller aware of any template's layout.
 */
function BoundedGameContent({
  children,
  testID,
}: {
  children: ReactNode;
  testID: string;
}) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const scrollEnabled =
    viewportHeight > 0 && contentHeight > viewportHeight + 1;

  return (
    <ScrollView
      testID={testID}
      style={styles.gameScroll}
      contentContainerStyle={styles.gameScrollContent}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      bounces={scrollEnabled}
      showsVerticalScrollIndicator={scrollEnabled}
      onLayout={(event) =>
        setViewportHeight(event.nativeEvent.layout.height)
      }
      onContentSizeChange={(_width, height) => setContentHeight(height)}
    >
      {children}
    </ScrollView>
  );
}

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
function SlideBackground({ category }: { category?: string }) {
  const { accent, tint } = categoryAccent(category);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={category ? [tint, '#10131d', '#07090e'] : slideGradient.colors}
        locations={slideGradient.locations}
        start={slideGradient.start}
        end={slideGradient.end}
        style={StyleSheet.absoluteFill}
      />
      {category ? (
        <>
          <View
            style={[
              styles.ambientOrb,
              styles.ambientOrbTop,
              { backgroundColor: accent },
            ]}
          />
          <View
            style={[
              styles.ambientOrb,
              styles.ambientOrbBottom,
              { backgroundColor: accent },
            ]}
          />
        </>
      ) : null}
    </View>
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
      <View
        accessibilityLabel={`Creator ${creatorHandle}`}
        style={styles.bylinePressable}
      >
        <View style={[styles.avatar, { backgroundColor: accent }]}>
          <Text style={styles.avatarText}>{monogram}</Text>
        </View>
        <View style={styles.authorCopy}>
          <Text style={styles.byline} testID={`feed-byline-${index}`}>
            {creatorHandle}
          </Text>
          <Text style={styles.creatorCaption}>Original playable challenge</Text>
        </View>
      </View>
      {/* Decorative scroll affordance — the FlatList already carries the
          screen-reader swipe instruction, so hide this from assistive tech. */}
      <Text
        style={styles.swipeHint}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        Swipe up ⌃
      </Text>
    </View>
  );
}

/** Format a category id ("visual_attention") into a chip label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function difficultyLevel(difficulty: string): number {
  if (difficulty === 'extremely_hard') return 5;
  if (difficulty === 'hard') return 4;
  if (difficulty === 'medium') return 3;
  if (difficulty === 'easy') return 2;
  return 1;
}

function templateDescription(templateType: string): string | null {
  if (templateType === 'prism_path') {
    return 'Rotate mirrors to guide a beam from IN to the star while avoiding blockers. Tap mirrors to flip slash direction, then fire when the preview reaches the target.';
  }
  return null;
}

function templateMonogram(templateType: string): string {
  return templateType
    .split('_')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

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

function GamePostChrome({
  templateType,
  mechanic,
  difficulty,
  accent,
}: {
  templateType: string;
  mechanic: string;
  difficulty: string;
  accent: string;
}) {
  const level = difficultyLevel(difficulty);
  const fingerprint = templateFingerprint(templateType);
  const label = categoryLabel(templateType);
  const description = templateDescription(templateType);
  return (
    <View style={styles.gameKicker}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.templateMark, { borderColor: accent }]}
      >
        <Text style={[styles.templateMonogram, { color: accent }]}>
          {templateMonogram(templateType)}
        </Text>
        <View style={styles.fingerprint}>
          {fingerprint.map((filled, index) => (
            <View
              key={index}
              style={[
                styles.fingerprintDot,
                {
                  backgroundColor: filled
                    ? accent
                    : 'rgba(255,255,255,0.10)',
                },
              ]}
            />
          ))}
        </View>
      </View>
      <View
        accessible={Boolean(description)}
        accessibilityLabel={description ? `${label}. ${description}` : undefined}
        accessibilityHint={description ?? undefined}
        style={styles.templateCopy}
      >
        <Text style={styles.templateLabel}>{label}</Text>
        <Text style={styles.mechanicLabel}>
          {categoryLabel(mechanic.replace(/-/g, '_'))}
        </Text>
      </View>
      <View
        accessibilityLabel={`${categoryLabel(difficulty)} difficulty`}
        style={styles.levelMeter}
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <View
            key={step}
            style={[
              styles.levelBar,
              {
                height: 3 + step * 3,
                backgroundColor:
                  step <= level ? accent : 'rgba(255,255,255,0.12)',
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The top-of-slide category chip (Phase 3, native parallel of web's
 * `.feed-slide__chip`): an accent-tinted pill naming the performance category in
 * modest, guardrail-safe copy (no IQ/trait language). The chip text carries the
 * meaning — colour only reinforces it.
 */
/**
 * Format a time-limit (ms) as a compact tag: under a minute reads as `30s`; a
 * minute or more reads as `m:ss` (90000 → `1:30`, 120000 → `2:00`). A non-finite
 * limit (a timer-gated, off-screen slide) shows nothing.
 */
function formatTimeLimitLabel(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function FeedHeader({
  category,
  difficulty,
  timeLimitMs,
}: {
  category: string;
  difficulty: string;
  timeLimitMs: number;
}) {
  const { accent, tint } = categoryAccent(category);
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>∞</Text>
        </View>
        <Text style={styles.brandName}>Witzy</Text>
        <Text style={styles.brandMode}>Discover</Text>
      </View>
      <View style={styles.chipRow}>
        <View
          style={[styles.chip, { borderColor: accent, backgroundColor: tint }]}
        >
          <Text style={styles.chipText}>{categoryLabel(category)}</Text>
        </View>
        <View style={styles.metaPill}>
          <Text style={styles.metaPillText}>{categoryLabel(difficulty)}</Text>
        </View>
        <View style={styles.metaPill}>
          <Text testID="feed-time-pill" style={styles.metaPillText}>
            {formatTimeLimitLabel(timeLimitMs)}
          </Text>
        </View>
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
  ambientOrb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.11,
  },
  ambientOrbTop: { top: 30, right: -110 },
  ambientOrbBottom: { bottom: -80, left: -140, opacity: 0.07 },
  // MP2 (#134): center the game content in the middle of the viewport, not pinned
  // to the top — TikTok/Reels-style. Template-agnostic: centering happens here at
  // the slide/feed level, never per game.
  game: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Full-width box inside the centered game container, so games (and the feedback
  // step) span the padded content width instead of shrinking to intrinsic width.
  gameContent: {
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
  },
  gameShell: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: 'rgba(18,21,31,0.86)',
    ...elevation.card,
  },
  gameScroll: {
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
  },
  gameScrollContent: {
    flexGrow: 1,
    padding: space.lg,
  },
  gameGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -125,
    right: -70,
    opacity: 0.16,
  },
  gameEdge: {
    position: 'absolute',
    top: 0,
    left: 34,
    right: 34,
    height: 2,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    opacity: 0.82,
  },
  gameKicker: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
    gap: space.sm,
  },
  templateMark: {
    width: 54,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  templateMonogram: {
    fontSize: 11,
    fontWeight: fontWeight.heavy,
  },
  fingerprint: {
    width: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  fingerprintDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  templateCopy: {
    flex: 1,
    gap: 1,
  },
  templateLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  mechanicLabel: {
    color: colors.textFaint,
    fontSize: 10,
  },
  levelMeter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    minHeight: 12,
  },
  levelBar: {
    width: 4,
    borderRadius: radius.pill,
  },
  gameBody: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
  },
  header: {
    gap: space.md,
    marginBottom: space.md,
    paddingRight: 86,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 34,
  },
  // The LumaLoop logo — a loop (∞) badge with the brand purple (matches Home).
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7b54d6',
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 21,
    fontWeight: fontWeight.bold,
    marginTop: -2,
  },
  brandName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
    letterSpacing: -0.3,
  },
  brandMode: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  // Phase 3: the top-of-slide category chip row.
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  metaPill: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  metaPillText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
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
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
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
  authorCopy: { flexShrink: 1, gap: 1 },
  creatorCaption: { color: colors.textMuted, fontSize: fontSize.xs },
  swipeHint: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginLeft: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(6,8,13,0.48)',
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
