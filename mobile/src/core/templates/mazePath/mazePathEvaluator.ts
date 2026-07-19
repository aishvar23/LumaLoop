/**
 * Maze Path evaluator — pure grid-navigation predicates.
 *
 * maze_path renders a rows×columns grid of 'open' and 'wall' cells. The player
 * steps 4-directionally between adjacent open cells from the start to the exit.
 * These helpers are the single source of truth for "is this move legal?" (used
 * by the renderer on every tap) and "is this maze solvable?" (used by catalog
 * validation to reject any authored maze whose exit is unreachable).
 *
 * PURE and React-free: they read only row-major indices and the cell array, so
 * they are trivially unit-testable and shared unchanged across web and mobile.
 * Typed over the precise primitives — never `Record<string, unknown>`.
 */

/**
 * True iff `a` and `b` are 4-neighbours on a `columns`-wide grid: same row with
 * adjacent columns, OR same column with adjacent rows. Crucially this guards the
 * row-wrap edge case — e.g. on a 3-wide grid indices 2 and 3 are numerically
 * adjacent but sit in different rows AND different columns, so they are NOT
 * neighbours.
 */
export function areAdjacent(columns: number, a: number, b: number): boolean {
  if (columns <= 0) return false;
  const rowA = Math.floor(a / columns);
  const colA = a % columns;
  const rowB = Math.floor(b / columns);
  const colB = b % columns;
  const sameRowStep = rowA === rowB && Math.abs(colA - colB) === 1;
  const sameColStep = colA === colB && Math.abs(rowA - rowB) === 1;
  return sameRowStep || sameColStep;
}

/**
 * True iff a move from `from` to `to` is legal: `to` is in range, is an 'open'
 * cell, and is a 4-neighbour of `from`. Walls, diagonals, out-of-range targets
 * and non-adjacent jumps are all rejected.
 */
export function canMoveTo(
  cells: ReadonlyArray<'open' | 'wall'>,
  columns: number,
  from: number,
  to: number,
): boolean {
  if (to < 0 || to >= cells.length) return false;
  if (cells[to] !== 'open') return false;
  return areAdjacent(columns, from, to);
}

/**
 * Breadth-first search over open cells from `startIndex`; returns true iff
 * `exitIndex` is reachable. Catalog validation uses this to guarantee every
 * authored maze is actually solvable before it ships.
 */
export function hasPath(config: {
  rows: number;
  columns: number;
  cells: ReadonlyArray<'open' | 'wall'>;
  startIndex: number;
  exitIndex: number;
}): boolean {
  const { columns, cells, startIndex, exitIndex } = config;
  if (startIndex < 0 || startIndex >= cells.length) return false;
  if (exitIndex < 0 || exitIndex >= cells.length) return false;
  if (cells[startIndex] !== 'open' || cells[exitIndex] !== 'open') return false;
  if (startIndex === exitIndex) return true;

  const visited = new Set<number>([startIndex]);
  const queue: number[] = [startIndex];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (current === exitIndex) return true;
    const neighbours = [
      current - columns, // up
      current + columns, // down
      current - 1, // left
      current + 1, // right
    ];
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      if (canMoveTo(cells, columns, current, next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
