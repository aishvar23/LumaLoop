import { describe, expect, it } from 'vitest';

import type { SignalTile } from '../../cards/types';
import { evaluateSignalSet, isValidSignalTrio } from './signalSetEvaluator';

const tiles: SignalTile[] = [
  { id: 'a', shape: 'circle', fill: 'solid', count: 1 },
  { id: 'b', shape: 'triangle', fill: 'striped', count: 2 },
  { id: 'c', shape: 'diamond', fill: 'outline', count: 3 },
  { id: 'd', shape: 'circle', fill: 'solid', count: 2 },
];

describe('signalSetEvaluator', () => {
  it('accepts a trio whose dimensions are all different', () => {
    expect(isValidSignalTrio(tiles.slice(0, 3))).toBe(true);
    expect(evaluateSignalSet({ tiles }, ['a', 'b', 'c'])).toMatchObject({
      isCorrect: true,
      resolutionType: 'correct',
      signals: { different_dimensions: 3, valid_trio: true },
    });
  });

  it('rejects a two-same-one-different dimension', () => {
    expect(evaluateSignalSet({ tiles }, ['a', 'b', 'd'])).toMatchObject({
      isCorrect: false,
      resolutionType: 'incorrect',
      signals: { valid_trio: false },
    });
  });

  it('rejects missing and repeated selections', () => {
    expect(evaluateSignalSet({ tiles }, ['a', 'a', 'a']).isCorrect).toBe(false);
    expect(evaluateSignalSet({ tiles }, ['a', 'missing', 'c']).isCorrect).toBe(
      false,
    );
  });
});
