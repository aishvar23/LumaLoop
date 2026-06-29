/**
 * Tests for the pure daily-streak core. Covers the first play, same-day idempotent
 * replay, next-day increment, gap reset, longest tracking, and the zero-padded
 * local-date formatting.
 */

import { describe, expect, it } from 'vitest';

import {
  INITIAL_STREAK_STATE,
  recordPlay,
  toLocalIsoDate,
  type StreakState,
} from './dailyStreak';

describe('toLocalIsoDate', () => {
  it('formats a local date as zero-padded YYYY-MM-DD', () => {
    // Month + day are single-digit → must zero-pad to two digits.
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
    // Two-day gap (10 → 12) is a miss: restart at 1, keep the all-time best.
    expect(recordPlay(state, '2026-06-12')).toEqual({
      current: 1,
      longest: 4,
      lastPlayedDate: '2026-06-12',
    });
  });

  it('longest tracks the running maximum across days', () => {
    let state = recordPlay(INITIAL_STREAK_STATE, '2026-06-10'); // 1/1
    state = recordPlay(state, '2026-06-11'); // 2/2
    state = recordPlay(state, '2026-06-12'); // 3/3
    expect(state).toEqual({ current: 3, longest: 3, lastPlayedDate: '2026-06-12' });
    // Miss a day → current resets, longest stays at 3.
    state = recordPlay(state, '2026-06-14');
    expect(state).toEqual({ current: 1, longest: 3, lastPlayedDate: '2026-06-14' });
    state = recordPlay(state, '2026-06-15'); // 2/3
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
