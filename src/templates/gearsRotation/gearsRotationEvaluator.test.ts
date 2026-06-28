import { describe, expect, it } from 'vitest';

import { evaluateGearsRotationSelection } from './gearsRotationEvaluator';

describe('evaluateGearsRotationSelection', () => {
  const answer = { correctOptionId: 'opt-correct' };

  it('marks the correct option correct with no distractor', () => {
    expect(evaluateGearsRotationSelection(answer, 'opt-correct')).toEqual({
      isCorrect: true,
      selectedOptionId: 'opt-correct',
      distractorOptionId: null,
    });
  });

  it('marks a wrong option incorrect and records it as the distractor', () => {
    expect(evaluateGearsRotationSelection(answer, 'opt-b')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-b',
      distractorOptionId: 'opt-b',
    });
  });

  it('treats an unknown option id as simply incorrect', () => {
    const result = evaluateGearsRotationSelection(answer, 'nope');
    expect(result.isCorrect).toBe(false);
    expect(result.distractorOptionId).toBe('nope');
  });
});
