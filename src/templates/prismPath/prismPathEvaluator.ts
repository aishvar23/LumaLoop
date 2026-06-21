/**
 * Prism Path evaluator — pure beam tracing for the mirror-routing template.
 *
 * A beam starts at `entry`, travels in `entryDirection`, reflects from slash and
 * backslash mirrors, stops on blockers or grid exits, and succeeds only when it
 * reaches `target`. Renderers use this module as the single source of truth for
 * both live beam preview and final card resolution.
 */

import type {
  GridCoordinate,
  GridDirection,
  PrismMirrorOrientation,
  PrismPathCard,
  PrismPathSolution,
} from '../../cards/types';
import type { ResolutionType } from '../contract';

export type PrismPathOrientationMap = Readonly<
  Record<string, PrismMirrorOrientation>
>;

export type PrismPathExitReason =
  | 'hit_target'
  | 'blocked'
  | 'escaped'
  | 'looped';

export type PrismPathTrace = {
  cells: GridCoordinate[];
  exitReason: PrismPathExitReason;
  reachedTarget: boolean;
};

export type PrismPathAnswerKey = Pick<
  PrismPathCard['config'],
  | 'rows'
  | 'columns'
  | 'entry'
  | 'entryDirection'
  | 'target'
  | 'mirrors'
  | 'blockers'
>;

export type PrismPathSignals = {
  reached_target: boolean;
  beam_steps: number;
  rotations_used: number;
  exit_reason: PrismPathExitReason;
};

export type PrismPathResult = {
  isCorrect: boolean;
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: PrismPathSignals;
};

const DIRECTION_DELTAS: Readonly<
  Record<GridDirection, Readonly<{ row: number; column: number }>>
> = Object.freeze({
  up: Object.freeze({ row: -1, column: 0 }),
  right: Object.freeze({ row: 0, column: 1 }),
  down: Object.freeze({ row: 1, column: 0 }),
  left: Object.freeze({ row: 0, column: -1 }),
});

const SLASH_REFLECTION: Readonly<Record<GridDirection, GridDirection>> =
  Object.freeze({
    up: 'right',
    right: 'up',
    down: 'left',
    left: 'down',
  });

const BACKSLASH_REFLECTION: Readonly<Record<GridDirection, GridDirection>> =
  Object.freeze({
    up: 'left',
    left: 'up',
    down: 'right',
    right: 'down',
  });

function coordKey(coord: GridCoordinate): string {
  return `${coord.row}:${coord.column}`;
}

function stateKey(coord: GridCoordinate, direction: GridDirection): string {
  return `${coordKey(coord)}:${direction}`;
}

function inBounds(
  coord: GridCoordinate,
  rows: number,
  columns: number,
): boolean {
  return (
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.column) &&
    coord.row >= 0 &&
    coord.row < rows &&
    coord.column >= 0 &&
    coord.column < columns
  );
}

function reflect(
  direction: GridDirection,
  orientation: PrismMirrorOrientation,
): GridDirection {
  return orientation === 'slash'
    ? SLASH_REFLECTION[direction]
    : BACKSLASH_REFLECTION[direction];
}

export function orientationMapFromSolution(
  solution: ReadonlyArray<PrismPathSolution>,
): PrismPathOrientationMap {
  const out: Record<string, PrismMirrorOrientation> = {};
  for (const item of solution) out[item.mirrorId] = item.orientation;
  return out;
}

export function initialOrientationMap(
  mirrors: PrismPathCard['config']['mirrors'],
): PrismPathOrientationMap {
  const out: Record<string, PrismMirrorOrientation> = {};
  for (const mirror of mirrors) out[mirror.id] = mirror.initialOrientation;
  return out;
}

export function tracePrismPath(
  answer: PrismPathAnswerKey,
  orientations: PrismPathOrientationMap = initialOrientationMap(answer.mirrors),
): PrismPathTrace {
  const { rows, columns, entry, entryDirection, target, mirrors, blockers } =
    answer;
  const blockerSet = new Set(blockers.map(coordKey));
  const mirrorByCoord = new Map<string, string>();
  for (const mirror of mirrors) {
    mirrorByCoord.set(coordKey(mirror), mirror.id);
  }

  let current: GridCoordinate = { ...entry };
  let direction = entryDirection;
  const cells: GridCoordinate[] = [];
  const seenStates = new Set<string>();

  while (true) {
    if (!inBounds(current, rows, columns)) {
      return { cells, exitReason: 'escaped', reachedTarget: false };
    }

    const key = stateKey(current, direction);
    if (seenStates.has(key)) {
      return { cells, exitReason: 'looped', reachedTarget: false };
    }
    seenStates.add(key);
    cells.push({ ...current });

    if (current.row === target.row && current.column === target.column) {
      return { cells, exitReason: 'hit_target', reachedTarget: true };
    }

    if (blockerSet.has(coordKey(current))) {
      return { cells, exitReason: 'blocked', reachedTarget: false };
    }

    const mirrorId = mirrorByCoord.get(coordKey(current));
    if (mirrorId) {
      direction = reflect(direction, orientations[mirrorId] ?? 'slash');
    }

    const delta = DIRECTION_DELTAS[direction];
    current = {
      row: current.row + delta.row,
      column: current.column + delta.column,
    };
  }
}

export function evaluatePrismPath(
  answer: PrismPathAnswerKey,
  orientations: PrismPathOrientationMap,
  rotationsUsed: number,
): PrismPathResult {
  const trace = tracePrismPath(answer, orientations);
  return {
    isCorrect: trace.reachedTarget,
    resolutionType: trace.reachedTarget ? 'correct' : 'incorrect',
    signals: {
      reached_target: trace.reachedTarget,
      beam_steps: trace.cells.length,
      rotations_used: rotationsUsed,
      exit_reason: trace.exitReason,
    },
  };
}
