/**
 * Tests for the native Pattern Chain renderer (Azure DevOps #141; ported from web
 * `src/templates/patternChain/PatternChainCard.test.tsx`).
 *
 * Driven through @testing-library/react-native with an INJECTED clock and jest
 * fake timers, so no assertion depends on the real `Date.now()`. Fake timers
 * drive the shared `useCardTimer` countdown; the injected `now` supplies the
 * measured-time math.
 *
 * Pattern Chain has NO timed pre-phase: the sequence and the first step's options
 * mount immediately, so the controller sets `interactionEnabledAtMs ===
 * activeAtMs` and the timer arms on mount over the whole solve. Each pick reveals
 * the next step; `onAttempt` fires once on the first pick; `onResolve` fires once
 * after the last step (or on timeout).
 */

import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { PatternChainCard as PatternChainCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import PatternChainCard from './PatternChainCard';

// A two-step chain keeps the flow tiny; the catalog enforces 2–3 steps, but the
// renderer is step-count-agnostic.
function patternChainCard(
  overrides: Partial<PatternChainCardType['config']> = {},
): PatternChainCardType {
  return {
    cardId: 'pc-1',
    creatorHandle: '@test',
    templateType: 'pattern_chain',
    category: 'pattern_recognition',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Continue the sequence',
    puzzleDna: {
      mechanic: 'sequence-continuation',
      inputMode: 'choice',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      sequence: ['2', '4', '6'],
      steps: [
        {
          options: [
            { id: 's1-a', label: '7' },
            { id: 's1-b', label: '8' },
          ],
          correctOptionId: 's1-b',
        },
        {
          options: [
            { id: 's2-a', label: '9' },
            { id: 's2-b', label: '10' },
          ],
          correctOptionId: 's2-b',
        },
      ],
      timeLimitMs: 10_000,
      ...overrides,
    },
  };
}

function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

type RenderOpts = {
  card?: PatternChainCardType;
  context?: CardStartContext;
  now?: () => number;
  isActive?: boolean;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <PatternChainCard
      card={opts.card ?? patternChainCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
      isActive={opts.isActive}
    />,
  );
  return { onAttempt, onResolve };
}

const pick = (optionId: string) =>
  fireEvent.press(screen.getByTestId(`pc-option-${optionId}`));

const lastResolution = (onResolve: jest.Mock<void, [CardResolution]>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Step flow: the visible sequence is shown; each pick advances to the next step.
// ---------------------------------------------------------------------------

describe('step flow', () => {
  it('shows the visible sequence and the first step options on mount', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('pc-seq-0')).toHaveTextContent('2');
    expect(screen.getByTestId('pc-seq-2')).toHaveTextContent('6');
    // First step's options are present; the second step's are not yet.
    expect(screen.getByTestId('pc-option-s1-a')).toBeOnTheScreen();
    expect(screen.queryByTestId('pc-option-s2-a')).toBeNull();
  });

  it('advances to the next step on a pick, appending the chosen item', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    pick('s1-b'); // choose "8"

    // The chosen item is appended to the shown chain and step 2 is now visible.
    expect(screen.getByTestId('pc-seq-3')).toHaveTextContent('8');
    expect(screen.getByTestId('pc-option-s2-a')).toBeOnTheScreen();
    expect(screen.queryByTestId('pc-option-s1-a')).toBeNull();
    // Not done yet — the card has not resolved after only the first step.
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('announces step progress in a polite live region', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('pc-status')).toHaveTextContent('Step 1 of 2');

    pick('s1-b');
    // RN's toHaveTextContent is an exact match, so assert the whole line.
    expect(screen.getByTestId('pc-status')).toHaveTextContent(
      'Step 2 of 2. Picked: 8',
    );
  });
});

// ---------------------------------------------------------------------------
// Resolution: all-correct → correct; a wrong pick → incorrect; single-fire.
// ---------------------------------------------------------------------------

describe('resolving the chain', () => {
  it('fires onAttempt once on the first pick, with TTI', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_400; // first pick, 400ms after activation
    pick('s1-b');
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 400 });

    clock = 1_800; // second pick must NOT re-fire onAttempt
    pick('s2-b');
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves correct after the final step on an all-correct chain', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    pick('s1-b');
    expect(onResolve).not.toHaveBeenCalled();

    clock = 2_000;
    pick('s2-b');

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('pc-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);
    // Single-phase: both clocks share the activeAt origin (1_000).
    expect(resolution.elapsedMs).toBe(1_000); // 2_000 - 1_000
    expect(resolution.interactionElapsedMs).toBe(1_000);
    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.steps_total).toBe(2);
    expect(resolution.signals.steps_correct).toBe(2);
    expect(resolution.signals.first_error_step).toBe(-1);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('resolves incorrect on a wrong pick and flags the first error step', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_300;
    pick('s1-a'); // wrong first step
    clock = 1_700;
    pick('s2-b'); // correct second step — completes with one error

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.steps_correct).toBe(1);
    expect(resolution.signals.first_error_step).toBe(0);
  });

  it('ignores picks after the card has already resolved (no double-resolve)', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 1_200;
    pick('s1-b');
    clock = 1_400;
    pick('s2-b'); // resolves correct; card is now latched
    expect(onResolve).toHaveBeenCalledTimes(1);

    // The options are gone after the final step, but the live region remains;
    // assert no further resolution/attempt could have fired.
    expect(screen.queryByTestId('pc-option-s2-a')).toBeNull();
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer; arms on mount over the whole solve.
// ---------------------------------------------------------------------------

describe('timeout', () => {
  it('resolves timeout via useCardTimer when the limit elapses', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    // Just under the limit (10_000): nothing has resolved.
    act(() => void jest.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000; // activeAt 1_000 + timeLimit 10_000
    act(() => void jest.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.steps_total).toBe(2);
    expect(resolution.signals.steps_taken).toBe(0);
    expect(resolution.signals.time_to_interaction).toBe(-1);
  });

  it('reports partial progress when a timeout catches the player mid-chain', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    pick('s1-b'); // one step taken, then the player stalls

    clock = 11_000;
    act(() => void jest.advanceTimersByTime(10_000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.steps_taken).toBe(1);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_200;
    pick('s1-b');
    clock = 1_400;
    pick('s2-b'); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void jest.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
