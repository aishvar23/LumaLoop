/**
 * Tests for the native Code Break renderer (Azure DevOps #143; ported from web
 * `src/templates/codeBreak/CodeBreakCard.test.tsx`).
 *
 * Driven through @testing-library/react-native with an INJECTED clock and jest
 * fake timers, so no assertion depends on the real `Date.now()`. Fake timers
 * drive the shared `useCardTimer` countdown; the injected `now` supplies the
 * measured-time math.
 *
 * Code Break has NO timed pre-phase: the board, builder, and palette mount
 * immediately, so the controller sets `interactionEnabledAtMs === activeAtMs` and
 * the timer arms on mount over the whole solve. Peg counting itself is covered
 * exhaustively in the pure `codeBreakEvaluator.test.ts`; here we verify the
 * renderer routes through the evaluator and resolves correctly.
 */

import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { CodeBreakCard as CodeBreakCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import CodeBreakCard from './CodeBreakCard';

function codeBreakCard(
  overrides: Partial<CodeBreakCardType['config']> = {},
): CodeBreakCardType {
  return {
    cardId: 'cb-1',
    creatorHandle: '@test',
    templateType: 'code_break',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 25,
    prompt: 'Crack the code',
    puzzleDna: {
      mechanic: 'deductive-code-breaking',
      inputMode: 'tap',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      palette: ['A', 'B', 'C'],
      codeLength: 3,
      secret: ['A', 'B', 'C'],
      maxGuesses: 4,
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
  card?: CodeBreakCardType;
  context?: CardStartContext;
  now?: () => number;
  isActive?: boolean;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <CodeBreakCard
      card={opts.card ?? codeBreakCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
      isActive={opts.isActive}
    />,
  );
  return { onAttempt, onResolve };
}

const place = (symbol: string) =>
  fireEvent.press(screen.getByTestId(`cb-palette-${symbol}`));

const submit = () => fireEvent.press(screen.getByTestId('cb-submit'));

const enterGuess = (symbols: string[]) => {
  for (const s of symbols) place(s);
};

const lastResolution = (onResolve: jest.Mock<void, [CardResolution]>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('builder flow', () => {
  it('renders the prompt, slots, and palette on mount', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('cb-prompt')).toHaveTextContent('Crack the code');
    expect(screen.getByTestId('cb-slot-0')).toBeOnTheScreen();
    expect(screen.getByTestId('cb-slot-2')).toBeOnTheScreen();
    expect(screen.getByTestId('cb-palette-A')).toBeOnTheScreen();
  });

  it('fires onAttempt once on the first interaction with TTI', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_350;
    place('A');
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 350 });

    clock = 1_900;
    place('B');
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('guessing + feedback', () => {
  it('appends a peg-feedback row after a non-winning guess', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    // Guess B A C vs secret A B C → C exact; A,B present misplaced.
    enterGuess(['B', 'A', 'C']);
    submit();

    expect(screen.getByTestId('cb-feedback-0')).toHaveTextContent(
      '1 exact, 2 partial',
    );
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('resolves correct the instant a guess equals the secret', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    enterGuess(['A', 'B', 'C']);
    clock = 3_000;
    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('cb-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);
    expect(resolution.elapsedMs).toBe(2_000);
    expect(resolution.interactionElapsedMs).toBe(2_000);
    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.guesses_used).toBe(1);
    expect(resolution.signals.final_exact).toBe(3);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('resolves incorrect when maxGuesses are exhausted without solving', () => {
    const { onResolve } = renderCard({
      card: codeBreakCard({ maxGuesses: 2 }),
      now: () => 1_000,
    });

    enterGuess(['B', 'B', 'B']);
    submit();
    expect(onResolve).not.toHaveBeenCalled();

    enterGuess(['C', 'C', 'C']);
    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.guesses_used).toBe(2);
  });

  it('ignores input after the card has resolved (no double-resolve)', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    enterGuess(['A', 'B', 'C']);
    submit();
    expect(onResolve).toHaveBeenCalledTimes(1);

    place('A');
    place('A');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('timeout', () => {
  it('resolves timeout when the limit elapses with no guess submitted', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    act(() => void jest.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000;
    act(() => void jest.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.guesses_used).toBe(0);
    expect(resolution.signals.time_to_interaction).toBe(-1);
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    enterGuess(['A', 'B', 'C']);
    submit();
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void jest.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
