// Ported from web `src/templates/oddOneOut/oddOneOutEvaluator.test.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Tests for the pure Odd One Out evaluator (pattern_recognition; Design §9).
 *
 * Pure-function tests: no React, no timers — just the correct/incorrect pick
 * decision, the chosen distractor it reports for each wrong item, and the
 * unknown-item-id boundary.
 */


import type { OddOneOutAnswerKey } from './oddOneOutEvaluator';
import { evaluateOddOneOut } from './oddOneOutEvaluator';

const answer: OddOneOutAnswerKey = { oddItemId: 'item-3' };

describe('evaluateOddOneOut', () => {
  it('reports the odd item as correct with no distractor', () => {
    expect(evaluateOddOneOut(answer, 'item-3')).toEqual({
      isCorrect: true,
      selectedItemId: 'item-3',
      distractorItemId: null,
    });
  });

  it('reports each belonging item as incorrect and names it as the distractor', () => {
    expect(evaluateOddOneOut(answer, 'item-1')).toEqual({
      isCorrect: false,
      selectedItemId: 'item-1',
      distractorItemId: 'item-1',
    });
    expect(evaluateOddOneOut(answer, 'item-2')).toEqual({
      isCorrect: false,
      selectedItemId: 'item-2',
      distractorItemId: 'item-2',
    });
  });

  it('reports an unknown item id as an incorrect distractor (not a special case)', () => {
    expect(evaluateOddOneOut(answer, 'does-not-exist')).toEqual({
      isCorrect: false,
      selectedItemId: 'does-not-exist',
      distractorItemId: 'does-not-exist',
    });
    expect(evaluateOddOneOut(answer, '')).toEqual({
      isCorrect: false,
      selectedItemId: '',
      distractorItemId: '',
    });
  });
});
