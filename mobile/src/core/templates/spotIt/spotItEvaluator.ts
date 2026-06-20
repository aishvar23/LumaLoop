// Ported from web `src/templates/spotIt/spotItEvaluator.ts`; source of truth is
// the web app — keep in sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Spot It answer evaluator (Design §9.1; Technical Design §7).
 *
 * The Spot It mechanic asks the player to tap the single anomalous cell in a
 * grid of repeated base elements. A tap is "correct" iff it lands on the cell
 * at (`anomalyRow`, `anomalyColumn`).
 *
 * These functions are PURE and React-free: they read only the grid-shape and
 * anomaly-location fields of a {@link SpotItCard} config, so they are trivially
 * unit-testable and reused unchanged by the renderer. Exposed as typed
 * functions over the precise config slice — never `Record<string, unknown>`.
 */

import type { SpotItCard } from '../../cards/types';

/**
 * The slice of a {@link SpotItCard} config the evaluator needs: the grid shape
 * plus where the anomaly sits. Taking a `Pick` (not the whole card) keeps the
 * evaluator decoupled from rendering/timing concerns.
 */
export type SpotItGrid = Pick<
  SpotItCard['config'],
  'rows' | 'columns' | 'anomalyRow' | 'anomalyColumn'
>;

/** A tapped grid position, zero-indexed from the top-left. */
export type GridCell = { row: number; column: number };

/** The result of evaluating a single tap. */
export type SpotItTapResult = { isCorrect: boolean };

/**
 * True iff (`row`, `column`) is the grid's anomaly cell.
 *
 * This predicate has two distinct callers and is exported for both: the
 * renderer uses it for DISPLAY (which glyph each cell shows), while
 * {@link evaluateSpotItTap} uses it for the CORRECTNESS decision. Keeping the
 * predicate shared means display and scoring can never drift apart.
 */
export function isAnomalyCell(
  grid: SpotItGrid,
  row: number,
  column: number,
): boolean {
  return row === grid.anomalyRow && column === grid.anomalyColumn;
}

/**
 * Evaluate a tap by grid position. This is the renderer's single source of
 * truth for tap correctness: `SpotItCard` routes every tap through here rather
 * than re-deriving the anomaly check inline.
 */
export function evaluateSpotItTap(
  grid: SpotItGrid,
  tap: GridCell,
): SpotItTapResult {
  return { isCorrect: isAnomalyCell(grid, tap.row, tap.column) };
}
