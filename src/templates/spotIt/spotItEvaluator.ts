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

/** True iff (`row`, `column`) is the grid's anomaly cell. */
export function isAnomalyCell(
  grid: SpotItGrid,
  row: number,
  column: number,
): boolean {
  return row === grid.anomalyRow && column === grid.anomalyColumn;
}

/** Row-major flat index of a cell, for index-addressed callers. */
export function cellIndex(grid: SpotItGrid, row: number, column: number): number {
  return row * grid.columns + column;
}

/** True iff the flat (row-major) `index` addresses the anomaly cell. */
export function isAnomalyAtIndex(grid: SpotItGrid, index: number): boolean {
  return index === cellIndex(grid, grid.anomalyRow, grid.anomalyColumn);
}

/** Evaluate a tap by grid position; the renderer's single source of truth. */
export function evaluateSpotItTap(
  grid: SpotItGrid,
  tap: GridCell,
): SpotItTapResult {
  return { isCorrect: isAnomalyCell(grid, tap.row, tap.column) };
}
