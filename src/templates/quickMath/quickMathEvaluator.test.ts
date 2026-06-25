/**
 * Tests for the pure Quick Math evaluator (Design §9).
 *
 * Pure-function tests: no React, no timers — operator precedence in the
 * computation, the correct/incorrect selection decision against the COMPUTED
 * value (not an authored number), the distractor it reports, the unknown-option
 * boundary, and malformed-expression handling.
 */

import { describe, expect, it } from 'vitest';

import type { QuickMathExpression } from '../../cards/types';
import type { QuickMathAnswerKey } from './quickMathEvaluator';
import {
  computeQuickMath,
  evaluateQuickMathSelection,
} from './quickMathEvaluator';

describe('computeQuickMath', () => {
  it('adds and subtracts left-to-right', () => {
    expect(
      computeQuickMath({ operands: [10, 4, 3], operators: ['-', '+'] }),
    ).toBe(9);
  });

  it('applies multiplication/division before addition/subtraction', () => {
    // 7 * 8 - 4 = 56 - 4 = 52 (NOT 7 * 4 = 28).
    expect(
      computeQuickMath({ operands: [7, 8, 4], operators: ['*', '-'] }),
    ).toBe(52);
    // 2 + 3 * 4 = 2 + 12 = 14 (NOT 5 * 4 = 20).
    expect(
      computeQuickMath({ operands: [2, 3, 4], operators: ['+', '*'] }),
    ).toBe(14);
  });

  it('handles division and multi-step precedence', () => {
    // 12 / 4 + 2 * 3 = 3 + 6 = 9.
    expect(
      computeQuickMath({ operands: [12, 4, 2, 3], operators: ['/', '+', '*'] }),
    ).toBe(9);
  });

  it('computes a single-operand expression as that operand', () => {
    expect(computeQuickMath({ operands: [42], operators: [] })).toBe(42);
  });

  it('throws on a malformed expression', () => {
    expect(() => computeQuickMath({ operands: [], operators: [] })).toThrow();
    expect(() =>
      computeQuickMath({ operands: [1, 2], operators: [] }),
    ).toThrow();
  });
});

const expression: QuickMathExpression = {
  operands: [7, 8, 4],
  operators: ['*', '-'],
}; // = 52

const answer: QuickMathAnswerKey = {
  expression,
  options: [
    { id: 'opt-a', label: '52', value: 52 },
    { id: 'opt-b', label: '28', value: 28 },
    { id: 'opt-c', label: '51', value: 51 },
  ],
  correctOptionId: 'opt-a',
};

describe('evaluateQuickMathSelection', () => {
  it('marks the option whose value equals the computed result correct', () => {
    expect(evaluateQuickMathSelection(answer, 'opt-a')).toEqual({
      isCorrect: true,
      selectedOptionId: 'opt-a',
      computedResult: 52,
      distractorOptionId: null,
    });
  });

  it('marks a wrong-precedence distractor incorrect and reports it', () => {
    expect(evaluateQuickMathSelection(answer, 'opt-b')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-b',
      computedResult: 52,
      distractorOptionId: 'opt-b',
    });
  });

  it('marks an off-by-one distractor incorrect', () => {
    expect(evaluateQuickMathSelection(answer, 'opt-c').isCorrect).toBe(false);
  });

  it('reports an unknown option id as an incorrect distractor', () => {
    expect(evaluateQuickMathSelection(answer, 'nope')).toEqual({
      isCorrect: false,
      selectedOptionId: 'nope',
      computedResult: 52,
      distractorOptionId: 'nope',
    });
  });
});
