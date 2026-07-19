import { describe, expect, it } from 'vitest';

import { catalog } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import { buildGamePlay } from './gamePlayFromResolution';

const card: LiquidCard = catalog[0];

function resolution(overrides: Partial<CardResolution> = {}): CardResolution {
  return {
    cardId: card.cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 2500,
    interactionElapsedMs: 1800,
    attemptCount: 1,
    signals: {},
    ...overrides,
  };
}

describe('buildGamePlay', () => {
  it('maps a resolved card + score into a game_plays insert row', () => {
    const row = buildGamePlay({
      userId: 'user-42',
      card,
      resolution: resolution(),
      points: 137,
    });
    expect(row).toEqual({
      user_id: 'user-42',
      card_id: card.cardId,
      template_type: card.templateType,
      category: card.category,
      is_correct: true,
      points: 137,
      elapsed_ms: 1800,
    });
  });

  it('uses the INTERACTION elapsed (not total) and rounds it to an integer', () => {
    const row = buildGamePlay({
      userId: 'u',
      card,
      resolution: resolution({ interactionElapsedMs: 1234.7, elapsedMs: 9999 }),
      points: 0,
    });
    expect(row.elapsed_ms).toBe(1235);
  });

  it('records is_correct false and zero points on a miss', () => {
    const row = buildGamePlay({
      userId: 'u',
      card,
      resolution: resolution({
        resolutionType: 'incorrect',
        isCorrect: false,
      }),
      points: 0,
    });
    expect(row.is_correct).toBe(false);
    expect(row.points).toBe(0);
  });

  it('clamps negative/fractional points to a non-negative integer', () => {
    const row = buildGamePlay({
      userId: 'u',
      card,
      resolution: resolution(),
      points: -5.6,
    });
    expect(row.points).toBe(0);
  });

  it('null elapsed_ms when interaction elapsed is non-finite or negative', () => {
    expect(
      buildGamePlay({
        userId: 'u',
        card,
        resolution: resolution({ interactionElapsedMs: Number.NaN }),
        points: 10,
      }).elapsed_ms,
    ).toBeNull();
    expect(
      buildGamePlay({
        userId: 'u',
        card,
        resolution: resolution({ interactionElapsedMs: -3 }),
        points: 10,
      }).elapsed_ms,
    ).toBeNull();
  });
});
