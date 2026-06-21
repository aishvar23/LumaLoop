/**
 * Tests for the RN best-run persistence store (Phase 4). Async contract: a fake
 * AsyncStorage exercises read/record, the never-lower best run, the cumulative
 * total, and never-rejects degradation when storage is unavailable / failing.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import {
  BEST_RUN_STORAGE_KEY,
  TOTAL_POINTS_STORAGE_KEY,
  createScoreStore,
} from './scoreStore';

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

describe('createScoreStore (RN)', () => {
  it('reads zeros from an empty store', async () => {
    const store = createScoreStore({ storage: fakeStorage() });
    await expect(store.read()).resolves.toEqual({ bestRun: 0, totalPoints: 0 });
  });

  it('reads a previously persisted snapshot', async () => {
    const store = createScoreStore({
      storage: fakeStorage({
        [BEST_RUN_STORAGE_KEY]: '7',
        [TOTAL_POINTS_STORAGE_KEY]: '1234',
      }),
    });
    await expect(store.read()).resolves.toEqual({ bestRun: 7, totalPoints: 1234 });
  });

  it('raises the best run but never lowers it, and accumulates total points', async () => {
    const storage = fakeStorage();
    const store = createScoreStore({ storage });
    await expect(store.record(3, 500)).resolves.toEqual({
      bestRun: 3,
      totalPoints: 500,
    });
    await expect(store.record(2, 200)).resolves.toEqual({
      bestRun: 3,
      totalPoints: 700,
    });
    await expect(store.record(5, 100)).resolves.toEqual({
      bestRun: 5,
      totalPoints: 800,
    });
    await expect(storage.getItem(BEST_RUN_STORAGE_KEY)).resolves.toBe('5');
    await expect(storage.getItem(TOTAL_POINTS_STORAGE_KEY)).resolves.toBe('800');
  });

  it('ignores invalid stored values (reset-safe)', async () => {
    const store = createScoreStore({
      storage: fakeStorage({
        [BEST_RUN_STORAGE_KEY]: 'nope',
        [TOTAL_POINTS_STORAGE_KEY]: '-9',
      }),
    });
    await expect(store.read()).resolves.toEqual({ bestRun: 0, totalPoints: 0 });
  });

  it('never rejects when storage is unavailable (in-memory fallback)', async () => {
    const store = createScoreStore({ storage: null });
    await expect(store.read()).resolves.toEqual({ bestRun: 0, totalPoints: 0 });
    await expect(store.record(4, 400)).resolves.toEqual({
      bestRun: 4,
      totalPoints: 400,
    });
    await expect(store.read()).resolves.toEqual({ bestRun: 4, totalPoints: 400 });
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
    const store = createScoreStore({ storage: throwing });
    await expect(store.read()).resolves.toEqual({ bestRun: 0, totalPoints: 0 });
    await expect(store.record(2, 50)).resolves.toEqual({
      bestRun: 2,
      totalPoints: 50,
    });
  });
});
