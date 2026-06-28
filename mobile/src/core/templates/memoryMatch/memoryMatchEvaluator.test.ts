import { allPairsMatched, tilesMatch } from './memoryMatchEvaluator';

describe('tilesMatch', () => {
  it('is true when two tiles share a pairKey', () => {
    expect(tilesMatch({ pairKey: 'a' }, { pairKey: 'a' })).toBe(true);
  });

  it('is false when the pairKeys differ', () => {
    expect(tilesMatch({ pairKey: 'a' }, { pairKey: 'b' })).toBe(false);
  });
});

describe('allPairsMatched', () => {
  it('is true only when every tile has been matched', () => {
    expect(allPairsMatched(4, 4)).toBe(true);
  });

  it('is false while tiles remain unmatched', () => {
    expect(allPairsMatched(4, 2)).toBe(false);
    expect(allPairsMatched(4, 0)).toBe(false);
  });

  it('treats an empty board as not solved (boundary)', () => {
    expect(allPairsMatched(0, 0)).toBe(false);
  });
});
