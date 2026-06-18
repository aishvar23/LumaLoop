/**
 * Tests for the pure Spot It evaluator (Azure DevOps #64; Design §9.1).
 *
 * Pure-function tests: no React, no timers — just the correct/incorrect tap
 * decision and its boundary behavior.
 */

import { describe, expect, it } from 'vitest';

import type { SpotItGrid } from './spotItEvaluator';
import {
  cellIndex,
  evaluateSpotItTap,
  isAnomalyAtIndex,
  isAnomalyCell,
} from './spotItEvaluator';

// A 3×4 grid with the anomaly at (row 1, column 2).
const grid: SpotItGrid = {
  rows: 3,
  columns: 4,
  anomalyRow: 1,
  anomalyColumn: 2,
};

describe('isAnomalyCell', () => {
  it('is true only at the anomaly cell', () => {
    expect(isAnomalyCell(grid, 1, 2)).toBe(true);
  });

  it('is false for a different row but the same column', () => {
    expect(isAnomalyCell(grid, 0, 2)).toBe(false);
    expect(isAnomalyCell(grid, 2, 2)).toBe(false);
  });

  it('is false for the same row but a different column', () => {
    expect(isAnomalyCell(grid, 1, 0)).toBe(false);
    expect(isAnomalyCell(grid, 1, 3)).toBe(false);
  });

  it('is false at the grid corners (boundary cells)', () => {
    expect(isAnomalyCell(grid, 0, 0)).toBe(false);
    expect(isAnomalyCell(grid, 0, 3)).toBe(false);
    expect(isAnomalyCell(grid, 2, 0)).toBe(false);
    expect(isAnomalyCell(grid, 2, 3)).toBe(false);
  });

  it('treats the anomaly corner as correct when it sits on a boundary', () => {
    const corner: SpotItGrid = { rows: 2, columns: 2, anomalyRow: 0, anomalyColumn: 0 };
    expect(isAnomalyCell(corner, 0, 0)).toBe(true);
    expect(isAnomalyCell(corner, 1, 1)).toBe(false);
  });
});

describe('evaluateSpotItTap', () => {
  it('reports the anomaly tap as correct', () => {
    expect(evaluateSpotItTap(grid, { row: 1, column: 2 })).toEqual({ isCorrect: true });
  });

  it('reports any other tap as incorrect', () => {
    expect(evaluateSpotItTap(grid, { row: 0, column: 0 })).toEqual({ isCorrect: false });
    expect(evaluateSpotItTap(grid, { row: 2, column: 3 })).toEqual({ isCorrect: false });
  });
});

describe('flat-index helpers', () => {
  it('computes the row-major flat index', () => {
    expect(cellIndex(grid, 0, 0)).toBe(0);
    expect(cellIndex(grid, 1, 2)).toBe(6); // 1*4 + 2
    expect(cellIndex(grid, 2, 3)).toBe(11);
  });

  it('matches the anomaly by flat index', () => {
    expect(isAnomalyAtIndex(grid, 6)).toBe(true);
    expect(isAnomalyAtIndex(grid, 0)).toBe(false);
    expect(isAnomalyAtIndex(grid, 11)).toBe(false);
  });
});
