/**
 * Memory Match answer evaluator.
 *
 * memory_match is a flip-and-match pairs board: tiles are revealed two at a time
 * and a pair "matches" iff the two tiles share a `pairKey`. The card is solved
 * once every tile has been matched. These helpers are the renderer's single
 * source of truth for both decisions.
 *
 * PURE and React-free: each helper reads only the minimal slice it needs, so it
 * is trivially unit-testable and reused unchanged by the web and native
 * renderers. Typed over precise slices — never `Record<string, unknown>`.
 */

/** Two tiles form a matching pair iff they share a `pairKey`. */
export function tilesMatch(
  a: { pairKey: string },
  b: { pairKey: string },
): boolean {
  return a.pairKey === b.pairKey;
}

/**
 * The board is fully solved once every tile has been matched. Guarded against a
 * degenerate empty board (`totalTiles === 0` is never "all matched").
 */
export function allPairsMatched(
  totalTiles: number,
  matchedCount: number,
): boolean {
  return totalTiles > 0 && matchedCount === totalTiles;
}
