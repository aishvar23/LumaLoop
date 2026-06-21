/**
 * Tests for the best-run persistence store (Phase 4). A fake storage exercises
 * the read/record contract, the never-lower best run, the cumulative total, and
 * the never-throws degradation when storage is unavailable / failing.
 */

import { describe, expect, it } from 'vitest';

import {
  BEST_RUN_STORAGE_KEY,
  TOTAL_POINTS_STORAGE_KEY,
  createScoreStore,
  type ReadWriteStorage,
} from './scoreStore';

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

describe('createScoreStore', () => {
  it('reads zeros from an empty store', () => {
    const store = createScoreStore({ storage: fakeStorage() });
    expect(store.read()).toEqual({ bestRun: 0, totalPoints: 0 });
  });

  it('reads a previously persisted snapshot', () => {
    const store = createScoreStore({
      storage: fakeStorage({
        [BEST_RUN_STORAGE_KEY]: '7',
        [TOTAL_POINTS_STORAGE_KEY]: '1234',
      }),
    });
    expect(store.read()).toEqual({ bestRun: 7, totalPoints: 1234 });
  });

  it('raises the best run but never lowers it, and accumulates total points', () => {
    const storage = fakeStorage();
    const store = createScoreStore({ storage });
    expect(store.record(3, 500)).toEqual({ bestRun: 3, totalPoints: 500 });
    // A worse run does not lower the best, but its points still add up.
    expect(store.record(2, 200)).toEqual({ bestRun: 3, totalPoints: 700 });
    // A better run raises the best.
    expect(store.record(5, 100)).toEqual({ bestRun: 5, totalPoints: 800 });
    // Persisted through to storage.
    expect(storage.getItem(BEST_RUN_STORAGE_KEY)).toBe('5');
    expect(storage.getItem(TOTAL_POINTS_STORAGE_KEY)).toBe('800');
  });

  it('ignores invalid stored values (reset-safe)', () => {
    const store = createScoreStore({
      storage: fakeStorage({
        [BEST_RUN_STORAGE_KEY]: 'not-a-number',
        [TOTAL_POINTS_STORAGE_KEY]: '-9',
      }),
    });
    expect(store.read()).toEqual({ bestRun: 0, totalPoints: 0 });
  });

  it('clamps negative inputs to zero on record', () => {
    const store = createScoreStore({ storage: fakeStorage() });
    expect(store.record(-5, -100)).toEqual({ bestRun: 0, totalPoints: 0 });
  });

  it('never throws when storage is unavailable (in-memory fallback)', () => {
    const store = createScoreStore({ storage: null });
    expect(store.read()).toEqual({ bestRun: 0, totalPoints: 0 });
    expect(store.record(4, 400)).toEqual({ bestRun: 4, totalPoints: 400 });
    // Stable for the lifetime even without persistence.
    expect(store.read()).toEqual({ bestRun: 4, totalPoints: 400 });
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
    const store = createScoreStore({ storage: throwing });
    expect(store.read()).toEqual({ bestRun: 0, totalPoints: 0 });
    expect(() => store.record(2, 50)).not.toThrow();
    expect(store.read()).toEqual({ bestRun: 2, totalPoints: 50 });
  });
});
