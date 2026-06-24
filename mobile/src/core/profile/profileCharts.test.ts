// Ported from web `src/profile/profileCharts.test.ts`; source of truth is the web
// app — keep in sync (profile charts). Mirrors the web test under jest (the web
// `import { describe, expect, it } from 'vitest'` is dropped — jest provides them
// as globals).
import type { CategoryStat } from './computeStats';
import {
  buildCategoryBars,
  buildPointsDistribution,
  formatPercent,
} from './profileCharts';

const cat = (over: Partial<CategoryStat> = {}): CategoryStat => ({
  category: 'visual_attention',
  played: 4,
  correct: 3,
  accuracy: 0.75,
  points: 100,
  ...over,
});

describe('formatPercent', () => {
  it('rounds a fraction to a whole percent', () => {
    expect(formatPercent(0.833)).toBe('83%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('clamps out-of-range / non-finite input to [0,1]', () => {
    expect(formatPercent(1.5)).toBe('100%');
    expect(formatPercent(-0.2)).toBe('0%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('buildCategoryBars — accuracy', () => {
  it('uses the accuracy fraction directly as the fill', () => {
    const bars = buildCategoryBars([cat({ accuracy: 0.5 })], 'accuracy');
    expect(bars[0]).toMatchObject({
      category: 'visual_attention',
      value: 0.5,
      valueLabel: '50%',
      fill: 0.5,
    });
  });

  it('clamps an out-of-range accuracy fill', () => {
    const bars = buildCategoryBars([cat({ accuracy: 1.4 })], 'accuracy');
    expect(bars[0].fill).toBe(1);
    expect(bars[0].valueLabel).toBe('100%');
  });
});

describe('buildCategoryBars — points (scaled to the leader)', () => {
  it('fills the longest bar fully and scales the rest', () => {
    const bars = buildCategoryBars(
      [cat({ category: 'a', points: 200 }), cat({ category: 'b', points: 50 })],
      'points',
    );
    expect(bars[0]).toMatchObject({ category: 'a', value: 200, fill: 1, valueLabel: '200 pts' });
    expect(bars[1]).toMatchObject({ category: 'b', value: 50, fill: 0.25, valueLabel: '50 pts' });
  });

  it('preserves input order', () => {
    const bars = buildCategoryBars(
      [cat({ category: 'z', points: 10 }), cat({ category: 'a', points: 90 })],
      'points',
    );
    expect(bars.map((b) => b.category)).toEqual(['z', 'a']);
  });
});

describe('buildCategoryBars — played', () => {
  it('labels singular vs plural plays', () => {
    const bars = buildCategoryBars(
      [cat({ category: 'a', played: 1 }), cat({ category: 'b', played: 3 })],
      'played',
    );
    expect(bars[0].valueLabel).toBe('1 play');
    expect(bars[1].valueLabel).toBe('3 plays');
  });
});

describe('buildCategoryBars — empty / zero state', () => {
  it('returns [] for no categories', () => {
    expect(buildCategoryBars([], 'points')).toEqual([]);
  });

  it('gives every bar a 0 fill (no divide-by-zero) when all values are 0', () => {
    const bars = buildCategoryBars(
      [cat({ points: 0 }), cat({ category: 'b', points: 0 })],
      'points',
    );
    expect(bars.every((b) => b.fill === 0)).toBe(true);
    expect(bars.every((b) => Number.isFinite(b.fill))).toBe(true);
  });
});

describe('buildPointsDistribution', () => {
  it('computes each category share of total points (sums to ~1)', () => {
    const segs = buildPointsDistribution([
      cat({ category: 'a', points: 75 }),
      cat({ category: 'b', points: 25 }),
    ]);
    expect(segs[0]).toMatchObject({ category: 'a', share: 0.75, sharePercent: '75%' });
    expect(segs[1]).toMatchObject({ category: 'b', share: 0.25, sharePercent: '25%' });
    expect(segs[0].share + segs[1].share).toBeCloseTo(1);
  });

  it('keeps zero-point categories with share 0 (no NaN) and preserves order', () => {
    const segs = buildPointsDistribution([
      cat({ category: 'a', points: 0 }),
      cat({ category: 'b', points: 0 }),
    ]);
    expect(segs.map((s) => s.category)).toEqual(['a', 'b']);
    expect(segs.every((s) => s.share === 0 && Number.isFinite(s.share))).toBe(true);
    expect(segs.every((s) => s.sharePercent === '0%')).toBe(true);
  });

  it('returns [] for no categories', () => {
    expect(buildPointsDistribution([])).toEqual([]);
  });
});
