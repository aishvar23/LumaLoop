/**
 * Tests for the Code Break renderer (Azure DevOps #143; Tech §6, §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers, so no assertion depends on the real `Date.now()`. Fake timers drive the
 * shared `useCardTimer` countdown; the injected `now` supplies the measured-time
 * math.
 *
 * Code Break has NO timed pre-phase: the board, builder, and palette mount
 * immediately, so the controller sets `interactionEnabledAtMs === activeAtMs` and
 * the timer arms on mount over the whole solve. Building + submitting a guess
 * appends a peg-feedback row; `onAttempt` fires once on the first interaction;
 * `onResolve` fires once on a solve, exhausted guesses, or timeout. Peg counting
 * itself is covered exhaustively in `codeBreakEvaluator.test.ts`; here we verify
 * the renderer routes through the evaluator and resolves correctly.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodeBreakCard as CodeBreakCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import CodeBreakCard from './CodeBreakCard';

// ---------------------------------------------------------------------------
// Fixtures. A 3-slot code over a 3-symbol palette keeps the flow tiny while
// still exercising exact/partial feedback; maxGuesses is small for the
// "exhausted" path.
// ---------------------------------------------------------------------------

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
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
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
  act(() => void fireEvent.click(screen.getByTestId(`cb-palette-${symbol}`)));

const submit = () =>
  act(() => void fireEvent.click(screen.getByTestId('cb-submit')));

/** Build a full guess by placing symbols into the auto-advancing active slot. */
const enterGuess = (symbols: string[]) => {
  for (const s of symbols) place(s);
};

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Builder flow.
// ---------------------------------------------------------------------------

describe('builder flow', () => {
  it('renders the prompt, slots, palette, and submit', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('cb-prompt')).toHaveTextContent('Crack the code');
    expect(screen.getByTestId('cb-slot-0')).toBeInTheDocument();
    expect(screen.getByTestId('cb-slot-2')).toBeInTheDocument();
    expect(screen.getByTestId('cb-palette-A')).toBeInTheDocument();
  });

  it('disables submit until every slot is filled', () => {
    renderCard({ now: () => 1_000 });
    expect(screen.getByTestId('cb-submit')).toBeDisabled();

    place('A');
    place('B');
    expect(screen.getByTestId('cb-submit')).toBeDisabled();

    place('C');
    expect(screen.getByTestId('cb-submit')).not.toBeDisabled();
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

// ---------------------------------------------------------------------------
// Per-guess peg feedback + resolution.
// ---------------------------------------------------------------------------

describe('guessing + feedback', () => {
  it('appends a peg-feedback row after each non-winning guess', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    // Guess B A C vs secret A B C → C exact (slot 2); A,B present misplaced.
    enterGuess(['B', 'A', 'C']);
    submit();

    expect(screen.getByTestId('cb-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('cb-feedback-0')).toHaveTextContent(
      '1 exact, 2 partial',
    );
    // Not solved → no resolution yet.
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
    expect(resolution.elapsedMs).toBe(2_000); // 3_000 - 1_000
    expect(resolution.interactionElapsedMs).toBe(2_000);
    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.guesses_used).toBe(1);
    expect(resolution.signals.final_exact).toBe(3);
    expect(resolution.signals.final_partial).toBe(0);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('resolves incorrect when maxGuesses are exhausted without solving', () => {
    const { onResolve } = renderCard({
      card: codeBreakCard({ maxGuesses: 2 }),
      now: () => 1_000,
    });

    // Two wrong guesses (never the secret A B C).
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
    expect(resolution.signals.guesses_allowed).toBe(2);
  });

  it('announces the latest result and remaining guesses politely', () => {
    renderCard({ now: () => 1_000 });

    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('4 guesses left');

    enterGuess(['B', 'A', 'C']);
    submit();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Last guess: 1 exact, 2 partial',
    );
    expect(screen.getByRole('status')).toHaveTextContent('3 guesses left');
  });

  it('ignores input after the card has resolved (no double-resolve)', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    enterGuess(['A', 'B', 'C']);
    submit(); // resolves correct
    expect(onResolve).toHaveBeenCalledTimes(1);

    // Late palette taps must be inert.
    place('A');
    place('A');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer; arms on mount over the whole solve.
// ---------------------------------------------------------------------------

describe('timeout', () => {
  it('resolves timeout when the limit elapses with no guess submitted', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    act(() => void vi.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000; // activeAt 1_000 + timeLimit 10_000
    act(() => void vi.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.guesses_used).toBe(0);
    expect(resolution.signals.time_to_interaction).toBe(-1);
  });

  it('reports partial progress when a timeout catches the player mid-board', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    enterGuess(['B', 'B', 'B']);
    submit(); // one guess used, then the player stalls

    clock = 11_000;
    act(() => void vi.advanceTimersByTime(10_000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.guesses_used).toBe(1);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    enterGuess(['A', 'B', 'C']);
    submit(); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
