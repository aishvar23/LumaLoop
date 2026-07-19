// Ported from web `src/templates/nBack/nBackEvaluator.test.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
import {
  deriveMatchIndices,
  evaluateNBack,
  matchIndicesAreConsistent,
  type NBackRules,
} from './nBackEvaluator';

describe('deriveMatchIndices', () => {
  it('finds 1-back matches', () => {
    // A B B C C C  (n=1): index 2 (B==B), 4 (C==C), 5 (C==C)
    expect(
      deriveMatchIndices({ stream: ['A', 'B', 'B', 'C', 'C', 'C'], n: 1 }),
    ).toEqual([2, 4, 5]);
  });

  it('finds 2-back matches', () => {
    // A B A C A  (n=2): index 2 (A==A, two back), index 4 (A==A, two back)
    expect(
      deriveMatchIndices({ stream: ['A', 'B', 'A', 'C', 'A'], n: 2 }),
    ).toEqual([2, 4]);
  });

  it('returns no matches for a stream with none', () => {
    expect(
      deriveMatchIndices({ stream: ['A', 'B', 'C', 'D'], n: 1 }),
    ).toEqual([]);
    expect(
      deriveMatchIndices({ stream: ['A', 'B', 'C', 'D'], n: 2 }),
    ).toEqual([]);
  });

  it('never counts the first n positions (nothing n back)', () => {
    // n=2: indices 0 and 1 can never be matches even if they repeat later.
    expect(
      deriveMatchIndices({ stream: ['A', 'A', 'A', 'A'], n: 2 }),
    ).toEqual([2, 3]);
  });
});

describe('evaluateNBack scoring', () => {
  // 1-back: A B B C C  -> matches at 2 (B), 4 (C)
  const oneBack: NBackRules = { stream: ['A', 'B', 'B', 'C', 'C'], n: 1 };

  it('scores a perfect run (all hits, no false alarms) as correct', () => {
    const result = evaluateNBack(oneBack, [2, 4]);
    expect(result.hits).toBe(2);
    expect(result.misses).toBe(0);
    expect(result.falseAlarms).toBe(0);
    expect(result.correctRejections).toBe(2); // positions 1 and 3
    expect(result.totalMatches).toBe(2);
    expect(result.accuracy).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('counts a missed match as a miss and fails the run', () => {
    const result = evaluateNBack(oneBack, [2]); // missed index 4
    expect(result.hits).toBe(1);
    expect(result.misses).toBe(1);
    expect(result.falseAlarms).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('counts a flag on a non-match as a false alarm and fails the run', () => {
    const result = evaluateNBack(oneBack, [2, 4, 3]); // 3 is not a match
    expect(result.hits).toBe(2);
    expect(result.falseAlarms).toBe(1);
    expect(result.correctRejections).toBe(1); // only position 1 left
    expect(result.isCorrect).toBe(false);
  });

  it('excludes the first n positions from the scorable window', () => {
    const result = evaluateNBack(oneBack, [0]); // flag on excluded position 0
    // Position 0 is never scorable; it is neither a false alarm nor a hit.
    expect(result.falseAlarms).toBe(0);
    expect(result.outcomes.every((outcome) => outcome.index >= 1)).toBe(true);
  });

  it('handles a no-match stream: no flags is the perfect run', () => {
    const noMatch: NBackRules = { stream: ['A', 'B', 'C', 'D'], n: 1 };
    const clean = evaluateNBack(noMatch, []);
    expect(clean.totalMatches).toBe(0);
    expect(clean.correctRejections).toBe(3); // positions 1,2,3
    expect(clean.accuracy).toBe(1);
    expect(clean.isCorrect).toBe(true);

    // Any flag on a no-match stream is a false alarm.
    const dirty = evaluateNBack(noMatch, [2]);
    expect(dirty.falseAlarms).toBe(1);
    expect(dirty.isCorrect).toBe(false);
  });

  it('scores a 2-back run', () => {
    // A B A C A  (n=2): matches at 2 (A), 4 (A)
    const twoBack: NBackRules = { stream: ['A', 'B', 'A', 'C', 'A'], n: 2 };
    const result = evaluateNBack(twoBack, [2, 4]);
    expect(result.matchIndices).toEqual([2, 4]);
    expect(result.hits).toBe(2);
    expect(result.correctRejections).toBe(1); // position 3
    expect(result.isCorrect).toBe(true);
  });

  it('collapses duplicate flags', () => {
    const result = evaluateNBack(oneBack, [2, 2, 4, 4]);
    expect(result.hits).toBe(2);
    expect(result.isCorrect).toBe(true);
  });

  it('scores against the derived truth, ignoring an authored key', () => {
    // The evaluator never reads matchIndices; truth is derived from stream + n.
    const result = evaluateNBack({ stream: ['A', 'A'], n: 1 }, [1]);
    expect(result.matchIndices).toEqual([1]);
    expect(result.hits).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('reports accuracy 0 and not-correct for an empty scorable window', () => {
    const result = evaluateNBack({ stream: ['A'], n: 1 }, []);
    expect(result.outcomes).toEqual([]);
    expect(result.accuracy).toBe(0);
    expect(result.isCorrect).toBe(false);
  });
});

describe('matchIndicesAreConsistent', () => {
  it('accepts an authored key equal to the derived set', () => {
    expect(
      matchIndicesAreConsistent({
        stream: ['A', 'B', 'B', 'C', 'C'],
        n: 1,
        matchIndices: [2, 4],
      }),
    ).toBe(true);
  });

  it('rejects a key with a missing position', () => {
    expect(
      matchIndicesAreConsistent({
        stream: ['A', 'B', 'B', 'C', 'C'],
        n: 1,
        matchIndices: [2],
      }),
    ).toBe(false);
  });

  it('rejects a key with an extra (wrong) position', () => {
    expect(
      matchIndicesAreConsistent({
        stream: ['A', 'B', 'B', 'C', 'C'],
        n: 1,
        matchIndices: [2, 3, 4],
      }),
    ).toBe(false);
  });

  it('rejects a key that is out of ascending order', () => {
    expect(
      matchIndicesAreConsistent({
        stream: ['A', 'B', 'B', 'C', 'C'],
        n: 1,
        matchIndices: [4, 2],
      }),
    ).toBe(false);
  });
});
