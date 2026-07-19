// Ported from web `src/feed/dailyStreak.test.ts`; source of truth is the web app —
// keep in sync. Uses Jest globals (no vitest import) to match the mobile suite.
/**
 * Tests for the pure daily-streak core. Covers the first play, same-day idempotent
 * replay, next-day increment, gap reset, longest tracking, and the zero-padded
 * local-date formatting.
 */

import {
  INITIAL_STREAK_STATE,
  recordPlay,
  toLocalIsoDate,
  type StreakState,
} from './dailyStreak';

describe('toLocalIsoDate', () => {
  it('formats a local date as zero-padded YYYY-MM-DD', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('recordPlay', () => {
  it('first ever play sets current and longest to 1', () => {
    const next = recordPlay(INITIAL_STREAK_STATE, '2026-06-10');
    expect(next).toEqual({ current: 1, longest: 1, lastPlayedDate: '2026-06-10' });
  });

  it('same-day replay leaves the state unchanged (idempotent)', () => {
    const state: StreakState = { current: 3, longest: 5, lastPlayedDate: '2026-06-10' };
    expect(recordPlay(state, '2026-06-10')).toBe(state);
  });

  it('next-day play increments the current streak', () => {
    const state: StreakState = { current: 1, longest: 1, lastPlayedDate: '2026-06-10' };
    expect(recordPlay(state, '2026-06-11')).toEqual({
      current: 2,
      longest: 2,
      lastPlayedDate: '2026-06-11',
    });
  });

  it('a skipped day resets current to 1 but preserves longest', () => {
    const state: StreakState = { current: 4, longest: 4, lastPlayedDate: '2026-06-10' };
    expect(recordPlay(state, '2026-06-12')).toEqual({
      current: 1,
      longest: 4,
      lastPlayedDate: '2026-06-12',
    });
  });

  it('longest tracks the running maximum across days', () => {
    let state = recordPlay(INITIAL_STREAK_STATE, '2026-06-10');
    state = recordPlay(state, '2026-06-11');
    state = recordPlay(state, '2026-06-12');
    expect(state).toEqual({ current: 3, longest: 3, lastPlayedDate: '2026-06-12' });
    state = recordPlay(state, '2026-06-14');
    expect(state).toEqual({ current: 1, longest: 3, lastPlayedDate: '2026-06-14' });
    state = recordPlay(state, '2026-06-15');
    expect(state).toEqual({ current: 2, longest: 3, lastPlayedDate: '2026-06-15' });
  });

  it('crosses month and year boundaries as exactly one day', () => {
    const endOfMonth: StreakState = {
      current: 2,
      longest: 2,
      lastPlayedDate: '2026-06-30',
    };
    expect(recordPlay(endOfMonth, '2026-07-01').current).toBe(3);
    const endOfYear: StreakState = {
      current: 5,
      longest: 5,
      lastPlayedDate: '2026-12-31',
    };
    expect(recordPlay(endOfYear, '2027-01-01').current).toBe(6);
  });
});
