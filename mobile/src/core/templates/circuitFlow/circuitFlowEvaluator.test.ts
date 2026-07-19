import type { CircuitFlowCard } from '../../cards/types';
import {
  circuitRotationsFromSolution,
  evaluateCircuitFlow,
  initialCircuitRotations,
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
  it('accepts the solved network', () => {
    expect(
      evaluateCircuitFlow(
        config,
        circuitRotationsFromSolution(config.solution),
        3,
      ).isCorrect,
    ).toBe(true);
  });

  it('rejects the scrambled network', () => {
    const result = evaluateCircuitFlow(
      config,
      initialCircuitRotations(config.tiles),
      0,
    );
    expect(result.isCorrect).toBe(false);
    expect(result.signals.dangling_connections).toBeGreaterThan(0);
  });
});
