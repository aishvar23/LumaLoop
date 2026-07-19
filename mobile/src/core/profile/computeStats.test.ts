// Ported from web `src/profile/computeStats.test.ts`; source of truth is the web
// app — keep in sync (accounts pivot). Mirrors the web test under jest.
import type { GamePlay } from '../auth/types';
import {
  EMPTY_PROFILE_STATS,
  computeStats,
  formatAccuracy,
} from './computeStats';

function play(overrides: Partial<GamePlay>): GamePlay {
  return {
    id: 'p',
    user_id: 'u',
    card_id: 'c',
    template_type: 'spot_it',
    category: 'visual_attention',
    is_correct: true,
    points: 100,
    elapsed_ms: 1000,
    played_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeStats', () => {
  it('returns the empty summary for no plays', () => {
    expect(computeStats([])).toEqual(EMPTY_PROFILE_STATS);
  });

  it('totals games, correctness, accuracy and points', () => {
    const stats = computeStats([
      play({ is_correct: true, points: 100 }),
      play({ is_correct: false, points: 0 }),
      play({ is_correct: true, points: 50 }),
      play({ is_correct: true, points: 75 }),
    ]);
    expect(stats.gamesPlayed).toBe(4);
    expect(stats.correctCount).toBe(3);
    expect(stats.accuracy).toBeCloseTo(0.75);
    expect(stats.totalPoints).toBe(225);
  });

  it('computes the longest consecutive-correct streak in CHRONOLOGICAL order', () => {
    // Rows arrive newest-first; chronological run is: ✓ ✓ ✗ ✓ ✓ ✓ → best 3.
    const stats = computeStats([
      play({ played_at: '2026-01-06T00:00:00Z', is_correct: true }),
      play({ played_at: '2026-01-05T00:00:00Z', is_correct: true }),
      play({ played_at: '2026-01-04T00:00:00Z', is_correct: true }),
      play({ played_at: '2026-01-03T00:00:00Z', is_correct: false }),
      play({ played_at: '2026-01-02T00:00:00Z', is_correct: true }),
      play({ played_at: '2026-01-01T00:00:00Z', is_correct: true }),
    ]);
    expect(stats.bestStreak).toBe(3);
  });

  it('best streak is 0 when nothing was correct', () => {
    const stats = computeStats([
      play({ is_correct: false }),
      play({ is_correct: false }),
    ]);
    expect(stats.bestStreak).toBe(0);
  });

  it('breaks down per category and sorts by games played desc then name asc', () => {
    const stats = computeStats([
      play({ category: 'working_memory', is_correct: true, points: 100 }),
      play({ category: 'working_memory', is_correct: false, points: 0 }),
      play({ category: 'visual_attention', is_correct: true, points: 60 }),
      play({ category: 'visual_attention', is_correct: true, points: 40 }),
      play({ category: 'visual_attention', is_correct: false, points: 0 }),
      play({ category: 'logical_reasoning', is_correct: true, points: 30 }),
    ]);
    expect(stats.categories.map((c) => c.category)).toEqual([
      'visual_attention', // 3 played
      'working_memory', // 2 played
      'logical_reasoning', // 1 played
    ]);
    const visual = stats.categories[0];
    expect(visual).toMatchObject({ played: 3, correct: 2, points: 100 });
    expect(visual.accuracy).toBeCloseTo(2 / 3);
  });

  it('handles equal-timestamp ties by keeping input order (stable streak)', () => {
    const stats = computeStats([
      play({ played_at: '2026-01-01T00:00:00Z', is_correct: true }),
      play({ played_at: '2026-01-01T00:00:00Z', is_correct: true }),
    ]);
    expect(stats.bestStreak).toBe(2);
  });
});

describe('formatAccuracy', () => {
  it('formats a fraction as a whole percent', () => {
    expect(formatAccuracy(0)).toBe('0%');
    expect(formatAccuracy(0.834)).toBe('83%');
    expect(formatAccuracy(1)).toBe('100%');
  });
});
