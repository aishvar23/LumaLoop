import type { SignalTile } from '../../cards/types';
import { evaluateSignalSet, isValidSignalTrio } from './signalSetEvaluator';

const tiles: SignalTile[] = [
  { id: 'a', shape: 'circle', fill: 'solid', count: 1 },
  { id: 'b', shape: 'triangle', fill: 'striped', count: 2 },
  { id: 'c', shape: 'diamond', fill: 'outline', count: 3 },
  { id: 'd', shape: 'circle', fill: 'solid', count: 2 },
];

describe('signalSetEvaluator', () => {
  it('accepts all-different dimensions', () => {
    expect(isValidSignalTrio(tiles.slice(0, 3))).toBe(true);
    expect(evaluateSignalSet({ tiles }, ['a', 'b', 'c']).isCorrect).toBe(true);
  });

  it('rejects an invalid or repeated trio', () => {
    expect(evaluateSignalSet({ tiles }, ['a', 'b', 'd']).isCorrect).toBe(false);
    expect(evaluateSignalSet({ tiles }, ['a', 'a', 'a']).isCorrect).toBe(false);
  });
});
