import { describe, expect, it } from 'vitest';

import { catalog } from '../cards/catalog';
import type {
  ChallengeCategory,
  Difficulty,
  LiquidCard,
  SpotItCard,
} from '../cards/types';
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

  it('uses an injective seed key (no delimiter collision across user/day)', () => {
    // Under a naive `${user}:${day}:${mode}` join these two inputs would share
    // the key `a:b:c:three_minute_reset` and compose identical sessions. With an
    // injective (JSON-encoded) key they must diverge.
    const a = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'a:b', day: 'c' });
    const b = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'a', day: 'b:c' });
    expect(a).not.toEqual(b);
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

  it('stays non-decreasing in difficulty at every bias level', () => {
    for (const mode of MODES) {
      for (const seed of seeds) {
        for (const difficultyBias of [0, 0.25, 0.5, 0.75, 1]) {
          const ranks = cardsFor(
            composeSession({ mode, ...seed, difficultyBias }),
          ).map((c) => DIFFICULTY_RANK[c.difficulty]);
          for (let i = 1; i < ranks.length; i++) {
            expect(
              ranks[i] >= ranks[i - 1],
              `decreased at ${i} (bias ${difficultyBias}) for ${seed.anonymousUserId}/${seed.day}/${mode}: ${ranks.join(',')}`,
            ).toBe(true);
          }
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

describe('composeSession — progressive difficulty bias', () => {
  const seeds: Array<{ anonymousUserId: string; day: string }> = [];
  for (const u of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (const day of ['2026-06-16', '2026-06-17', '2026-09-01', '2027-01-01']) {
      seeds.push({ anonymousUserId: `user-${u}`, day });
    }
  }

  const meanRank = (ids: readonly string[]): number => {
    const ranks = cardsFor(ids).map((c) => DIFFICULTY_RANK[c.difficulty]);
    return ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
  };

  it('defaults to the original behaviour (omitted bias === bias 0)', () => {
    for (const mode of MODES) {
      const omitted = composeSession({ mode, anonymousUserId: 'u', day: '2026-06-16' });
      const explicitZero = composeSession({
        mode,
        anonymousUserId: 'u',
        day: '2026-06-16',
        difficultyBias: 0,
      });
      expect(omitted).toEqual(explicitZero);
    }
  });

  it('skews harder as the bias rises (mean difficulty non-decreasing across bias)', () => {
    // Averaged over several seeds so the trend is structural, not a lucky seed.
    const biases = [0, 0.5, 1];
    const means = biases.map((difficultyBias) => {
      const perSeed = seeds.map((seed) =>
        meanRank(composeSession({ mode: 'three_minute_reset', ...seed, difficultyBias })),
      );
      return perSeed.reduce((s, m) => s + m, 0) / perSeed.length;
    });
    for (let i = 1; i < means.length; i++) {
      expect(
        means[i] >= means[i - 1],
        `mean difficulty should not drop as bias rises: ${means.join(',')}`,
      ).toBe(true);
    }
    // And the ramp must actually move the needle, not be a no-op.
    expect(means[means.length - 1]).toBeGreaterThan(means[0]);
  });

  it('reaches hard cards only at a positive bias (bias 0 stays easy->medium)', () => {
    const atZero = cardsFor(
      composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 0 }),
    ).map((c) => c.difficulty);
    expect(atZero).not.toContain('hard');

    const atOne = cardsFor(
      composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 1 }),
    ).map((c) => c.difficulty);
    expect(atOne).toContain('hard');
  });

  it('is deterministic for a fixed (user, day, mode, bias)', () => {
    const a = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 0.7 });
    const b = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 0.7 });
    expect(a).toEqual(b);
  });

  it('clamps out-of-range bias (negative === 0, >1 === 1)', () => {
    const zero = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 0 });
    const negative = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: -2 });
    expect(negative).toEqual(zero);

    const one = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 1 });
    const tooBig = composeSession({ mode: 'three_minute_reset', anonymousUserId: 'u', day: '2026-06-16', difficultyBias: 99 });
    expect(tooBig).toEqual(one);
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

// ---------------------------------------------------------------------------
// Synthetic catalogs that FORCE each documented fallback path. The real
// 26-card catalog satisfies every constraint trivially, so these construct
// pathological pools to actually exercise the run-limit relaxation, the
// difficulty-tier spill, and the soft time-budget degrade.
// ---------------------------------------------------------------------------

describe('composeSession — forced fallback paths (synthetic catalogs)', () => {
  const spotItBase = catalog.find((c) => c.templateType === 'spot_it');
  const tinyLogicBase = catalog.find((c) => c.templateType === 'tiny_logic');
  if (!spotItBase || !tinyLogicBase) {
    throw new Error('test setup expects spot_it and tiny_logic cards in the catalog');
  }

  /**
   * Clone a real (union-valid) card, forcing eligibility and overriding only the
   * metadata the composer reads. `templateType`/`config` come from the base so
   * the discriminated union stays valid.
   */
  function variant(
    base: LiquidCard,
    cardId: string,
    difficulty: Difficulty,
    category: ChallengeCategory,
    estimatedSeconds: number,
  ): LiquidCard {
    return {
      ...base,
      cardId,
      difficulty,
      category,
      estimatedSeconds,
      reviewStatus: 'manual_reviewed',
      evidenceTier: 'mechanic_mapped',
    };
  }

  const templateOf = (pool: readonly LiquidCard[], id: string) =>
    pool.find((c) => c.cardId === id)!.templateType;
  const rankOf = (pool: readonly LiquidCard[], id: string) =>
    DIFFICULTY_RANK[pool.find((c) => c.cardId === id)!.difficulty];

  it('relaxes the no-3-in-a-row rule (pass 2) on a single-template pool, still filling the session', () => {
    // Every card is spot_it, so a 3-in-a-row is mathematically unavoidable for a
    // 7-card session. The composer must reach full length via the run-limit
    // relaxation rather than throwing or returning a short session.
    const pool: readonly LiquidCard[] = [
      variant(spotItBase, 's-e1', 'easy', 'visual_attention', 10),
      variant(spotItBase, 's-e2', 'easy', 'working_memory', 10),
      variant(spotItBase, 's-e3', 'easy', 'logical_reasoning', 10),
      variant(spotItBase, 's-e4', 'easy', 'pattern_recognition', 10),
      variant(spotItBase, 's-m1', 'medium', 'visual_attention', 10),
      variant(spotItBase, 's-m2', 'medium', 'working_memory', 10),
      variant(spotItBase, 's-m3', 'medium', 'logical_reasoning', 10),
    ];
    const ids = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'u',
      day: '2026-06-16',
      catalog: pool,
    });
    expect(ids).toHaveLength(MODE_DEFAULTS.three_minute_reset.maxCards); // 7
    expect(new Set(ids).size).toBe(ids.length); // duplicate-free
    // A 3-in-a-row necessarily appears -> proves the relaxation path executed.
    const templates = ids.map((id) => templateOf(pool, id));
    const hasThreeInARow = templates.some(
      (t, i) => i >= 2 && t === templates[i - 1] && templates[i - 1] === templates[i - 2],
    );
    expect(hasThreeInARow).toBe(true);
  });

  it('spills easy->medium to keep the non-decreasing ramp when easy is exhausted', () => {
    // one_minute_rescue wants [easy, easy, medium] but only ONE easy card exists,
    // so slot 1 must spill into the harder (medium) tier; the ramp must stay
    // non-decreasing and never spill DOWN.
    const pool: readonly LiquidCard[] = [
      variant(spotItBase, 'only-easy', 'easy', 'visual_attention', 10),
      variant(tinyLogicBase, 'med-1', 'medium', 'working_memory', 10),
      variant(spotItBase, 'med-2', 'medium', 'logical_reasoning', 10),
      variant(tinyLogicBase, 'med-3', 'medium', 'pattern_recognition', 10),
    ];
    const ids = composeSession({
      mode: 'one_minute_rescue',
      anonymousUserId: 'u',
      day: '2026-06-16',
      catalog: pool,
    });
    expect(ids).toHaveLength(MODE_DEFAULTS.one_minute_rescue.maxCards); // 3
    expect(ids[0]).toBe('only-easy'); // the sole easy card leads the ramp
    const ranks = ids.map((id) => rankOf(pool, id));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i] >= ranks[i - 1], `ramp decreased at ${i}: ${ranks.join(',')}`).toBe(true);
    }
    expect(ranks[ranks.length - 1]).toBe(DIFFICULTY_RANK.medium); // spilled into medium
  });

  it('honors the time budget as a SOFT cap: fills full length even when every card exceeds it', () => {
    // one_minute_rescue budget = 60s; each card costs far more. The session is
    // card-count bounded, so it must still reach maxCards rather than truncating
    // to fit the budget (the documented soft-cap degrade).
    const big = 999;
    const pool: readonly LiquidCard[] = [
      variant(spotItBase, 'b-e1', 'easy', 'visual_attention', big),
      variant(tinyLogicBase, 'b-e2', 'easy', 'working_memory', big),
      variant(spotItBase, 'b-m1', 'medium', 'logical_reasoning', big),
      variant(tinyLogicBase, 'b-m2', 'medium', 'pattern_recognition', big),
    ];
    const ids = composeSession({
      mode: 'one_minute_rescue',
      anonymousUserId: 'u',
      day: '2026-06-16',
      catalog: pool,
    });
    expect(ids).toHaveLength(MODE_DEFAULTS.one_minute_rescue.maxCards); // 3
    const total = ids.reduce(
      (sum, id) => sum + pool.find((c) => c.cardId === id)!.estimatedSeconds,
      0,
    );
    const budgetSeconds = MODE_DEFAULTS.one_minute_rescue.maxDurationMs / 1000; // 60
    expect(total).toBeGreaterThan(budgetSeconds); // not truncated to fit budget
  });
});

describe('composeSession — excludeCardIds (D2 already-played skip)', () => {
  // Use the real catalog: exclusion should remove those ids from the result.
  it('omits excluded cards while the surviving pool is non-empty', () => {
    const full = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-user',
      day: '2026-06-21',
    });
    expect(full.length).toBeGreaterThan(2);
    const exclude = new Set(full.slice(0, 2)); // pretend the first two were played
    const filtered = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-user',
      day: '2026-06-21',
      excludeCardIds: exclude,
    });
    for (const id of exclude) expect(filtered).not.toContain(id);
    // No card is ever duplicated within a composition.
    expect(new Set(filtered).size).toBe(filtered.length);
  });

  it('accepts an array as well as a Set', () => {
    const full = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-arr',
      day: '2026-06-21',
    });
    const excludeArr = full.slice(0, 1);
    const filtered = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-arr',
      day: '2026-06-21',
      excludeCardIds: excludeArr,
    });
    expect(filtered).not.toContain(excludeArr[0]);
  });

  it('an empty exclusion is byte-identical to omitting it', () => {
    const base = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-empty',
      day: '2026-06-21',
    });
    const withEmptySet = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-empty',
      day: '2026-06-21',
      excludeCardIds: new Set<string>(),
    });
    const withEmptyArr = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-empty',
      day: '2026-06-21',
      excludeCardIds: [],
    });
    expect(withEmptySet).toEqual(base);
    expect(withEmptyArr).toEqual(base);
  });

  it('EXHAUSTION FALLBACK: excluding every eligible card replays the full pool (never empty)', () => {
    const full = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-all',
      day: '2026-06-21',
    });
    // Exclude every cardId that could possibly appear (the whole catalog).
    const excludeAll = new Set(catalog.map((c) => c.cardId));
    const fallback = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-all',
      day: '2026-06-21',
      excludeCardIds: excludeAll,
    });
    // Endless: the feed never empties — the fallback reproduces the full result.
    expect(fallback.length).toBe(full.length);
    expect(fallback).toEqual(full);
  });

  it('ignores ids that are not in the pool', () => {
    const base = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-noise',
      day: '2026-06-21',
    });
    const withNoise = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-noise',
      day: '2026-06-21',
      excludeCardIds: ['not-a-real-card', 'another-ghost'],
    });
    expect(withNoise).toEqual(base);
  });

  it('keeps the no-3-in-a-row + non-decreasing-difficulty rules under exclusion', () => {
    const full = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-rules',
      day: '2026-06-21',
    });
    const filtered = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: 'excl-rules',
      day: '2026-06-21',
      excludeCardIds: new Set(full.slice(0, 3)),
    });
    const cards = cardsFor(filtered);
    // No 3 identical templateTypes in a row.
    for (let i = 2; i < cards.length; i += 1) {
      const same =
        cards[i].templateType === cards[i - 1].templateType &&
        cards[i].templateType === cards[i - 2].templateType;
      expect(same).toBe(false);
    }
    // Non-decreasing difficulty.
    for (let i = 1; i < cards.length; i += 1) {
      expect(DIFFICULTY_RANK[cards[i].difficulty]).toBeGreaterThanOrEqual(
        DIFFICULTY_RANK[cards[i - 1].difficulty],
      );
    }
  });
});
