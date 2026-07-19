/**
 * Tests for the daily-streak persistence store. A fake storage exercises the
 * read/record contract, day-by-day folding, idempotent same-day replay, the
 * persisted JSON shape, reset-safety, and never-throws degradation.
 */

import { describe, expect, it } from 'vitest';

import {
  DAILY_STREAK_STORAGE_KEY,
  createStreakStore,
  type ReadWriteStorage,
} from './streakStore';

/** A simple in-memory `Storage`-like fake. */
function fakeStorage(seed: Record<string, string> = {}): ReadWriteStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

/** A fixed clock that returns the given local date. */
function at(year: number, month1to12: number, day: number): () => Date {
  return () => new Date(year, month1to12 - 1, day);
}

describe('createStreakStore', () => {
  it('reads the initial state from an empty store', () => {
    const store = createStreakStore({ storage: fakeStorage() });
    expect(store.readStreak()).toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
  });

  it('reads a previously persisted snapshot', () => {
    const store = createStreakStore({
      storage: fakeStorage({
        [DAILY_STREAK_STORAGE_KEY]: JSON.stringify({
          current: 4,
          longest: 9,
          lastPlayedDate: '2026-06-10',
        }),
      }),
    });
    expect(store.readStreak()).toEqual({
      current: 4,
      longest: 9,
      lastPlayedDate: '2026-06-10',
    });
  });

  it('records the first play as a 1-day streak and persists it', () => {
    const storage = fakeStorage();
    const store = createStreakStore({ storage });
    expect(store.recordPlayToday(at(2026, 6, 10))).toEqual({
      current: 1,
      longest: 1,
      lastPlayedDate: '2026-06-10',
    });
    expect(JSON.parse(storage.getItem(DAILY_STREAK_STORAGE_KEY)!)).toEqual({
      current: 1,
      longest: 1,
      lastPlayedDate: '2026-06-10',
    });
  });

  it('folds consecutive days, no-ops same-day, resets on a gap (longest kept)', () => {
    const store = createStreakStore({ storage: fakeStorage() });
    expect(store.recordPlayToday(at(2026, 6, 10)).current).toBe(1);
    expect(store.recordPlayToday(at(2026, 6, 11)).current).toBe(2);
    // Same day again — unchanged.
    expect(store.recordPlayToday(at(2026, 6, 11)).current).toBe(2);
    expect(store.recordPlayToday(at(2026, 6, 12)).current).toBe(3);
    // Skip the 13th — the 14th restarts at 1 but keeps the all-time best (3).
    const afterGap = store.recordPlayToday(at(2026, 6, 14));
    expect(afterGap).toEqual({ current: 1, longest: 3, lastPlayedDate: '2026-06-14' });
  });

  it('ignores a corrupt stored value (reset-safe)', () => {
    const store = createStreakStore({
      storage: fakeStorage({ [DAILY_STREAK_STORAGE_KEY]: 'not-json' }),
    });
    expect(store.readStreak()).toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
  });

  it('never throws when storage is unavailable (in-memory fallback)', () => {
    const store = createStreakStore({ storage: null });
    expect(store.readStreak()).toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
    expect(store.recordPlayToday(at(2026, 6, 10)).current).toBe(1);
    expect(store.recordPlayToday(at(2026, 6, 11)).current).toBe(2);
  });

  it('never throws when storage access fails', () => {
    const throwing: ReadWriteStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createStreakStore({ storage: throwing });
    expect(store.readStreak().current).toBe(0);
    expect(() => store.recordPlayToday(at(2026, 6, 10))).not.toThrow();
    expect(store.readStreak().current).toBe(1);
  });
});
