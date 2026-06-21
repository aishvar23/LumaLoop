/**
 * Tests for the pure Memory Sequence evaluator (Azure DevOps #137).
 *
 * Pure-function tests: no React, no timers — just the exact-ordered-match
 * decision and the derived `sequence_length` / `errors` / `first_error_step`
 * signals across right, wrong-order, wrong-tile, short, and long reproductions.
 */

import { describe, expect, it } from 'vitest';

import type { GridCoordinate } from '../../cards/types';
import type { MemorySequenceAnswerKey } from './memorySequenceEvaluator';
import { evaluateMemorySequence } from './memorySequenceEvaluator';

const answer: MemorySequenceAnswerKey = {
  sequence: [
    { row: 0, column: 0 },
    { row: 1, column: 1 },
    { row: 2, column: 2 },
  ],
};

/** Reproduce the correct sequence verbatim. */
const correctOrder: GridCoordinate[] = [
  { row: 0, column: 0 },
  { row: 1, column: 1 },
  { row: 2, column: 2 },
];

describe('evaluateMemorySequence', () => {
  it('reports an exact ordered match as correct with zero errors', () => {
    const result = evaluateMemorySequence(answer, correctOrder);
    expect(result.isCorrect).toBe(true);
    expect(result.resolutionType).toBe('correct');
    expect(result.signals).toEqual({
      sequence_length: 3,
      errors: 0,
      first_error_step: -1,
    });
  });

  it('reports a swapped order as incorrect and flags the first wrong step', () => {
    // Steps 0 and 1 are swapped: position 0 is wrong (first error), position 1
    // is wrong, position 2 still matches.
    const swapped: GridCoordinate[] = [
      { row: 1, column: 1 },
      { row: 0, column: 0 },
      { row: 2, column: 2 },
    ];
    const result = evaluateMemorySequence(answer, swapped);
    expect(result.isCorrect).toBe(false);
    expect(result.resolutionType).toBe('incorrect');
    expect(result.signals.errors).toBe(2);
    expect(result.signals.first_error_step).toBe(0);
    expect(result.signals.sequence_length).toBe(3);
  });

  it('reports a single wrong tile as incorrect with the right first_error_step', () => {
    // Only the last tile is wrong.
    const wrongLast: GridCoordinate[] = [
      { row: 0, column: 0 },
      { row: 1, column: 1 },
      { row: 0, column: 2 },
    ];
    const result = evaluateMemorySequence(answer, wrongLast);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.errors).toBe(1);
    expect(result.signals.first_error_step).toBe(2);
  });

  it('treats a too-short reproduction (e.g. a timeout) as incorrect', () => {
    const short: GridCoordinate[] = [
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    ];
    const result = evaluateMemorySequence(answer, short);
    expect(result.isCorrect).toBe(false);
    // The missing third position is the only mismatch.
    expect(result.signals.errors).toBe(1);
    expect(result.signals.first_error_step).toBe(2);
  });

  it('treats a too-long reproduction as incorrect even if the prefix matches', () => {
    const long: GridCoordinate[] = [
      ...correctOrder,
      { row: 0, column: 1 }, // one surplus tap past the sequence length
    ];
    const result = evaluateMemorySequence(answer, long);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.errors).toBe(1);
    // The first error is the first surplus position (index === sequence length).
    expect(result.signals.first_error_step).toBe(3);
  });

  it('treats an empty reproduction as all-error incorrect', () => {
    const result = evaluateMemorySequence(answer, []);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.errors).toBe(3);
    expect(result.signals.first_error_step).toBe(0);
  });
});
