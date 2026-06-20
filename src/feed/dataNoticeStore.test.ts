import { describe, expect, it } from 'vitest';

import {
  DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY,
  createDataNoticeStore,
  type ReadWriteStorage,
} from './dataNoticeStore';

/** Minimal in-memory `Storage`-like backend for deterministic tests. */
function fakeStorage(seed: Record<string, string> = {}): ReadWriteStorage & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** A storage whose access always throws, to assert the never-throws contract. */
const throwingStorage: ReadWriteStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('createDataNoticeStore', () => {
  it('reports not acknowledged for an empty store', () => {
    const store = createDataNoticeStore({ storage: fakeStorage() });
    expect(store.isAcknowledged()).toBe(false);
  });

  it('reports acknowledged when the flag is already persisted', () => {
    const store = createDataNoticeStore({
      storage: fakeStorage({ [DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY]: '1' }),
    });
    expect(store.isAcknowledged()).toBe(true);
  });

  it('persists acknowledgement so a fresh store over the same storage sees it', () => {
    const storage = fakeStorage();
    const store = createDataNoticeStore({ storage });

    store.acknowledge();

    expect(store.isAcknowledged()).toBe(true);
    expect(storage.map.get(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY)).toBe('1');
    // A brand-new store reading the same backend also sees the acknowledgement.
    expect(createDataNoticeStore({ storage }).isAcknowledged()).toBe(true);
  });

  it('falls back to an in-memory flag when storage is null', () => {
    const store = createDataNoticeStore({ storage: null });
    expect(store.isAcknowledged()).toBe(false);
    store.acknowledge();
    expect(store.isAcknowledged()).toBe(true);
  });

  it('never throws when the storage backend throws (best-effort)', () => {
    const store = createDataNoticeStore({ storage: throwingStorage });
    expect(store.isAcknowledged()).toBe(false);
    expect(() => store.acknowledge()).not.toThrow();
    // The in-memory flag still records the acknowledgement for the page lifetime.
    expect(store.isAcknowledged()).toBe(true);
  });
});
