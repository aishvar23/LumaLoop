/**
 * Tests for the pure Step Logic evaluator (Azure DevOps #142; ported from web
 * `src/templates/stepLogic/stepLogicEvaluator.test.ts`).
 *
 * Pure-function tests: no React, no timers — just the exact-ordered-match
 * decision across all-correct, wrong-pick, short (timeout), and long chains, and
 * the derived `steps_total` / `steps_correct` / `first_error_step` signals.
 */

import type { StepLogicAnswerKey } from './stepLogicEvaluator';
import { evaluateStepLogic } from './stepLogicEvaluator';

const answer: StepLogicAnswerKey = {
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
    {
      stem: 'Who is in the middle?',
      options: [
        { id: 's3-a', label: 'Jo' },
        { id: 's3-b', label: 'Sam' },
      ],
      correctOptionId: 's3-a',
    },
  ],
};

describe('evaluateStepLogic', () => {
  it('reports an all-correct chain as correct with no error step', () => {
    const result = evaluateStepLogic(answer, ['s1-a', 's2-b', 's3-a']);
    expect(result.isCorrect).toBe(true);
    expect(result.resolutionType).toBe('correct');
    expect(result.signals).toEqual({
      steps_total: 3,
      steps_correct: 3,
      first_error_step: -1,
    });
  });

  it('reports a wrong sub-answer as incorrect and flags the first error step', () => {
    // Step 1 wrong (first error), steps 0 and 2 correct.
    const result = evaluateStepLogic(answer, ['s1-a', 's2-a', 's3-a']);
    expect(result.isCorrect).toBe(false);
    expect(result.resolutionType).toBe('incorrect');
    expect(result.signals.steps_total).toBe(3);
    expect(result.signals.steps_correct).toBe(2);
    expect(result.signals.first_error_step).toBe(1);
  });

  it('flags the earliest error when several steps are wrong', () => {
    const result = evaluateStepLogic(answer, ['s1-b', 's2-a', 's3-a']);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.steps_correct).toBe(1);
    expect(result.signals.first_error_step).toBe(0);
  });

  it('treats a too-short chain (e.g. a timeout) as incorrect', () => {
    const result = evaluateStepLogic(answer, ['s1-a', 's2-b']);
    expect(result.isCorrect).toBe(false);
    // The unanswered third step is the only mismatch.
    expect(result.signals.steps_correct).toBe(2);
    expect(result.signals.first_error_step).toBe(2);
  });

  it('treats an empty chain as all-error incorrect', () => {
    const result = evaluateStepLogic(answer, []);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.steps_correct).toBe(0);
    expect(result.signals.first_error_step).toBe(0);
  });

  it('treats a too-long chain as incorrect even if every step matched', () => {
    const result = evaluateStepLogic(answer, [
      's1-a',
      's2-b',
      's3-a',
      's3-a', // one surplus pick past the step count
    ]);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.steps_correct).toBe(3);
    // The first error is the first surplus position (index === step count).
    expect(result.signals.first_error_step).toBe(3);
  });
});
