import { describe, expect, it } from 'vitest';

import { areAdjacent, canMoveTo, hasPath } from './mazePathEvaluator';

describe('areAdjacent', () => {
  it('treats same-row horizontal neighbours as adjacent', () => {
    expect(areAdjacent(3, 0, 1)).toBe(true);
    expect(areAdjacent(3, 1, 2)).toBe(true);
  });

  it('treats same-column vertical neighbours as adjacent', () => {
    expect(areAdjacent(3, 0, 3)).toBe(true);
    expect(areAdjacent(3, 4, 7)).toBe(true);
  });

  it('guards the row-wrap edge: index 2 and 3 on a 3-wide grid are NOT adjacent', () => {
    // 2 is row 0 col 2; 3 is row 1 col 0 — different row AND column.
    expect(areAdjacent(3, 2, 3)).toBe(false);
  });

  it('rejects diagonals and far cells', () => {
    expect(areAdjacent(3, 0, 4)).toBe(false);
    expect(areAdjacent(3, 0, 2)).toBe(false);
  });
});

describe('canMoveTo', () => {
  const cells: Array<'open' | 'wall'> = [
    'open',
    'wall',
    'open',
    'open',
    'open',
    'open',
    'open',
    'open',
    'open',
  ];

  it('allows a move to an adjacent open cell', () => {
    expect(canMoveTo(cells, 3, 0, 3)).toBe(true);
  });

  it('blocks a move into a wall cell', () => {
    expect(canMoveTo(cells, 3, 0, 1)).toBe(false);
  });

  it('blocks a non-adjacent (diagonal) move', () => {
    expect(canMoveTo(cells, 3, 0, 4)).toBe(false);
  });

  it('blocks an out-of-range target', () => {
    expect(canMoveTo(cells, 3, 8, 9)).toBe(false);
    expect(canMoveTo(cells, 3, 0, -1)).toBe(false);
  });
});

describe('hasPath', () => {
  it('is true for a solvable maze', () => {
    // 3×3 all-open: 0 -> ... -> 8 reachable.
    const cells = Array<'open' | 'wall'>(9).fill('open');
    expect(
      hasPath({ rows: 3, columns: 3, cells, startIndex: 0, exitIndex: 8 }),
    ).toBe(true);
  });

  it('is false when the exit is walled off', () => {
    // Wall the entire middle column AND row separating start from exit.
    const cells: Array<'open' | 'wall'> = [
      'open',
      'wall',
      'wall',
      'wall',
      'wall',
      'wall',
      'wall',
      'wall',
      'open',
    ];
    expect(
      hasPath({ rows: 3, columns: 3, cells, startIndex: 0, exitIndex: 8 }),
    ).toBe(false);
  });
});
