/**
 * Tests for the pure Schulte Order evaluator (processing_speed; Design §9).
 *
 * Pure-function tests: no React, no timers — the tap-log replay (progress +
 * non-fatal errors), the completion decision, and the wrong-tap policy
 * (out-of-order / repeat / unknown taps count as errors but do not advance).
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateSchulteOrder,
  orderedTargetIdsFrom,
  replaySchulteTaps,
  type SchulteOrderAnswerKey,
} from './schulteOrderEvaluator';

const answer: SchulteOrderAnswerKey = {
  orderedTargetIds: ['t1', 't2', 't3', 't4'],
};

describe('orderedTargetIdsFrom', () => {
  it('reads the ids in array order (the correct tap order)', () => {
    expect(
      orderedTargetIdsFrom([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('replaySchulteTaps', () => {
  it('advances progress on each correct in-order tap', () => {
    expect(replaySchulteTaps(answer.orderedTargetIds, ['t1', 't2'])).toEqual({
      progress: 2,
      errors: 0,
    });
  });

  it('counts an out-of-order tap as a non-fatal error without advancing', () => {
    // Expected t1; tapping t2 first is one error, then t1 advances.
    expect(
      replaySchulteTaps(answer.orderedTargetIds, ['t2', 't1', 't2']),
    ).toEqual({ progress: 2, errors: 1 });
  });

  it('counts a repeated (already-completed) tap as an error', () => {
    expect(
      replaySchulteTaps(answer.orderedTargetIds, ['t1', 't1', 't2']),
    ).toEqual({ progress: 2, errors: 1 });
  });

  it('counts an unknown id as an error', () => {
    expect(
      replaySchulteTaps(answer.orderedTargetIds, ['t1', 'nope', 't2']),
    ).toEqual({ progress: 2, errors: 1 });
  });
});

describe('evaluateSchulteOrder', () => {
  it('resolves correct when every target is tapped in order', () => {
    expect(evaluateSchulteOrder(answer, ['t1', 't2', 't3', 't4'])).toEqual({
      isCorrect: true,
      resolutionType: 'correct',
      signals: { target_count: 4, progress: 4, errors: 0, taps: 4 },
    });
  });

  it('stays correct despite non-fatal wrong taps along the way', () => {
    const result = evaluateSchulteOrder(answer, [
      't2', // error
      't1',
      't3', // error (expected t2)
      't2',
      't3',
      't4',
    ]);
    expect(result.isCorrect).toBe(true);
    expect(result.signals).toEqual({
      target_count: 4,
      progress: 4,
      errors: 2,
      taps: 6,
    });
  });

  it('resolves incorrect when the sequence is left unfinished (e.g. timeout)', () => {
    expect(evaluateSchulteOrder(answer, ['t1', 't2'])).toEqual({
      isCorrect: false,
      resolutionType: 'incorrect',
      signals: { target_count: 4, progress: 2, errors: 0, taps: 2 },
    });
  });

  it('treats an empty tap log as incorrect with zero progress', () => {
    expect(evaluateSchulteOrder(answer, [])).toEqual({
      isCorrect: false,
      resolutionType: 'incorrect',
      signals: { target_count: 4, progress: 0, errors: 0, taps: 0 },
    });
  });

  it('counts taps past completion as errors but stays correct', () => {
    const result = evaluateSchulteOrder(answer, [
      't1',
      't2',
      't3',
      't4',
      't4', // extra tap after completion
    ]);
    expect(result.isCorrect).toBe(true);
    expect(result.signals.errors).toBe(1);
    expect(result.signals.progress).toBe(4);
  });
});
