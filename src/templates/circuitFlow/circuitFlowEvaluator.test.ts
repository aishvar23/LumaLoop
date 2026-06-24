import { describe, expect, it } from 'vitest';

import type { CircuitFlowCard } from '../../cards/types';
import {
  circuitRotationsFromSolution,
  evaluateCircuitFlow,
  initialCircuitRotations,
  rotateCircuitDirection,
} from './circuitFlowEvaluator';

const config: CircuitFlowCard['config'] = {
  rows: 1,
  columns: 3,
  sourceTileId: 'a',
  tiles: [
    { id: 'a', row: 0, column: 0, connections: ['right'], initialRotation: 1 },
    {
      id: 'b',
      row: 0,
      column: 1,
      connections: ['left', 'right'],
      initialRotation: 1,
    },
    { id: 'c', row: 0, column: 2, connections: ['left'], initialRotation: 2 },
  ],
  solution: [
    { tileId: 'a', rotation: 0 },
    { tileId: 'b', rotation: 0 },
    { tileId: 'c', rotation: 0 },
  ],
  timeLimitMs: 15000,
};

describe('circuitFlowEvaluator', () => {
  it('rotates cardinal directions clockwise', () => {
    expect(rotateCircuitDirection('up', 1)).toBe('right');
    expect(rotateCircuitDirection('left', 2)).toBe('right');
  });

  it('accepts a leak-free fully connected network', () => {
    expect(
      evaluateCircuitFlow(
        config,
        circuitRotationsFromSolution(config.solution),
        3,
      ),
    ).toMatchObject({
      isCorrect: true,
      resolutionType: 'correct',
      signals: { connected_tiles: 3, dangling_connections: 0 },
    });
  });

  it('rejects disconnected rotations and reports leaks', () => {
    const result = evaluateCircuitFlow(
      config,
      initialCircuitRotations(config.tiles),
      0,
    );
    expect(result.isCorrect).toBe(false);
    expect(result.signals.connected_tiles).toBe(1);
    expect(result.signals.dangling_connections).toBeGreaterThan(0);
  });
});
