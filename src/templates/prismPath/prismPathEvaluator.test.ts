import { describe, expect, it } from 'vitest';

import {
  evaluatePrismPath,
  initialOrientationMap,
  orientationMapFromSolution,
  tracePrismPath,
  type PrismPathAnswerKey,
} from './prismPathEvaluator';

function answer(): PrismPathAnswerKey {
  return {
    rows: 5,
    columns: 5,
    entry: { row: 0, column: 0 },
    entryDirection: 'down',
    target: { row: 0, column: 4 },
    mirrors: [
      { id: 'm1', row: 2, column: 0, initialOrientation: 'slash' },
      { id: 'm2', row: 2, column: 3, initialOrientation: 'backslash' },
      { id: 'm3', row: 0, column: 3, initialOrientation: 'backslash' },
    ],
    blockers: [{ row: 3, column: 3 }],
  };
}

describe('tracePrismPath', () => {
  it('traces a solved route through slash and backslash mirrors', () => {
    const trace = tracePrismPath(
      answer(),
      orientationMapFromSolution([
        { mirrorId: 'm1', orientation: 'backslash' },
        { mirrorId: 'm2', orientation: 'slash' },
        { mirrorId: 'm3', orientation: 'slash' },
      ]),
    );

    expect(trace.reachedTarget).toBe(true);
    expect(trace.exitReason).toBe('hit_target');
    expect(trace.cells).toEqual([
      { row: 0, column: 0 },
      { row: 1, column: 0 },
      { row: 2, column: 0 },
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 2, column: 3 },
      { row: 1, column: 3 },
      { row: 0, column: 3 },
      { row: 0, column: 4 },
    ]);
  });

  it('reports an escape when the current mirror setup misses the target', () => {
    const trace = tracePrismPath(answer(), initialOrientationMap(answer().mirrors));

    expect(trace.reachedTarget).toBe(false);
    expect(trace.exitReason).toBe('escaped');
  });

  it('stops on blockers before moving through that cell', () => {
    const trace = tracePrismPath(
      {
        ...answer(),
        blockers: [{ row: 2, column: 2 }],
      },
      orientationMapFromSolution([
        { mirrorId: 'm1', orientation: 'backslash' },
        { mirrorId: 'm2', orientation: 'slash' },
        { mirrorId: 'm3', orientation: 'slash' },
      ]),
    );

    expect(trace.reachedTarget).toBe(false);
    expect(trace.exitReason).toBe('blocked');
    expect(trace.cells[trace.cells.length - 1]).toEqual({ row: 2, column: 2 });
  });

  it('detects beam loops instead of tracing forever', () => {
    const loop: PrismPathAnswerKey = {
      rows: 3,
      columns: 3,
      entry: { row: 0, column: 0 },
      entryDirection: 'up',
      target: { row: 2, column: 2 },
      mirrors: [
        { id: 'a', row: 0, column: 0, initialOrientation: 'slash' },
        { id: 'b', row: 0, column: 1, initialOrientation: 'backslash' },
        { id: 'c', row: 1, column: 1, initialOrientation: 'slash' },
        { id: 'd', row: 1, column: 0, initialOrientation: 'backslash' },
      ],
      blockers: [],
    };

    const trace = tracePrismPath(loop, initialOrientationMap(loop.mirrors));

    expect(trace.reachedTarget).toBe(false);
    expect(trace.exitReason).toBe('looped');
  });
});

describe('evaluatePrismPath', () => {
  it('returns correct with route-specific signals when the beam reaches target', () => {
    const result = evaluatePrismPath(
      answer(),
      orientationMapFromSolution([
        { mirrorId: 'm1', orientation: 'backslash' },
        { mirrorId: 'm2', orientation: 'slash' },
        { mirrorId: 'm3', orientation: 'slash' },
      ]),
      4,
    );

    expect(result).toEqual({
      isCorrect: true,
      resolutionType: 'correct',
      signals: {
        reached_target: true,
        beam_steps: 9,
        rotations_used: 4,
        exit_reason: 'hit_target',
      },
    });
  });

  it('returns incorrect when the beam exits without hitting the target', () => {
    const result = evaluatePrismPath(
      answer(),
      initialOrientationMap(answer().mirrors),
      0,
    );

    expect(result.isCorrect).toBe(false);
    expect(result.resolutionType).toBe('incorrect');
    expect(result.signals.reached_target).toBe(false);
    expect(result.signals.exit_reason).toBe('escaped');
  });
});
