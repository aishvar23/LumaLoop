import type {
  CircuitFlowCard,
  CircuitRotation,
  CircuitSolution,
  GridDirection,
} from '../../cards/types';
import type { ResolutionType } from '../contract';

export type CircuitRotationMap = Readonly<Record<string, CircuitRotation>>;

export type CircuitFlowSignals = {
  connected_tiles: number;
  total_tiles: number;
  dangling_connections: number;
  rotations_used: number;
};

export type CircuitFlowResult = {
  isCorrect: boolean;
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: CircuitFlowSignals;
};

export type CircuitAnswerKey = Pick<
  CircuitFlowCard['config'],
  'rows' | 'columns' | 'sourceTileId' | 'tiles'
>;

const DIRECTIONS: readonly GridDirection[] = ['up', 'right', 'down', 'left'];

const DELTAS: Readonly<
  Record<GridDirection, Readonly<{ row: number; column: number }>>
> = Object.freeze({
  up: Object.freeze({ row: -1, column: 0 }),
  right: Object.freeze({ row: 0, column: 1 }),
  down: Object.freeze({ row: 1, column: 0 }),
  left: Object.freeze({ row: 0, column: -1 }),
});

const OPPOSITE: Readonly<Record<GridDirection, GridDirection>> = Object.freeze({
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
});

function coordinateKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function rotateCircuitDirection(
  direction: GridDirection,
  rotation: CircuitRotation,
): GridDirection {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(index + rotation) % DIRECTIONS.length];
}

export function rotatedCircuitConnections(
  connections: ReadonlyArray<GridDirection>,
  rotation: CircuitRotation,
): readonly GridDirection[] {
  return connections.map((direction) =>
    rotateCircuitDirection(direction, rotation),
  );
}

export function initialCircuitRotations(
  tiles: CircuitFlowCard['config']['tiles'],
): CircuitRotationMap {
  return Object.fromEntries(
    tiles.map((tile) => [tile.id, tile.initialRotation]),
  ) as CircuitRotationMap;
}

export function circuitRotationsFromSolution(
  solution: ReadonlyArray<CircuitSolution>,
): CircuitRotationMap {
  return Object.fromEntries(
    solution.map((item) => [item.tileId, item.rotation]),
  ) as CircuitRotationMap;
}

export function evaluateCircuitFlow(
  answer: CircuitAnswerKey,
  rotations: CircuitRotationMap,
  rotationsUsed: number,
): CircuitFlowResult {
  const byCoordinate = new Map(
    answer.tiles.map((tile) => [coordinateKey(tile.row, tile.column), tile]),
  );
  const connectionMap = new Map(
    answer.tiles.map((tile) => [
      tile.id,
      new Set(
        rotatedCircuitConnections(
          tile.connections,
          rotations[tile.id] ?? tile.initialRotation,
        ),
      ),
    ]),
  );

  let danglingConnections = 0;
  for (const tile of answer.tiles) {
    for (const direction of connectionMap.get(tile.id) ?? []) {
      const delta = DELTAS[direction];
      const neighbor = byCoordinate.get(
        coordinateKey(tile.row + delta.row, tile.column + delta.column),
      );
      if (
        !neighbor ||
        !connectionMap.get(neighbor.id)?.has(OPPOSITE[direction])
      ) {
        danglingConnections += 1;
      }
    }
  }

  const visited = new Set<string>();
  const source = answer.tiles.find((tile) => tile.id === answer.sourceTileId);
  const queue = source ? [source] : [];
  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile || visited.has(tile.id)) continue;
    visited.add(tile.id);
    for (const direction of connectionMap.get(tile.id) ?? []) {
      const delta = DELTAS[direction];
      const neighbor = byCoordinate.get(
        coordinateKey(tile.row + delta.row, tile.column + delta.column),
      );
      if (
        neighbor &&
        connectionMap.get(neighbor.id)?.has(OPPOSITE[direction]) &&
        !visited.has(neighbor.id)
      ) {
        queue.push(neighbor);
      }
    }
  }

  const isCorrect =
    answer.tiles.length > 0 &&
    visited.size === answer.tiles.length &&
    danglingConnections === 0;
  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      connected_tiles: visited.size,
      total_tiles: answer.tiles.length,
      dangling_connections: danglingConnections,
      rotations_used: rotationsUsed,
    },
  };
}
