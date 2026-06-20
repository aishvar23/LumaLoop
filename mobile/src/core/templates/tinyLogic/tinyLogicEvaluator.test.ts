/**
 * Tests for the pure Tiny Logic evaluator (Azure DevOps #67; Design §9.4).
 *
 * Pure-function tests: no React, no timers — just the correct/incorrect
 * selection decision, the chosen distractor it reports for each wrong option,
 * and the unknown-option-id boundary.
 */

import type { TinyLogicAnswerKey } from './tinyLogicEvaluator';
import { evaluateTinyLogicSelection } from './tinyLogicEvaluator';

const answer: TinyLogicAnswerKey = { correctOptionId: 'opt-2' };

describe('evaluateTinyLogicSelection', () => {
  it('reports the correct option as correct with no distractor', () => {
    expect(evaluateTinyLogicSelection(answer, 'opt-2')).toEqual({
      isCorrect: true,
      selectedOptionId: 'opt-2',
      distractorOptionId: null,
    });
  });

  it('reports each wrong option as incorrect and names it as the distractor', () => {
    expect(evaluateTinyLogicSelection(answer, 'opt-1')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-1',
      distractorOptionId: 'opt-1',
    });
    expect(evaluateTinyLogicSelection(answer, 'opt-3')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-3',
      distractorOptionId: 'opt-3',
    });
  });

  it('reports an unknown option id as an incorrect distractor (not a special case)', () => {
    expect(evaluateTinyLogicSelection(answer, 'does-not-exist')).toEqual({
      isCorrect: false,
      selectedOptionId: 'does-not-exist',
      distractorOptionId: 'does-not-exist',
    });
    expect(evaluateTinyLogicSelection(answer, '')).toEqual({
      isCorrect: false,
      selectedOptionId: '',
      distractorOptionId: '',
    });
  });
});
