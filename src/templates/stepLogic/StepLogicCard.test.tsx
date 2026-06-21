/**
 * Tests for the Step Logic renderer (Azure DevOps #139; Tech §6, §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers, so no assertion depends on the real `Date.now()`. Fake timers drive
 * the shared `useCardTimer` countdown; the injected `now` supplies the measured-
 * time math.
 *
 * Step Logic has NO timed pre-phase: the premise and the first sub-question's
 * options mount immediately, so the controller sets `interactionEnabledAtMs ===
 * activeAtMs` and the timer arms on mount over the whole solve. Each pick reveals
 * the next sub-question; `onAttempt` fires once on the first pick; `onResolve`
 * fires once after the last step (or on timeout).
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StepLogicCard as StepLogicCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import StepLogicCard from './StepLogicCard';

// ---------------------------------------------------------------------------
// Fixtures. A two-step chain keeps the flow tiny; the catalog enforces 2–3
// steps, but the renderer is step-count-agnostic.
// ---------------------------------------------------------------------------

function stepLogicCard(
  overrides: Partial<StepLogicCardType['config']> = {},
): StepLogicCardType {
  return {
    cardId: 'sl-1',
    creatorHandle: '@test',
    templateType: 'step_logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Work through the linked clues',
    puzzleDna: {
      mechanic: 'multi-step-deduction',
      inputMode: 'choice',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      premise: 'Mia is taller than Jo. Jo is taller than Sam.',
      steps: [
        {
          stem: 'Who is the tallest?',
          options: [
            { id: 's1-a', label: 'Mia' },
            { id: 's1-b', label: 'Jo' },
          ],
          correctOptionId: 's1-a',
        },
        {
          stem: 'Who is the shortest?',
          options: [
            { id: 's2-a', label: 'Mia' },
            { id: 's2-b', label: 'Sam' },
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
  card?: StepLogicCardType;
  context?: CardStartContext;
  now?: () => number;
  isActive?: boolean;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <StepLogicCard
      card={opts.card ?? stepLogicCard()}
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
  act(() => void fireEvent.click(screen.getByTestId(`sl-option-${optionId}`)));

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
// Step flow: the premise + first sub-question show; each pick advances.
// ---------------------------------------------------------------------------

describe('step flow', () => {
  it('shows the premise and the first sub-question on mount', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('sl-premise')).toHaveTextContent(
      'Mia is taller than Jo',
    );
    expect(screen.getByTestId('sl-stem')).toHaveTextContent('Who is the tallest?');
    // First step's options are present; the second step's are not yet.
    expect(screen.getByTestId('sl-option-s1-a')).toBeInTheDocument();
    expect(screen.queryByTestId('sl-option-s2-a')).not.toBeInTheDocument();
  });

  it('advances to the next sub-question on a pick', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    pick('s1-a'); // choose "Mia"

    // The second sub-question is now visible; the first's options are gone.
    expect(screen.getByTestId('sl-stem')).toHaveTextContent('Who is the shortest?');
    expect(screen.getByTestId('sl-option-s2-a')).toBeInTheDocument();
    expect(screen.queryByTestId('sl-option-s1-a')).not.toBeInTheDocument();
    // Not done yet — the card has not resolved after only the first step.
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('keeps the shared premise visible across sub-questions', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('sl-premise')).toBeInTheDocument();
    pick('s1-a');
    expect(screen.getByTestId('sl-premise')).toHaveTextContent(
      'Mia is taller than Jo',
    );
  });

  it('announces step progress in a polite live region', () => {
    renderCard({ now: () => 1_000 });

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('Step 1 of 2');

    pick('s1-a');
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 2');
    expect(screen.getByRole('status')).toHaveTextContent('Answered: Mia');
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
    pick('s1-a');
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
    pick('s1-a');
    expect(onResolve).not.toHaveBeenCalled();

    clock = 2_000;
    pick('s2-b');

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('sl-1');
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

  it('resolves incorrect on a wrong sub-answer and flags the first error step', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_300;
    pick('s1-b'); // wrong first step
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
    pick('s1-a');
    clock = 1_400;
    pick('s2-b'); // resolves correct; card is now latched
    expect(onResolve).toHaveBeenCalledTimes(1);

    // The options are gone after the final step, but the live region remains;
    // assert no further resolution/attempt could have fired.
    expect(screen.queryByTestId('sl-option-s2-a')).not.toBeInTheDocument();
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
    act(() => void vi.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000; // activeAt 1_000 + timeLimit 10_000
    act(() => void vi.advanceTimersByTime(1));

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
    pick('s1-a'); // one step taken, then the player stalls

    clock = 11_000;
    act(() => void vi.advanceTimersByTime(10_000));

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
    pick('s1-a');
    clock = 1_400;
    pick('s2-b'); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
