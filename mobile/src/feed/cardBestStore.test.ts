/**
 * Tests for the RN per-card personal-best store. Async contract: a fake
 * AsyncStorage exercises read/record, the strictly-greater "new best" rule,
 * non-positive scores never becoming a best, per-card isolation, reset-safety,
 * and never-rejects degradation.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import {
  CARD_BEST_STORAGE_KEY,
  createCardBestStore,
} from './cardBestStore';

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

describe('createCardBestStore (RN)', () => {
  it('reads 0 for an unknown card from an empty store', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await expect(store.readCardBest('c1')).resolves.toBe(0);
  });

  it('reads a previously persisted best', async () => {
    const store = createCardBestStore({
      storage: fakeStorage({
        [CARD_BEST_STORAGE_KEY]: JSON.stringify({ c1: 250 }),
      }),
    });
    await expect(store.readCardBest('c1')).resolves.toBe(250);
  });

  it('records the first positive score as a new best and persists it', async () => {
    const storage = fakeStorage();
    const store = createCardBestStore({ storage });
    await expect(store.recordCardBest('c1', 120)).resolves.toEqual({
      best: 120,
      isNewBest: true,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(120);
    await expect(storage.getItem(CARD_BEST_STORAGE_KEY)).resolves.toBe(
      JSON.stringify({ c1: 120 }),
    );
  });

  it('does NOT count an equal score as a new best', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await store.recordCardBest('c1', 120);
    await expect(store.recordCardBest('c1', 120)).resolves.toEqual({
      best: 120,
      isNewBest: false,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(120);
  });

  it('counts a strictly higher score as a new best and updates the stored value', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await store.recordCardBest('c1', 120);
    await expect(store.recordCardBest('c1', 300)).resolves.toEqual({
      best: 300,
      isNewBest: true,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(300);
  });

  it('does NOT count a lower score as a new best and keeps the stored best', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await store.recordCardBest('c1', 300);
    await expect(store.recordCardBest('c1', 100)).resolves.toEqual({
      best: 300,
      isNewBest: false,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(300);
  });

  it('never lets a non-positive score become a best (0 is not a "best")', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await expect(store.recordCardBest('c1', 0)).resolves.toEqual({
      best: 0,
      isNewBest: false,
    });
    await expect(store.recordCardBest('c1', -50)).resolves.toEqual({
      best: 0,
      isNewBest: false,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(0);
  });

  it('isolates bests between two card ids', async () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    await store.recordCardBest('c1', 120);
    await store.recordCardBest('c2', 400);
    await expect(store.readCardBest('c1')).resolves.toBe(120);
    await expect(store.readCardBest('c2')).resolves.toBe(400);
    await expect(store.recordCardBest('c1', 130)).resolves.toEqual({
      best: 130,
      isNewBest: true,
    });
    await expect(store.readCardBest('c2')).resolves.toBe(400);
  });

  it('ignores a corrupt stored value (reset-safe)', async () => {
    const store = createCardBestStore({
      storage: fakeStorage({ [CARD_BEST_STORAGE_KEY]: 'not-json' }),
    });
    await expect(store.readCardBest('c1')).resolves.toBe(0);
  });

  it('never rejects when storage is unavailable (in-memory fallback)', async () => {
    const store = createCardBestStore({ storage: null });
    await expect(store.readCardBest('c1')).resolves.toBe(0);
    await expect(store.recordCardBest('c1', 120)).resolves.toEqual({
      best: 120,
      isNewBest: true,
    });
    await expect(store.readCardBest('c1')).resolves.toBe(120);
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
    const store = createCardBestStore({ storage: throwing });
    await expect(store.readCardBest('c1')).resolves.toBe(0);
    await expect(store.recordCardBest('c1', 120)).resolves.toEqual({
      best: 120,
      isNewBest: true,
    });
  });
});
