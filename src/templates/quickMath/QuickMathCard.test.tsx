/**
 * Tests for the Quick Math renderer (Design §9; Tech §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers. Quick Math is a single-phase MCQ template (no preview/stream), so
 * `interactionEnabledAtMs === activeAtMs`. Correctness is decided by the pure
 * evaluator computing the expression — these tests assert the renderer routes
 * selections through it and reports the right signals.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickMathCard as QuickMathCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import QuickMathCard from './QuickMathCard';

function quickMathCard(
  overrides: Partial<QuickMathCardType['config']> = {},
): QuickMathCardType {
  return {
    cardId: 'qm-1',
    creatorHandle: '@test',
    templateType: 'quick_math',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Solve the equation',
    puzzleDna: {
      mechanic: 'quick-math',
      inputMode: 'choice',
      measuredSignals: ['time_to_interaction', 'correct', 'elapsed_ms'],
    },
    explanation: { title: 'Multiply first', body: '7 × 8 = 56, then − 4 = 52.' },
    config: {
      display: '7 × 8 − 4',
      expression: { operands: [7, 8, 4], operators: ['*', '-'] }, // = 52
      options: [
        { id: 'opt-a', label: '52', value: 52 },
        { id: 'opt-b', label: '28', value: 28 },
        { id: 'opt-c', label: '51', value: 51 },
      ],
      correctOptionId: 'opt-a',
      timeLimitMs: 14_000,
      ...overrides,
    },
  };
}

function startContext(
  overrides: Partial<CardStartContext> = {},
): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

function renderCard(opts: { now?: () => number } = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <QuickMathCard
      card={quickMathCard()}
      context={startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const selectOption = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`qm-option-${id}`)));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('initial render', () => {
  it('shows the equation and all options', () => {
    renderCard({ now: () => 1_000 });
    expect(screen.getByTestId('qm-display')).toHaveTextContent('7 × 8 − 4 = ?');
    expect(screen.getByTestId('qm-option-opt-a')).toHaveTextContent('52');
  });
});

describe('selecting the option matching the computed result', () => {
  it('resolves correct with the right signals', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });
    clock = 2_200;
    selectOption('opt-a');

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.interactionElapsedMs).toBe(1_200);
    expect(resolution.signals.distractor_option_id).toBe('');
  });
});

describe('selecting a wrong-precedence distractor', () => {
  it('resolves incorrect and reports the distractor', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });
    clock = 2_000;
    selectOption('opt-b');

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.distractor_option_id).toBe('opt-b');
  });
});

describe('timeout', () => {
  it('resolves timeout when no choice is made', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });
    clock = 15_000;
    act(() => void vi.advanceTimersByTime(14_000));
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
  });
});
