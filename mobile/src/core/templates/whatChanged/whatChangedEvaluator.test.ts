/**
 * Tests for the pure What Changed evaluator (Azure DevOps #65; Design §9.2).
 *
 * Pure-function tests: no React, no timers — just the correct/incorrect
 * selection decision and the unknown-option-id boundary.
 */

import type { WhatChangedAnswerKey } from './whatChangedEvaluator';
import { evaluateWhatChangedSelection } from './whatChangedEvaluator';

const answer: WhatChangedAnswerKey = { correctOptionId: 'opt-2' };

describe('evaluateWhatChangedSelection', () => {
  it('reports the correct option as correct', () => {
    expect(evaluateWhatChangedSelection(answer, 'opt-2')).toEqual({ isCorrect: true });
  });

  it('reports a different valid option as incorrect', () => {
    expect(evaluateWhatChangedSelection(answer, 'opt-1')).toEqual({ isCorrect: false });
  });

  it('reports an unknown option id as incorrect (not a special case)', () => {
    expect(evaluateWhatChangedSelection(answer, 'does-not-exist')).toEqual({
      isCorrect: false,
    });
    expect(evaluateWhatChangedSelection(answer, '')).toEqual({ isCorrect: false });
  });
});
