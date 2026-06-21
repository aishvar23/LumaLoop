/**
 * Tests for the full-screen swipe/snap FeedScreen (#105, docs/FEED_DIRECTION.md
 * §3.1). The renderer + deck source + anonymous id are all injected so the feed
 * is deterministic and template-agnostic (no real catalog, no real games).
 *
 * jsdom ships no IntersectionObserver, so a minimal typed mock stands in: it
 * captures the observer callback and lets a test simulate a slide snapping into
 * view (the real on-scroll signal that drives the active index → endless growth).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiquidCard, SpotItCard } from '../cards/types';
import type { RendererRegistry } from '../session/rendererRegistry';
import type { CardResolution, TemplateProps } from '../templates/contract';
import { useCardTimer } from '../templates/useCardTimer';
import type { FeedBatchSource } from './feedDeck';
import FeedScreen from './FeedScreen';

// --- IntersectionObserver mock -------------------------------------------------

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IOCallback;
  readonly observed = new Set<Element>();

  constructor(callback: IOCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Simulate `el` snapping into view at `ratio` visibility. */
  emit(el: Element, ratio = 1): void {
    this.callback([
      {
        target: el,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      } as IntersectionObserverEntry,
    ]);
  }
}

// --- Deterministic feed source + stub renderer ---------------------------------

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

const fakeGetCardById = (cardId: string): LiquidCard | undefined =>
  makeCard(cardId);

/**
 * A stub renderer wired to the SHARED {@link useCardTimer} (template-agnostic),
 * so it honours the feed's engage-gated timing exactly like the real renderers:
 *  - an "engage" button fires `onAttempt` + `markAttempt` (first interaction);
 *  - a "resolve" button drives a correct resolution through the timer.
 * Because the feed disarms the timer until engagement, advancing fake timers
 * before pressing "engage" produces NO timeout; afterwards a timeout can fire.
 */
function StubRenderer({
  card,
  context,
  onAttempt,
  onResolve,
}: TemplateProps<SpotItCard>) {
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
    <>
      <button
        type="button"
        data-testid={`engage-${card.cardId}`}
        onClick={() => {
          onAttempt({ time_to_first_tap: 1 });
          timer.markAttempt();
        }}
      >
        engage:{card.cardId}
      </button>
      <button
        type="button"
        data-testid={`stub-${card.cardId}`}
        onClick={() => timer.resolve(resolution)}
      >
        game:{card.cardId}
      </button>
    </>
  );
}

const stubRegistry: RendererRegistry = { spot_it: StubRenderer };

/**
 * A SINGLE-TAP renderer: one click ENGAGES and RESOLVES in the same tick (e.g.
 * `what_changed` / `tiny_logic`). This is the blocker repro — the engaging tap
 * flips the card's `timeLimitMs` from ∞ to finite, re-arming a fresh timer on an
 * already-resolved slide. The feed-level dedup must keep `onCardResolved` to a
 * single `correct` with NO phantom `timeout`.
 */
function SingleTapRenderer({
  card,
  context,
  onAttempt,
  onResolve,
}: TemplateProps<SpotItCard>) {
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
    <button
      type="button"
      data-testid={`tap-${card.cardId}`}
      onClick={() => {
        onAttempt({ time_to_first_tap: 1 });
        timer.markAttempt();
        timer.resolve(resolution);
      }}
    >
      tap:{card.cardId}
    </button>
  );
}

const singleTapRegistry: RendererRegistry = { spot_it: SingleTapRenderer };

/**
 * A probe renderer that surfaces the template-agnostic `isActive` activation
 * signal (#137) so a test can assert the feed passes it to the focused slide
 * only. Renders `active` / `inactive` text for each mounted (windowed) slide.
 */
function IsActiveProbe({ card, isActive }: TemplateProps<SpotItCard>) {
  return (
    <span data-testid={`active-${card.cardId}`}>
      {isActive ? 'active' : 'inactive'}
    </span>
  );
}

const isActiveRegistry: RendererRegistry = { spot_it: IsActiveProbe };

type LifecycleHandlers = {
  onCardEngaged?: (i: number, cardId: string) => void;
  onCardSkipped?: (i: number, cardId: string) => void;
  onCardAbandoned?: (i: number, cardId: string) => void;
  onCardResolved?: (i: number, r: CardResolution) => void;
};

function renderFeed(extra?: LifecycleHandlers, registry: RendererRegistry = stubRegistry) {
  return render(
    <FeedScreen
      anonymousUserId="anon"
      source={fakeSource}
      registry={registry}
      getCardById={fakeGetCardById}
      onCardEngaged={extra?.onCardEngaged}
      onCardSkipped={extra?.onCardSkipped}
      onCardAbandoned={extra?.onCardAbandoned}
      onCardResolved={extra?.onCardResolved}
    />,
  );
}

const scroller = () => screen.getByTestId('feed-scroller');

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedScreen', () => {
  it('exposes an accessible feed landmark and renders the first active game', () => {
    renderFeed();
    expect(
      screen.getByRole('heading', { name: 'Game feed' }),
    ).toBeInTheDocument();
    // The active game (index 0) is mounted with the first deck card.
    expect(screen.getByTestId('feed-game-0')).toHaveTextContent('game:b0-0');
  });

  it('renders the creator byline exactly once with no doubled @', () => {
    renderFeed();
    // creatorHandle already carries the `@`; the byline must not add another.
    expect(screen.getAllByText('@creator_b0-0').length).toBeGreaterThan(0);
    expect(screen.queryByText('@@creator_b0-0')).not.toBeInTheDocument();
  });

  it('only mounts games inside the active window; others are placeholders', () => {
    renderFeed();
    // Active is 0 → indices 0 and 1 are windowed, 2+ are placeholders.
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
    expect(screen.getByTestId('feed-game-1')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-game-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-placeholder-3')).toBeInTheDocument();
  });

  it('advances the active game on ArrowDown and never empties (endless)', () => {
    renderFeed();
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(screen.getByTestId('feed-game-1')).toHaveTextContent('game:b0-1');

    for (let i = 0; i < 40; i += 1) {
      fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    }
    // 41 advances from index 1 → index 41 still materialises a real game.
    expect(screen.getByTestId('feed-game-41')).toBeInTheDocument();
  });

  it('clamps at the start on ArrowUp', () => {
    renderFeed();
    fireEvent.keyDown(scroller(), { key: 'ArrowUp' });
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
    // Still the first card — nothing advanced past it.
    expect(screen.getByTestId('feed-game-0')).toHaveTextContent('game:b0-0');
  });

  it('updates the active game when a slide snaps into view (IntersectionObserver)', () => {
    const { container } = renderFeed();
    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();

    const slideTwo = container.querySelector('[data-index="2"]');
    expect(slideTwo).not.toBeNull();
    act(() => {
      observer.emit(slideTwo as Element, 1);
    });

    // Active moved to 2 → its game mounts, and the no-longer-windowed index 0
    // collapses back to a placeholder.
    expect(screen.getByTestId('feed-game-2')).toHaveTextContent('game:b0-2');
    expect(screen.queryByTestId('feed-game-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-placeholder-0')).toBeInTheDocument();
  });

  it('passes isActive only to the focused slide; advancing moves it (#137)', () => {
    renderFeed(undefined, isActiveRegistry);

    // Active is index 0: only its slide is active; the pre-mounted neighbour
    // (index 1, windowed but off-screen) is inactive — so a timed pre-phase there
    // cannot elapse before the user swipes to it.
    expect(screen.getByTestId('active-b0-0')).toHaveTextContent('active');
    expect(screen.getByTestId('active-b0-1')).toHaveTextContent('inactive');

    // Advancing makes index 1 the focused slide; index 0 is no longer active.
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(screen.getByTestId('active-b0-1')).toHaveTextContent('active');
    expect(screen.getByTestId('active-b0-0')).toHaveTextContent('inactive');
  });

  it('records a resolution locally without auto-advancing (#106 seam)', () => {
    const onCardResolved = vi.fn();
    renderFeed({ onCardResolved });
    fireEvent.click(screen.getByTestId('stub-b0-0'));

    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', isCorrect: true }),
    );
    // The feed did NOT advance — index 1 is still a windowed game, not the active
    // focus moving on. (Active stays 0; the user swipes to continue.)
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
  });

  it('does NOT arm a game timer until the player engages it (#106)', () => {
    vi.useFakeTimers();
    try {
      const onCardResolved = vi.fn();
      renderFeed({ onCardResolved });

      // The active game is mounted but untouched. Advancing well past its 1000ms
      // time limit must NOT produce a timeout — the timer is gated off until the
      // player engages (it arms on becoming active in the old static-context bug).
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onCardResolved).not.toHaveBeenCalled();

      // Engaging arms a FRESH full-duration countdown from the engage instant.
      act(() => {
        fireEvent.click(screen.getByTestId('engage-b0-0'));
      });
      expect(onCardResolved).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(onCardResolved).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ cardId: 'b0-0', resolutionType: 'timeout' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('swiping past an un-engaged game is a SKIP — no resolution, no abandon (#106)', () => {
    const onCardSkipped = vi.fn();
    const onCardAbandoned = vi.fn();
    const onCardResolved = vi.fn();
    renderFeed({ onCardSkipped, onCardAbandoned, onCardResolved });

    // Leave game 0 without ever interacting with it.
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });

    expect(onCardSkipped).toHaveBeenCalledTimes(1);
    expect(onCardSkipped).toHaveBeenCalledWith(0, 'b0-0');
    expect(onCardAbandoned).not.toHaveBeenCalled();
    expect(onCardResolved).not.toHaveBeenCalled();
  });

  it('engaging then leaving before resolve is an ABANDONED attempt — not a skip (#106)', () => {
    const onCardSkipped = vi.fn();
    const onCardAbandoned = vi.fn();
    const onCardResolved = vi.fn();
    renderFeed({ onCardSkipped, onCardAbandoned, onCardResolved });

    // Engage game 0, then swipe away before it resolves.
    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });

    expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');
    expect(onCardSkipped).not.toHaveBeenCalled();
    expect(onCardResolved).not.toHaveBeenCalled();
  });

  it('engage → resolve still fires onCardResolved and never skip/abandon (#106)', () => {
    const onCardEngaged = vi.fn();
    const onCardSkipped = vi.fn();
    const onCardAbandoned = vi.fn();
    const onCardResolved = vi.fn();
    renderFeed({ onCardEngaged, onCardSkipped, onCardAbandoned, onCardResolved });

    // Engaging twice still signals engagement exactly once.
    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.click(screen.getByTestId('engage-b0-0'));
    expect(onCardEngaged).toHaveBeenCalledTimes(1);
    expect(onCardEngaged).toHaveBeenCalledWith(0, 'b0-0');

    // Resolving the played game fires the resolution seam (unchanged).
    fireEvent.click(screen.getByTestId('stub-b0-0'));
    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', isCorrect: true }),
    );

    // Swiping away from a resolved game is neither a skip nor an abandon.
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(onCardSkipped).not.toHaveBeenCalled();
    expect(onCardAbandoned).not.toHaveBeenCalled();
  });

  it('single-tap engage+resolve fires onCardResolved EXACTLY once — no phantom timeout (#106 blocker)', () => {
    vi.useFakeTimers();
    try {
      const onCardResolved = vi.fn();
      renderFeed({ onCardResolved }, singleTapRegistry);

      // One click engages AND resolves the slide in the same tick. Engaging flips
      // the card's timeLimitMs ∞→1000, re-arming a fresh timer on the now-resolved
      // slide; the feed-level dedup must drop that phantom timeout.
      act(() => {
        fireEvent.click(screen.getByTestId('tap-b0-0'));
      });

      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(onCardResolved).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ cardId: 'b0-0', resolutionType: 'correct' }),
      );

      // Advancing past the re-armed countdown must NOT produce a second (timeout)
      // resolution for the same slide.
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onCardResolved).toHaveBeenCalledTimes(1);
      expect(
        onCardResolved.mock.calls.some(
          ([, r]) => (r as CardResolution).resolutionType === 'timeout',
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an engaged-then-abandoned game never resolves later via its still-armed timer (#106 major)', () => {
    vi.useFakeTimers();
    try {
      const onCardAbandoned = vi.fn();
      const onCardResolved = vi.fn();
      renderFeed({ onCardAbandoned, onCardResolved });

      // Engage game 0 (arms its 1000ms timer), then leave before it resolves. The
      // left slide stays mounted within WINDOW_RADIUS so its timer keeps running.
      act(() => {
        fireEvent.click(screen.getByTestId('engage-b0-0'));
      });
      fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
      expect(onCardAbandoned).toHaveBeenCalledTimes(1);
      expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');

      // Push past the time limit: the abandoned game must NOT now resolve.
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onCardResolved).not.toHaveBeenCalled();
      expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skip → revisit → engage → leave still emits onCardAbandoned once (#108 independent latching)', () => {
    const onCardSkipped = vi.fn();
    const onCardAbandoned = vi.fn();
    renderFeed({ onCardSkipped, onCardAbandoned });

    // 0 → 1: skip 0 (never engaged).
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(onCardSkipped).toHaveBeenCalledTimes(1);
    expect(onCardSkipped).toHaveBeenCalledWith(0, 'b0-0');

    // 1 → 0: revisit the previously-skipped game, then engage it.
    fireEvent.keyDown(scroller(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByTestId('engage-b0-0'));

    // 0 → 1: leaving an engaged game is an honest ABANDON even though it was
    // skipped earlier — skip and abandon latch independently.
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(onCardAbandoned).toHaveBeenCalledTimes(1);
    expect(onCardAbandoned).toHaveBeenCalledWith(0, 'b0-0');
    // The earlier skip never re-fires for index 0.
    expect(
      onCardSkipped.mock.calls.filter(([index]) => index === 0),
    ).toHaveLength(1);
  });

  it('latches skip per index — revisiting an un-engaged game never re-fires (#106)', () => {
    const onCardSkipped = vi.fn();
    renderFeed({ onCardSkipped });

    fireEvent.keyDown(scroller(), { key: 'ArrowDown' }); // 0 → 1: skip 0
    fireEvent.keyDown(scroller(), { key: 'ArrowUp' }); // 1 → 0: skip 1
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' }); // 0 → 1: 0 is latched

    const skippedZero = onCardSkipped.mock.calls.filter(([index]) => index === 0);
    expect(skippedZero).toHaveLength(1);
  });
});
