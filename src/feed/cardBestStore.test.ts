/**
 * Tests for the per-card personal-best store. A fake storage exercises the
 * read/record contract, the strictly-greater "new best" rule, non-positive
 * scores never becoming a best, per-card isolation, the persisted JSON shape,
 * reset-safety, and never-throws degradation.
 */

import { describe, expect, it } from 'vitest';

import {
  CARD_BEST_STORAGE_KEY,
  createCardBestStore,
  type ReadWriteStorage,
} from './cardBestStore';

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

describe('createCardBestStore', () => {
  it('reads 0 for an unknown card from an empty store', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    expect(store.readCardBest('c1')).toBe(0);
  });

  it('reads a previously persisted best', () => {
    const store = createCardBestStore({
      storage: fakeStorage({
        [CARD_BEST_STORAGE_KEY]: JSON.stringify({ c1: 250 }),
      }),
    });
    expect(store.readCardBest('c1')).toBe(250);
  });

  it('records the first positive score as a new best and persists it', () => {
    const storage = fakeStorage();
    const store = createCardBestStore({ storage });
    expect(store.recordCardBest('c1', 120)).toEqual({ best: 120, isNewBest: true });
    expect(store.readCardBest('c1')).toBe(120);
    expect(JSON.parse(storage.getItem(CARD_BEST_STORAGE_KEY)!)).toEqual({ c1: 120 });
  });

  it('does NOT count an equal score as a new best', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    store.recordCardBest('c1', 120);
    expect(store.recordCardBest('c1', 120)).toEqual({ best: 120, isNewBest: false });
    expect(store.readCardBest('c1')).toBe(120);
  });

  it('counts a strictly higher score as a new best and updates the stored value', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    store.recordCardBest('c1', 120);
    expect(store.recordCardBest('c1', 300)).toEqual({ best: 300, isNewBest: true });
    expect(store.readCardBest('c1')).toBe(300);
  });

  it('does NOT count a lower score as a new best and keeps the stored best', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    store.recordCardBest('c1', 300);
    expect(store.recordCardBest('c1', 100)).toEqual({ best: 300, isNewBest: false });
    expect(store.readCardBest('c1')).toBe(300);
  });

  it('never lets a non-positive score become a best (0 is not a "best")', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    expect(store.recordCardBest('c1', 0)).toEqual({ best: 0, isNewBest: false });
    expect(store.recordCardBest('c1', -50)).toEqual({ best: 0, isNewBest: false });
    expect(store.readCardBest('c1')).toBe(0);
  });

  it('isolates bests between two card ids', () => {
    const store = createCardBestStore({ storage: fakeStorage() });
    store.recordCardBest('c1', 120);
    store.recordCardBest('c2', 400);
    expect(store.readCardBest('c1')).toBe(120);
    expect(store.readCardBest('c2')).toBe(400);
    // A new best on one card does not touch the other.
    expect(store.recordCardBest('c1', 130)).toEqual({ best: 130, isNewBest: true });
    expect(store.readCardBest('c2')).toBe(400);
  });

  it('ignores a corrupt stored value (reset-safe)', () => {
    const store = createCardBestStore({
      storage: fakeStorage({ [CARD_BEST_STORAGE_KEY]: 'not-json' }),
    });
    expect(store.readCardBest('c1')).toBe(0);
  });

  it('never throws when storage is unavailable (in-memory fallback)', () => {
    const store = createCardBestStore({ storage: null });
    expect(store.readCardBest('c1')).toBe(0);
    expect(store.recordCardBest('c1', 120)).toEqual({ best: 120, isNewBest: true });
    expect(store.readCardBest('c1')).toBe(120);
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
    const store = createCardBestStore({ storage: throwing });
    expect(store.readCardBest('c1')).toBe(0);
    expect(() => store.recordCardBest('c1', 120)).not.toThrow();
    expect(store.readCardBest('c1')).toBe(120);
  });
});
