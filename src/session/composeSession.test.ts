import { describe, expect, it } from 'vitest';

import { catalog } from '../cards/catalog';
import type { Difficulty, LiquidCard, SpotItCard } from '../cards/types';
import { composeSession, toDayKey } from './composeSession';
import { MODE_DEFAULTS, type SessionMode } from './sessionTypes';

/**
 * Seeded session composition (Technical Design §12, Design §19, Azure DevOps
 * #61). These assert the composer is pure and deterministic and that it honors
 * the documented selection rules against the real authored catalog.
 */

const MODES: readonly SessionMode[] = ['one_minute_rescue', 'three_minute_reset'];

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const cardById = new Map<string, LiquidCard>(
  catalog.map((card) => [card.cardId, card]),
);

function cardsFor(ids: readonly string[]): LiquidCard[] {
  return ids.map((id) => {
    const card = cardById.get(id);
    if (!card) throw new Error(`unknown cardId in test helper: ${id}`);
    return card;
  });
}

describe('composeSession — determinism', () => {
  it('is byte-identical across repeated calls for the same (user, day, mode)', () => {
    for (const mode of MODES) {
      const a = composeSession({ mode, anonymousUserId: 'user-1', day: '2026-06-16' });
      const b = composeSession({ mode, anonymousUserId: 'user-1', day: '2026-06-16' });
      expect(a).toEqual(b);
    }
  });

  it('produces a frozen-key result independent of call order / interleaving', () => {
    const a = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-01-02' });
    // Intervening calls with other seeds must not perturb a repeat call.
    composeSession({ mode: 'one_minute_rescue', anonymousUserId: 'other', day: '2030-12-31' });
    const b = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-01-02' });
    expect(a).toEqual(b);
  });

  it('varies across different days for the same user/mode', () => {
    const days = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20'];
    const outputs = days.map((day) =>
      composeSession({ mode: 'three_minute_reset', anonymousUserId: 'user-1', day }).join(','),
    );
    expect(new Set(outputs).size).toBeGreaterThan(1);
  });

  it('varies across different users for the same day/mode', () => {
    const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
    const outputs = users.map((anonymousUserId) =>
      composeSession({ mode: 'three_minute_reset', anonymousUserId, day: '2026-06-16' }).join(','),
    );
    expect(new Set(outputs).size).toBeGreaterThan(1);
  });

  it('differs between modes for the same user/day', () => {
    const rescue = composeSession({ mode: 'one_minute_rescue', anonymousUserId: 'user-1', day: '2026-06-16' });
    const reset = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'user-1', day: '2026-06-16' });
    expect(rescue).not.toEqual(reset);
  });
});

describe('composeSession — purity / injected clock', () => {
  it('derives the same day key from an injected `now` as from an explicit `day`', () => {
    const now = new Date(Date.UTC(2026, 5, 16, 9, 30, 0)); // 2026-06-16T09:30Z
    const fromNow = composeSession({ mode: 'one_minute_rescue', anonymousUserId: 'u', now });
    const fromDay = composeSession({ mode: 'one_minute_rescue', anonymousUserId: 'u', day: '2026-06-16' });
    expect(fromNow).toEqual(fromDay);
  });

  it('accepts an epoch-ms `now` and matches the equivalent day key', () => {
    const epochMs = Date.UTC(2026, 5, 16, 23, 59, 59);
    const fromEpoch = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', now: epochMs });
    const fromDay = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16' });
    expect(fromEpoch).toEqual(fromDay);
  });

  it('toDayKey emits a UTC yyyy-mm-dd string', () => {
    expect(toDayKey(new Date(Date.UTC(2026, 0, 5, 0, 0, 0)))).toBe('2026-01-05');
    expect(toDayKey(new Date(Date.UTC(2026, 11, 31, 23, 59, 59)))).toBe('2026-12-31');
  });
});

describe('composeSession — length / budget', () => {
  it('emits exactly MODE_DEFAULTS[mode].maxCards from the real catalog', () => {
    for (const mode of MODES) {
      const ids = composeSession({ mode, anonymousUserId: 'user-1', day: '2026-06-16' });
      expect(ids).toHaveLength(MODE_DEFAULTS[mode].maxCards);
    }
  });

  it('keeps total estimatedSeconds within the mode time budget (soft cap)', () => {
    for (const mode of MODES) {
      const budgetSeconds = MODE_DEFAULTS[mode].maxDurationMs / 1000;
      for (const anonymousUserId of ['user-1', 'user-2', 'user-3', 'user-4']) {
        const ids = composeSession({ mode, anonymousUserId, day: '2026-06-16' });
        const total = cardsFor(ids).reduce((sum, c) => sum + c.estimatedSeconds, 0);
        expect(total).toBeLessThanOrEqual(budgetSeconds);
      }
    }
  });
});

describe('composeSession — eligibility', () => {
  it('only emits existing, eligible cardIds', () => {
    for (const mode of MODES) {
      const ids = composeSession({ mode, anonymousUserId: 'user-7', day: '2026-06-16' });
      for (const id of ids) {
        const card = cardById.get(id);
        expect(card, `cardId ${id} must exist in the catalog`).toBeDefined();
        expect(card?.reviewStatus).toBe('manual_reviewed');
        expect(['entertainment_only', 'mechanic_mapped']).toContain(card?.evidenceTier);
      }
    }
  });

  it('excludes unreviewed cards from composition', () => {
    const unreviewed: SpotItCard = {
      ...(catalog.find((c) => c.templateType === 'spot_it') as SpotItCard),
      cardId: 'spotit-unreviewed',
      reviewStatus: 'unreviewed',
    };
    const withUnreviewed: readonly LiquidCard[] = [...catalog, unreviewed];
    const ids = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'user-1',
      day: '2026-06-16',
      catalog: withUnreviewed,
    });
    expect(ids).not.toContain('spotit-unreviewed');
  });

  it('never repeats a card within one session', () => {
    for (const mode of MODES) {
      for (const day of ['2026-06-16', '2026-07-01', '2026-08-22']) {
        const ids = composeSession({ mode, anonymousUserId: 'user-9', day });
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('composeSession — ordering constraints', () => {
  // Exercise many seeds so the structural guarantees are not accidentally met.
  const seeds: Array<{ anonymousUserId: string; day: string }> = [];
  for (const u of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (const day of ['2026-06-16', '2026-06-17', '2026-09-01', '2027-01-01']) {
      seeds.push({ anonymousUserId: `user-${u}`, day });
    }
  }

  it('never shows 3 of the same template back-to-back', () => {
    for (const mode of MODES) {
      for (const seed of seeds) {
        const templates = cardsFor(composeSession({ mode, ...seed })).map(
          (c) => c.templateType,
        );
        for (let i = 2; i < templates.length; i++) {
          const threeInARow =
            templates[i] === templates[i - 1] && templates[i - 1] === templates[i - 2];
          expect(
            threeInARow,
            `3 consecutive ${templates[i]} for ${seed.anonymousUserId}/${seed.day}/${mode}`,
          ).toBe(false);
        }
      }
    }
  });

  it('ramps difficulty non-decreasingly (easy before medium)', () => {
    for (const mode of MODES) {
      for (const seed of seeds) {
        const ranks = cardsFor(composeSession({ mode, ...seed })).map(
          (c) => DIFFICULTY_RANK[c.difficulty],
        );
        for (let i = 1; i < ranks.length; i++) {
          expect(
            ranks[i] >= ranks[i - 1],
            `difficulty must not decrease at index ${i} for ${seed.anonymousUserId}/${seed.day}/${mode} (${ranks.join(',')})`,
          ).toBe(true);
        }
      }
    }
  });

  it('spreads across more than one category when the catalog allows', () => {
    for (const mode of MODES) {
      for (const seed of seeds) {
        const categories = new Set(
          cardsFor(composeSession({ mode, ...seed })).map((c) => c.category),
        );
        expect(
          categories.size,
          `expected category spread for ${seed.anonymousUserId}/${seed.day}/${mode}`,
        ).toBeGreaterThan(1);
      }
    }
  });
});

describe('composeSession — graceful degradation on a too-small catalog', () => {
  it('returns a shorter, duplicate-free session without throwing', () => {
    const tiny: readonly LiquidCard[] = catalog
      .filter((c) => c.difficulty === 'easy')
      .slice(0, 2);
    const ids = composeSession({
      mode: 'three_minute_reset', // wants 7
      anonymousUserId: 'user-1',
      day: '2026-06-16',
      catalog: tiny,
    });
    expect(ids.length).toBeLessThanOrEqual(tiny.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty array when no card is eligible', () => {
    const noneEligible: readonly LiquidCard[] = catalog.map((c) => ({
      ...c,
      reviewStatus: 'unreviewed' as const,
    }));
    const ids = composeSession({
      mode: 'one_minute_rescue',
      anonymousUserId: 'user-1',
      day: '2026-06-16',
      catalog: noneEligible,
    });
    expect(ids).toEqual([]);
  });
});
