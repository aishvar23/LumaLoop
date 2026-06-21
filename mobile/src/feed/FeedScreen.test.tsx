/**
 * Tests for the native full-screen swipe/snap FeedScreen (ADO #127,
 * docs/FEED_DIRECTION.md §3.1). The renderer registry, deck source, anonymous id,
 * and card resolver are all injected so the feed is deterministic and
 * template-agnostic (no real catalog, no real games).
 *
 * Active-card detection is driven by `FlatList`'s `onViewableItemsChanged`. Rather
 * than depend on `VirtualizedList`'s scroll/layout heuristics under jest, the
 * tests reach the handler we passed (via the FlatList element props) and invoke it
 * directly — exactly the signal a real snap produces.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { FlatList, StyleSheet, type ViewToken } from 'react-native';

import type { LiquidCard, SpotItCard } from '../core/cards/types';
import type { CardResolution, TemplateProps } from '../core/templates/contract';
import { useCardTimer } from '../core/templates/useCardTimer';
import type { FeedBatchSource } from '../core/feed/feedDeck';
import FeedScreen from './FeedScreen';
import type { RendererRegistry } from './rendererRegistry';
import { defaultRendererRegistry } from './rendererRegistry';
import { feedRegistry } from './FeedbackGate';
import { StubRenderer, stubRendererRegistry } from './stubRenderer';

// --- Deterministic feed source + cards ----------------------------------------

/** batch N → ['bN-0','bN-1','bN-2'] (decoded from the per-batch seed suffix). */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

/** Minimal valid card so the registry lookup + renderer have something to play. */
function makeCard(cardId: string): LiquidCard {
  const card: SpotItCard = {
    cardId,
    // Mirror the catalog convention: the handle already carries the leading `@`.
    creatorHandle: `@creator_${cardId}`,
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'unreviewed',
    estimatedSeconds: 10,
    prompt: 'Find the odd one out',
    puzzleDna: { mechanic: 'scan', inputMode: 'tap', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      rows: 1,
      columns: 1,
      baseElement: 'a',
      anomalyElement: 'b',
      anomalyRow: 0,
      anomalyColumn: 0,
      timeLimitMs: 1000,
    },
  };
  return card;
}

const fakeGetCardById = (cardId: string): LiquidCard | undefined => makeCard(cardId);

// The default M3 registry is the stub (all templates → stub).
const stubRegistry: RendererRegistry = stubRendererRegistry;

/**
 * A SINGLE-TAP renderer: one press ENGAGES and RESOLVES in the same tick (e.g.
 * what_changed / tiny_logic). The engaging tap flips the card's `timeLimitMs`
 * ∞→finite, re-arming a fresh timer on an already-resolved slide; the feed-level
 * dedup must keep `onCardResolved` to a single `correct` with NO phantom timeout.
 */
function SingleTapRenderer({ card, context, onAttempt, onResolve }: TemplateProps<LiquidCard>) {
  const timer = useCardTimer({ card, context, onResolve });
  const resolution: CardResolution = {
    cardId: card.cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 1,
    interactionElapsedMs: 1,
    attemptCount: 1,
    signals: {},
  };
  return (
    <StubRenderer
      card={card}
      context={context}
      onAttempt={(s) => {
        onAttempt(s);
        timer.markAttempt();
        timer.resolve(resolution);
      }}
      onResolve={onResolve}
    />
  );
}

// The stub reads only shared LiquidCard fields, so it slots into any template.
const singleTapRegistry = {
  spot_it: SingleTapRenderer,
} as unknown as RendererRegistry;

/**
 * A renderer that reveals an explanation: its engage tap fires the optional
 * `onExplanationViewed` seam (mirrors `tiny_logic` on a wrong commit). Used to
 * verify the feed forwards the renderer seam to its `onCardExplanationViewed`.
 */
function ExplainingRenderer({ card, context, onAttempt, onResolve, onExplanationViewed }: TemplateProps<LiquidCard>) {
  return (
    <StubRenderer
      card={card}
      context={context}
      onAttempt={(s) => {
        onAttempt(s);
        onExplanationViewed?.();
      }}
      onResolve={onResolve}
    />
  );
}

const explainingRegistry = {
  spot_it: ExplainingRenderer,
} as unknown as RendererRegistry;

type LifecycleHandlers = {
  onCardActive?: (i: number, cardId: string) => void;
  onCardEngaged?: (i: number, cardId: string) => void;
  onCardSkipped?: (i: number, cardId: string) => void;
  onCardAbandoned?: (i: number, cardId: string) => void;
  onCardResolved?: (i: number, r: CardResolution) => void;
  onCardExplanationViewed?: (i: number, cardId: string) => void;
};

function renderFeed(
  extra?: LifecycleHandlers,
  registry: RendererRegistry = stubRegistry,
) {
  return render(
    <FeedScreen
      anonymousUserId="anon"
      source={fakeSource}
      registry={registry}
      getCardById={fakeGetCardById}
      onCardActive={extra?.onCardActive}
      onCardEngaged={extra?.onCardEngaged}
      onCardSkipped={extra?.onCardSkipped}
      onCardAbandoned={extra?.onCardAbandoned}
      onCardResolved={extra?.onCardResolved}
      onCardExplanationViewed={extra?.onCardExplanationViewed}
    />,
  );
}

/** Simulate a slide snapping into view (the on-scroll signal that drives active). */
function snapTo(index: number, cardId: string) {
  const handler = screen.UNSAFE_getByType(FlatList).props
    .onViewableItemsChanged as (info: {
    viewableItems: ViewToken[];
    changed: ViewToken[];
  }) => void;
  const token: ViewToken = {
    index,
    item: cardId,
    key: String(index),
    isViewable: true,
  };
  act(() => {
    handler({ viewableItems: [token], changed: [token] });
  });
}

describe('FeedScreen (native)', () => {
  it('renders the active stub game for the first deck card', () => {
    renderFeed();
    expect(screen.getByTestId('feed-game-0')).toBeOnTheScreen();
    // The stub renders the cardId + its "engage"/"resolve" affordances.
    expect(screen.getByText('game:b0-0')).toBeOnTheScreen();
    expect(screen.getByTestId('stub-card-b0-0')).toHaveTextContent('b0-0');
  });

  it('centers the active game content in the slide (MP2 #134)', () => {
    renderFeed();
    // The game container centers its content vertically + horizontally so the
    // game sits in the middle of the full-bleed slide, not pinned to the top.
    const gameStyle = StyleSheet.flatten(
      screen.getByTestId('feed-game-0').props.style,
    );
    expect(gameStyle).toEqual(
      expect.objectContaining({
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }),
    );
  });

  it('pads each full-bleed slide with the safe-area insets (MP2 #134)', () => {
    renderFeed();
    // The dark background extends full-bleed while the content is inset clear of
    // the notch/home indicator (mocked zero insets + base padding under Jest).
    const slideStyle = StyleSheet.flatten(
      screen.getByTestId('feed-slide-0').props.style,
    );
    expect(slideStyle.backgroundColor).toBe('#0b0b0f');
    expect(slideStyle.paddingTop).toBe(32);
    expect(slideStyle.paddingBottom).toBe(32);
    expect(slideStyle.paddingLeft).toBe(20);
    expect(slideStyle.paddingRight).toBe(20);
  });

  it('shows the creator byline with no doubled @', () => {
    renderFeed();
    // creatorHandle already carries the `@`; the byline must not add another.
    expect(screen.getByTestId('feed-byline-0')).toHaveTextContent('@creator_b0-0');
    expect(screen.queryByText('@@creator_b0-0')).toBeNull();
  });

  it('shows a category chip with guardrail-safe, humanized copy', () => {
    renderFeed();
    // category `visual_attention` → "Visual attention" (no IQ/trait language).
    expect(screen.getAllByText('Visual attention').length).toBeGreaterThan(0);
  });

  it('windows the mount: off-window slides render the placeholder, not the stub', () => {
    renderFeed();
    // Active is 0 → indices 0 and 1 are windowed, 3 is a placeholder.
    expect(screen.getByTestId('feed-game-0')).toBeOnTheScreen();
    expect(screen.getByTestId('feed-game-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('feed-game-3')).toBeNull();
    expect(screen.getByTestId('feed-placeholder-3')).toBeOnTheScreen();
  });

  it('updates the active game when a slide snaps into view', () => {
    renderFeed();
    snapTo(3, 'b0-0'); // cardId is irrelevant to detection — only the index is.

    // Active moved to 3 → its game mounts; index 0 leaves the window and collapses
    // back to a placeholder.
    expect(screen.getByTestId('feed-game-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('feed-game-0')).toBeNull();
    expect(screen.getByTestId('feed-placeholder-0')).toBeOnTheScreen();
  });

  it('fires onCardActive for the first card on mount, latched per index', () => {
    const onCardActive = jest.fn();
    renderFeed({ onCardActive });
    expect(onCardActive).toHaveBeenCalledTimes(1);
    expect(onCardActive).toHaveBeenCalledWith(0, 'b0-0');

    snapTo(2, 'b0-2');
    expect(onCardActive).toHaveBeenCalledWith(2, 'b0-2');
    // Revisiting index 0 never refires its activation.
    snapTo(0, 'b0-0');
    expect(onCardActive.mock.calls.filter(([i]) => i === 0)).toHaveLength(1);
  });

  it('records a resolution locally without auto-advancing (#106 seam)', () => {
    const onCardResolved = jest.fn();
    renderFeed({ onCardResolved });
    fireEvent.press(screen.getByTestId('resolve-b0-0'));

    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', isCorrect: true }),
    );
    // The feed did NOT advance — index 0 is still the active windowed game.
    expect(screen.getByTestId('feed-game-0')).toBeOnTheScreen();
  });

  it('does NOT arm a game timer until the player engages it (#106)', () => {
    jest.useFakeTimers();
    try {
      const onCardResolved = jest.fn();
      renderFeed({ onCardResolved });

      // Active but untouched: advancing past its 1000ms limit must NOT time out —
      // the timer is gated off until engagement.
      act(() => jest.advanceTimersByTime(5000));
      expect(onCardResolved).not.toHaveBeenCalled();

      // Engaging arms a FRESH full-duration countdown from the engage instant.
      act(() => {
        fireEvent.press(screen.getByTestId('engage-b0-0'));
      });
      expect(onCardResolved).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1000));

      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(onCardResolved).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ cardId: 'b0-0', resolutionType: 'timeout' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('swiping past an un-engaged game is a SKIP — no resolution, no abandon (#106)', () => {
    const onCardSkipped = jest.fn();
    const onCardAbandoned = jest.fn();
    const onCardResolved = jest.fn();
    renderFeed({ onCardSkipped, onCardAbandoned, onCardResolved });

    snapTo(1, 'b0-1'); // leave game 0 without ever interacting.

    expect(onCardSkipped).toHaveBeenCalledTimes(1);
    expect(onCardSkipped).toHaveBeenCalledWith(0, 'b0-0');
    expect(onCardAbandoned).not.toHaveBeenCalled();
    expect(onCardResolved).not.toHaveBeenCalled();
  });

  it('engaging then leaving before resolve is an ABANDONED attempt — not a skip (#106)', () => {
    const onCardSkipped = jest.fn();
    const onCardAbandoned = jest.fn();
    const onCardResolved = jest.fn();
    renderFeed({ onCardSkipped, onCardAbandoned, onCardResolved });

    fireEvent.press(screen.getByTestId('engage-b0-0'));
    snapTo(1, 'b0-1'); // leave before resolving.

    expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');
    expect(onCardSkipped).not.toHaveBeenCalled();
    expect(onCardResolved).not.toHaveBeenCalled();
  });

  it('engage → resolve fires onCardResolved once and never skip/abandon (#106)', () => {
    const onCardEngaged = jest.fn();
    const onCardSkipped = jest.fn();
    const onCardAbandoned = jest.fn();
    const onCardResolved = jest.fn();
    renderFeed({ onCardEngaged, onCardSkipped, onCardAbandoned, onCardResolved });

    // Engaging twice still signals engagement exactly once.
    fireEvent.press(screen.getByTestId('engage-b0-0'));
    fireEvent.press(screen.getByTestId('engage-b0-0'));
    expect(onCardEngaged).toHaveBeenCalledTimes(1);
    expect(onCardEngaged).toHaveBeenCalledWith(0, 'b0-0');

    fireEvent.press(screen.getByTestId('resolve-b0-0'));
    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', isCorrect: true }),
    );

    // Swiping away from a resolved game is neither a skip nor an abandon.
    snapTo(1, 'b0-1');
    expect(onCardSkipped).not.toHaveBeenCalled();
    expect(onCardAbandoned).not.toHaveBeenCalled();
  });

  it('single-tap engage+resolve fires onCardResolved EXACTLY once — no phantom timeout (#106)', () => {
    jest.useFakeTimers();
    try {
      const onCardResolved = jest.fn();
      renderFeed({ onCardResolved }, singleTapRegistry);

      act(() => {
        fireEvent.press(screen.getByTestId('engage-b0-0'));
      });

      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(onCardResolved).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ cardId: 'b0-0', resolutionType: 'correct' }),
      );

      // Advancing past the re-armed countdown must NOT produce a second (timeout).
      act(() => jest.advanceTimersByTime(5000));
      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(
        onCardResolved.mock.calls.some(
          ([, r]) => (r as CardResolution).resolutionType === 'timeout',
        ),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('an engaged-then-abandoned game never resolves later via its still-armed timer (#106)', () => {
    jest.useFakeTimers();
    try {
      const onCardAbandoned = jest.fn();
      const onCardResolved = jest.fn();
      renderFeed({ onCardAbandoned, onCardResolved });

      act(() => {
        fireEvent.press(screen.getByTestId('engage-b0-0'));
      });
      snapTo(1, 'b0-1'); // leave before resolve — slide 0 stays mounted (windowed).
      expect(onCardAbandoned).toHaveBeenCalledTimes(1);
      expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');

      // Past the time limit: the abandoned game must NOT now resolve.
      act(() => jest.advanceTimersByTime(5000));
      expect(onCardResolved).not.toHaveBeenCalled();
      expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('skip → revisit → engage → leave still emits onCardAbandoned once (independent latching)', () => {
    const onCardSkipped = jest.fn();
    const onCardAbandoned = jest.fn();
    renderFeed({ onCardSkipped, onCardAbandoned });

    snapTo(1, 'b0-1'); // 0 → 1: skip 0 (never engaged).
    expect(onCardSkipped).toHaveBeenCalledTimes(1);
    expect(onCardSkipped).toHaveBeenCalledWith(0, 'b0-0');

    snapTo(0, 'b0-0'); // 1 → 0: revisit the previously-skipped game.
    fireEvent.press(screen.getByTestId('engage-b0-0')); // engage it.
    snapTo(1, 'b0-1'); // 0 → 1: leaving an engaged game is an honest ABANDON.

    expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');
    // The earlier skip never re-fires for index 0.
    expect(onCardSkipped.mock.calls.filter(([i]) => i === 0)).toHaveLength(1);
  });

  it('plays a REAL game (spot_it) end-to-end through the default registry, firing the lifecycle seams (#128)', () => {
    // The default registry wires the four real native renderers. `fakeGetCardById`
    // yields a 1×1 spot_it card whose only cell IS the anomaly, so the real
    // SpotItCard renders a tappable grid and the engaging tap also resolves it.
    const onCardEngaged = jest.fn();
    const onCardResolved = jest.fn();
    render(
      <FeedScreen
        anonymousUserId="anon"
        source={fakeSource}
        registry={defaultRendererRegistry}
        getCardById={fakeGetCardById}
        onCardEngaged={onCardEngaged}
        onCardResolved={onCardResolved}
      />,
    );

    // The real renderer is mounted (its grid cell, not the stub affordances).
    // Scope to the active slide — windowed neighbours mount their own grids too.
    const activeGame = within(screen.getByTestId('feed-game-0'));
    expect(activeGame.getByTestId('spot-cell-0-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('engage-b0-0')).toBeNull();

    // Tapping the anomaly engages (first interaction) AND resolves the game.
    fireEvent.press(activeGame.getByTestId('spot-cell-0-0'));

    expect(onCardEngaged).toHaveBeenCalledTimes(1);
    expect(onCardEngaged).toHaveBeenCalledWith(0, 'b0-0');
    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', resolutionType: 'correct', isCorrect: true }),
    );
  });

  it('forwards a renderer explanation reveal to onCardExplanationViewed (#129)', () => {
    const onCardExplanationViewed = jest.fn();
    renderFeed({ onCardExplanationViewed }, explainingRegistry);

    fireEvent.press(screen.getByTestId('engage-b0-0'));

    expect(onCardExplanationViewed).toHaveBeenCalledTimes(1);
    expect(onCardExplanationViewed).toHaveBeenCalledWith(0, 'b0-0');
  });

  it('shows the uniform feedback + explanation after a real game resolves through the gated default registry (#133)', () => {
    const onCardResolved = jest.fn();
    const onCardExplanationViewed = jest.fn();
    render(
      <FeedScreen
        anonymousUserId="anon"
        source={fakeSource}
        registry={feedRegistry}
        getCardById={fakeGetCardById}
        onCardResolved={onCardResolved}
        onCardExplanationViewed={onCardExplanationViewed}
      />,
    );

    // Resolve the active spot_it game (its single cell is the anomaly).
    const activeGame = within(screen.getByTestId('feed-game-0'));
    fireEvent.press(activeGame.getByTestId('spot-cell-0-0'));

    // The gate replaces the game with the uniform feedback step + the explanation.
    const feedback = within(screen.getByTestId('feed-game-0'));
    expect(feedback.getByTestId('card-feedback')).toBeOnTheScreen();
    expect(feedback.getByTestId('feedback-outcome')).toHaveTextContent('Correct');
    expect(feedback.getByText('Why')).toBeOnTheScreen(); // explanation.title
    expect(feedback.getByText('Because.')).toBeOnTheScreen(); // explanation.body

    // The resolution + explanation-viewed seams still fire (telemetry unchanged).
    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', resolutionType: 'correct' }),
    );
    expect(onCardExplanationViewed).toHaveBeenCalledTimes(1);
    expect(onCardExplanationViewed).toHaveBeenCalledWith(0, 'b0-0');
  });

  it('a SKIPPED game produces no feedback step through the gated default registry (#133)', () => {
    const onCardExplanationViewed = jest.fn();
    render(
      <FeedScreen
        anonymousUserId="anon"
        source={fakeSource}
        registry={feedRegistry}
        getCardById={fakeGetCardById}
        onCardExplanationViewed={onCardExplanationViewed}
      />,
    );

    snapTo(1, 'b0-1'); // leave game 0 without ever resolving it.

    // Neither the left game nor the newly-active one shows feedback (un-resolved).
    expect(screen.queryByTestId('card-feedback')).toBeNull();
    expect(onCardExplanationViewed).not.toHaveBeenCalled();
  });

  it('latches skip per index — revisiting an un-engaged game never re-fires (#106)', () => {
    const onCardSkipped = jest.fn();
    renderFeed({ onCardSkipped });

    snapTo(1, 'b0-1'); // 0 → 1: skip 0
    snapTo(0, 'b0-0'); // 1 → 0: skip 1
    snapTo(1, 'b0-1'); // 0 → 1: 0 is latched

    expect(onCardSkipped.mock.calls.filter(([i]) => i === 0)).toHaveLength(1);
  });
});
