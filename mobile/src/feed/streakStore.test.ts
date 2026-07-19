/**
 * Tests for the RN daily-streak persistence store. Async contract: a fake
 * AsyncStorage exercises read/record, day-by-day folding, idempotent same-day
 * replay, reset-safety, and never-rejects degradation.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import {
  DAILY_STREAK_STORAGE_KEY,
  createStreakStore,
} from './streakStore';

/** A simple in-memory async `Storage`-like fake. */
function fakeStorage(seed: Record<string, string> = {}): AsyncReadWriteStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
  };
}

/** A fixed clock that returns the given local date. */
function at(year: number, month1to12: number, day: number): () => Date {
  return () => new Date(year, month1to12 - 1, day);
}

describe('createStreakStore (RN)', () => {
  it('reads the initial state from an empty store', async () => {
    const store = createStreakStore({ storage: fakeStorage() });
    await expect(store.readStreak()).resolves.toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
  });

  it('reads a previously persisted snapshot', async () => {
    const store = createStreakStore({
      storage: fakeStorage({
        [DAILY_STREAK_STORAGE_KEY]: JSON.stringify({
          current: 4,
          longest: 9,
          lastPlayedDate: '2026-06-10',
        }),
      }),
    });
    await expect(store.readStreak()).resolves.toEqual({
      current: 4,
      longest: 9,
      lastPlayedDate: '2026-06-10',
    });
  });

  it('records the first play as a 1-day streak and persists it', async () => {
    const storage = fakeStorage();
    const store = createStreakStore({ storage });
    await expect(store.recordPlayToday(at(2026, 6, 10))).resolves.toEqual({
      current: 1,
      longest: 1,
      lastPlayedDate: '2026-06-10',
    });
    await expect(storage.getItem(DAILY_STREAK_STORAGE_KEY)).resolves.toBe(
      JSON.stringify({ current: 1, longest: 1, lastPlayedDate: '2026-06-10' }),
    );
  });

  it('folds consecutive days, no-ops same-day, resets on a gap (longest kept)', async () => {
    const store = createStreakStore({ storage: fakeStorage() });
    expect((await store.recordPlayToday(at(2026, 6, 10))).current).toBe(1);
    expect((await store.recordPlayToday(at(2026, 6, 11))).current).toBe(2);
    expect((await store.recordPlayToday(at(2026, 6, 11))).current).toBe(2);
    expect((await store.recordPlayToday(at(2026, 6, 12))).current).toBe(3);
    await expect(store.recordPlayToday(at(2026, 6, 14))).resolves.toEqual({
      current: 1,
      longest: 3,
      lastPlayedDate: '2026-06-14',
    });
  });

  it('ignores a corrupt stored value (reset-safe)', async () => {
    const store = createStreakStore({
      storage: fakeStorage({ [DAILY_STREAK_STORAGE_KEY]: 'not-json' }),
    });
    await expect(store.readStreak()).resolves.toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
  });

  it('never rejects when storage is unavailable (in-memory fallback)', async () => {
    const store = createStreakStore({ storage: null });
    await expect(store.readStreak()).resolves.toEqual({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });
    expect((await store.recordPlayToday(at(2026, 6, 10))).current).toBe(1);
    expect((await store.recordPlayToday(at(2026, 6, 11))).current).toBe(2);
  });

  it('never rejects when storage access fails', async () => {
    const throwing: AsyncReadWriteStorage = {
      getItem: async () => {
        throw new Error('blocked');
      },
      setItem: async () => {
        throw new Error('blocked');
      },
    };
    const store = createStreakStore({ storage: throwing });
    expect((await store.readStreak()).current).toBe(0);
    expect((await store.recordPlayToday(at(2026, 6, 10))).current).toBe(1);
  });
});
