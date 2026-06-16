/**
 * Feed/session controller (Azure DevOps #59; Technical Design §4, §8).
 *
 * These tests exercise the controller through a tiny harness + a STUB renderer
 * — never a real template renderer (#64-67), keeping the controller's
 * template-agnostic boundary honest. The wall clock is always injected and the
 * duration timer is driven by vitest fake timers, so no assertion depends on
 * the real `Date.now()`.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LiquidCard,
  TinyLogicCard,
} from '../cards/types';
import type { CardResolution, TemplateProps } from '../templates/contract';
import type { RendererRegistry } from './rendererRegistry';
import { useSessionController } from './useSessionController';
import type {
  SessionCardInput,
  SessionController,
  SessionControllerOptions,
} from './useSessionController';

// ---------------------------------------------------------------------------
// Stub renderer — calls onResolve via a button. NOT a real template renderer.
// ---------------------------------------------------------------------------

function StubRenderer({ card, context, onAttempt, onResolve }: TemplateProps<LiquidCard>) {
  return (
    <div>
      <span data-testid="stub-card">{card.cardId}</span>
      <span data-testid="stub-index">{context.cardIndex}</span>
      <button type="button" onClick={() => onAttempt({ touched: true })}>
        {`attempt ${card.cardId}`}
      </button>
      <button
        type="button"
        onClick={() =>
          onResolve({
            cardId: card.cardId,
            resolutionType: 'correct',
            isCorrect: true,
            elapsedMs: 100,
            interactionElapsedMs: 80,
            attemptCount: 1,
            signals: {},
          })
        }
      >
        {`resolve ${card.cardId}`}
      </button>
    </div>
  );
}

/** A registry that renders every template with the stub. */
const fullRegistry: RendererRegistry = {
  spot_it: StubRenderer,
  what_changed: StubRenderer,
  rule_flip: StubRenderer,
  tiny_logic: StubRenderer,
};

// ---------------------------------------------------------------------------
// Test cards (typed; not necessarily in the catalog — resolved via getCardById).
// ---------------------------------------------------------------------------

function tinyLogicCard(cardId: string): TinyLogicCard {
  return {
    cardId,
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'stub',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['accuracy'] },
    explanation: { title: 't', body: 'b' },
    config: {
      stem: 'stub?',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      correctOptionId: 'a',
      timeLimitMs: 10_000,
    },
  };
}

// ---------------------------------------------------------------------------
// Harness — exposes the controller object and renders the active card element.
// ---------------------------------------------------------------------------

type Captured = { current: SessionController | null };

function Harness(props: SessionControllerOptions & { capture: Captured }) {
  const { capture, ...options } = props;
  const controller = useSessionController(options);
  // Expose the latest controller to the test. Assigning during render is fine
  // in a test harness; the last commit wins after act() flushes.
  capture.current = controller;
  return (
    <div>
      <span data-testid="status">{controller.status}</span>
      <span data-testid="index">{controller.index}</span>
      <span data-testid="total">{controller.total}</span>
      <span data-testid="results">{controller.results.length}</span>
      <span data-testid="current">{controller.currentCard?.cardId ?? 'none'}</span>
      {controller.activeCardElement}
    </div>
  );
}

function renderController(
  options: Omit<SessionControllerOptions, 'registry'> &
    Partial<Pick<SessionControllerOptions, 'registry'>>,
): Captured {
  const capture: Captured = { current: null };
  render(
    <Harness
      capture={capture}
      {...options}
      registry={options.registry ?? fullRegistry}
    />,
  );
  return capture;
}

const status = () => screen.getByTestId('status').textContent;
const indexText = () => screen.getByTestId('index').textContent;
const current = () => screen.getByTestId('current').textContent;
const resultsCount = () => screen.getByTestId('results').textContent;

function startSession(
  capture: Captured,
  mode: Parameters<SessionController['start']>[0],
  cards: ReadonlyArray<SessionCardInput>,
) {
  act(() => capture.current!.start(mode, cards));
}

function clickResolve(cardId: string) {
  act(() => {
    fireEvent.click(screen.getByText(`resolve ${cardId}`));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Drop any still-armed session timer WITHOUT firing it: executing it here
  // would dispatch COMPLETE outside act() (a harmless but noisy warning).
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Starting a session.
// ---------------------------------------------------------------------------

describe('starting a session', () => {
  it('presents card 0 once started', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1'), tinyLogicCard('c2')];
    const capture = renderController({ now: () => 0 });

    expect(status()).toBe('idle');
    startSession(capture, 'one_minute_rescue', cards);

    expect(status()).toBe('resolving_card');
    expect(current()).toBe('c0');
    expect(indexText()).toBe('0');
    expect(screen.getByTestId('total').textContent).toBe('3');
    // The renderer received the start context for card 0.
    expect(screen.getByTestId('stub-index').textContent).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Progression to completion at the card-COUNT limit.
// ---------------------------------------------------------------------------

describe('progression to the card-count limit', () => {
  it('advances through 3 cards to completed (one_minute_rescue)', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1'), tinyLogicCard('c2')];
    const onCardResolved = vi.fn();
    const onSessionCompleted = vi.fn();
    const capture = renderController({
      now: () => 1_000,
      onCardResolved,
      onSessionCompleted,
    });

    startSession(capture, 'one_minute_rescue', cards);

    clickResolve('c0');
    expect(status()).toBe('resolving_card');
    expect(current()).toBe('c1');
    expect(indexText()).toBe('1');

    clickResolve('c1');
    expect(current()).toBe('c2');
    expect(indexText()).toBe('2');

    clickResolve('c2');
    expect(status()).toBe('completed');
    expect(indexText()).toBe('3');
    expect(current()).toBe('none');
    expect(resultsCount()).toBe('3');

    expect(onCardResolved).toHaveBeenCalledTimes(3);
    expect(onSessionCompleted).toHaveBeenCalledTimes(1);
    expect(onSessionCompleted.mock.calls[0][0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Completion when the provided cards run out before the count limit
// (exercises the controller's pre-start guard in effect A).
// ---------------------------------------------------------------------------

describe('out of cards', () => {
  it('completes when fewer cards than maxCards are provided', () => {
    // one_minute_rescue allows 3 cards; provide only 2.
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1')];
    const capture = renderController({ now: () => 0 });

    startSession(capture, 'one_minute_rescue', cards);
    clickResolve('c0');
    expect(status()).toBe('resolving_card');
    expect(current()).toBe('c1');

    clickResolve('c1');
    // Reducer would keep this active (index 2 < maxCards 3), but the controller
    // sees the cards ran out and completes instead of starting a 3rd card.
    expect(status()).toBe('completed');
    expect(indexText()).toBe('2');
    expect(current()).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Duration limit (fake timers): no new card starts; session completes.
// ---------------------------------------------------------------------------

describe('duration limit', () => {
  it('completes the session when the duration timer fires mid-card and starts no new card', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1'), tinyLogicCard('c2')];
    const onCardResolved = vi.fn();
    const onSessionCompleted = vi.fn();
    // Clock stays at 0 throughout; the SESSION timer (setTimeout) is what fires.
    const capture = renderController({
      now: () => 0,
      onCardResolved,
      onSessionCompleted,
    });

    startSession(capture, 'one_minute_rescue', cards); // 60_000ms window
    clickResolve('c0');
    expect(current()).toBe('c1'); // card 1 is in flight
    expect(resultsCount()).toBe('1');

    // The duration window elapses while card 1 is still in play.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(status()).toBe('completed');
    // No NEW card started: still on index 1, no card-2 element.
    expect(indexText()).toBe('1');
    expect(current()).toBe('none');
    expect(screen.queryByText('resolve c2')).toBeNull();
    expect(onSessionCompleted).toHaveBeenCalledTimes(1);

    // The in-flight card "finishing" late is a tolerated no-op: calling resolve
    // after completion neither throws, advances, nor fires a callback.
    act(() => capture.current!.resolveActiveCard({
      cardId: 'c1',
      resolutionType: 'correct',
      isCorrect: true,
      elapsedMs: 10,
      interactionElapsedMs: 5,
      attemptCount: 1,
      signals: {},
    }));
    expect(status()).toBe('completed');
    expect(resultsCount()).toBe('1');
    expect(onCardResolved).toHaveBeenCalledTimes(1); // only c0
  });

  it('completes (does not start a new card) if a card resolves exactly at the limit', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1')];
    let clock = 0;
    const capture = renderController({ now: () => clock });

    startSession(capture, 'one_minute_rescue', cards);
    // Resolve card 0 exactly at the duration limit: the reducer itself settles
    // to completed (inclusive >=), so the controller never starts card 1.
    clock = 60_000;
    clickResolve('c0');
    expect(status()).toBe('completed');
    expect(indexText()).toBe('1');
    expect(screen.queryByText('resolve c1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Missing renderer fails safe.
// ---------------------------------------------------------------------------

describe('missing renderer fails safe', () => {
  it('resolves a card as an error and advances when its template has no renderer', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1')];
    const onCardResolved = vi.fn();
    // Registry intentionally omits tiny_logic.
    const partialRegistry: RendererRegistry = { spot_it: StubRenderer };
    const capture = renderController({
      now: () => 0,
      registry: partialRegistry,
      onCardResolved,
    });

    startSession(capture, 'one_minute_rescue', cards);

    // Both tiny_logic cards have no renderer -> each fails safe and advances.
    // With only 2 cards and both unrenderable, the session completes.
    expect(status()).toBe('completed');
    expect(resultsCount()).toBe('2');
    expect(onCardResolved).toHaveBeenCalledTimes(2);
    const first = onCardResolved.mock.calls[0][0] as CardResolution;
    expect(first.resolutionType).toBe('incorrect');
    expect(first.isCorrect).toBe(false);
    expect(first.signals.rendererMissing).toBe(true);
    expect(first.cardId).toBe('c0');
  });

  it('does not crash and skips a single unrenderable card among renderable ones', () => {
    // All three share a template, so model "unrenderable" via an unknown card
    // id: getCardById returns undefined for 'bad-1' while the others resolve.
    const known = new Map<string, LiquidCard>([
      ['good-0', tinyLogicCard('good-0')],
      ['good-2', tinyLogicCard('good-2')],
    ]);
    const capture = renderController({
      now: () => 0,
      getCardById: (id) => known.get(id),
      // pass ids (strings) so resolution goes through getCardById
    });

    startSession(capture, 'one_minute_rescue', ['good-0', 'bad-1', 'good-2']);
    expect(current()).toBe('good-0');

    clickResolve('good-0');
    // 'bad-1' is unresolvable -> fails safe -> advances to good-2.
    expect(current()).toBe('good-2');
    expect(status()).toBe('resolving_card');

    clickResolve('good-2');
    expect(status()).toBe('completed');
    expect(resultsCount()).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// Exit + intentional continue.
// ---------------------------------------------------------------------------

describe('exit', () => {
  it('takes the session to exited and clears the active card', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1'), tinyLogicCard('c2')];
    const capture = renderController({ now: () => 0 });
    startSession(capture, 'one_minute_rescue', cards);
    expect(current()).toBe('c0');

    act(() => capture.current!.exitSession());
    expect(status()).toBe('exited');
    expect(current()).toBe('none');
  });
});

describe('intentional continue', () => {
  it('continues from completed, then a fresh start re-arms a new window', () => {
    const cards = [tinyLogicCard('c0'), tinyLogicCard('c1'), tinyLogicCard('c2')];
    let sessionSeq = 0;
    const capture = renderController({
      now: () => 0,
      generateSessionId: () => `sess-${++sessionSeq}`,
    });

    startSession(capture, 'one_minute_rescue', cards);
    clickResolve('c0');
    clickResolve('c1');
    clickResolve('c2');
    expect(status()).toBe('completed');

    act(() => capture.current!.continueSession());
    expect(status()).toBe('intentional_continue');

    // Re-arm with fresh cards -> a brand new active window at card 0.
    const next = [tinyLogicCard('d0'), tinyLogicCard('d1'), tinyLogicCard('d2')];
    startSession(capture, 'three_minute_reset', next);
    expect(status()).toBe('resolving_card');
    expect(current()).toBe('d0');
    expect(indexText()).toBe('0');
    expect(resultsCount()).toBe('0');
    expect(capture.current!.mode).toBe('three_minute_reset');
    expect(capture.current!.state.sessionId).toBe('sess-2');
  });
});

// ---------------------------------------------------------------------------
// Injected clock + getCardById are honored (no real Date.now / catalog).
// ---------------------------------------------------------------------------

describe('injected dependencies are honored', () => {
  it('uses the injected clock for startedAtMs (never real Date.now)', () => {
    const cards = [tinyLogicCard('c0')];
    const capture = renderController({ now: () => 12_345 });
    startSession(capture, 'one_minute_rescue', cards);
    expect(capture.current!.state.startedAtMs).toBe(12_345);
  });

  it('resolves cardIds through the injected getCardById (not the catalog)', () => {
    const custom = tinyLogicCard('not-in-catalog');
    const getCardById = vi.fn((id: string) =>
      id === 'not-in-catalog' ? custom : undefined,
    );
    const capture = renderController({ now: () => 0, getCardById });

    startSession(capture, 'one_minute_rescue', ['not-in-catalog']);
    expect(current()).toBe('not-in-catalog');
    expect(getCardById).toHaveBeenCalledWith('not-in-catalog');
  });
});

// ---------------------------------------------------------------------------
// onAttempt is forwarded from the renderer.
// ---------------------------------------------------------------------------

describe('onAttempt forwarding', () => {
  it('forwards the renderer first-input signal to the lifecycle callback', () => {
    const cards = [tinyLogicCard('c0')];
    const onAttempt = vi.fn();
    const capture = renderController({ now: () => 0, onAttempt });
    startSession(capture, 'one_minute_rescue', cards);

    act(() => {
      fireEvent.click(screen.getByText('attempt c0'));
    });
    expect(onAttempt).toHaveBeenCalledWith({ touched: true });
  });
});
