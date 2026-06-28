import { describe, expect, it } from 'vitest';

import {
  TIME_LIMIT_BY_DIFFICULTY,
  timeLimitForDifficulty,
  withDifficultyTimeLimit,
} from './difficultyTime';
import type { LiquidCard } from './types';

describe('TIME_LIMIT_BY_DIFFICULTY', () => {
  it('maps each difficulty tier to its agreed budget (ms)', () => {
    expect(TIME_LIMIT_BY_DIFFICULTY).toEqual({
      extremely_easy: 30000,
      easy: 60000,
      medium: 90000,
      hard: 120000,
      extremely_hard: 180000,
    });
  });

  it('increases monotonically with difficulty', () => {
    expect(TIME_LIMIT_BY_DIFFICULTY.extremely_easy).toBeLessThan(
      TIME_LIMIT_BY_DIFFICULTY.easy,
    );
    expect(TIME_LIMIT_BY_DIFFICULTY.easy).toBeLessThan(
      TIME_LIMIT_BY_DIFFICULTY.medium,
    );
    expect(TIME_LIMIT_BY_DIFFICULTY.medium).toBeLessThan(
      TIME_LIMIT_BY_DIFFICULTY.hard,
    );
    expect(TIME_LIMIT_BY_DIFFICULTY.hard).toBeLessThan(
      TIME_LIMIT_BY_DIFFICULTY.extremely_hard,
    );
  });
});

describe('timeLimitForDifficulty', () => {
  it('returns the tier budget', () => {
    expect(timeLimitForDifficulty('medium')).toBe(90000);
    expect(timeLimitForDifficulty('extremely_hard')).toBe(180000);
  });
});

describe('withDifficultyTimeLimit', () => {
  // Minimal spot_it-shaped card; only the fields the helper touches matter.
  const baseCard = {
    cardId: 'test-1',
    templateType: 'spot_it',
    difficulty: 'hard',
    config: { timeLimitMs: 9999, rows: 3, columns: 3 },
  } as unknown as LiquidCard;

  it('overrides config.timeLimitMs from the difficulty tier', () => {
    const result = withDifficultyTimeLimit(baseCard);
    expect(result.config.timeLimitMs).toBe(TIME_LIMIT_BY_DIFFICULTY.hard);
  });

  it('preserves every other field and does not mutate the input', () => {
    const result = withDifficultyTimeLimit(baseCard);
    expect(result.cardId).toBe('test-1');
    expect(result.templateType).toBe('spot_it');
    expect((result.config as { rows: number }).rows).toBe(3);
    // Input untouched (the catalog source-of-truth stays as authored).
    expect(baseCard.config.timeLimitMs).toBe(9999);
  });
});
