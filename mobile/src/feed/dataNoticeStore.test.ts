/**
 * Tests for the RN first-run data-notice store (ADO #130, M6). Against an
 * in-memory async storage: first-run reads false, acknowledge persists + caches,
 * a fresh store over the same storage reads acknowledged, and storage failures
 * are non-throwing (best-effort).
 */
import {
  DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY,
  createDataNoticeStore,
} from './dataNoticeStore';
import type { AsyncReadWriteStorage } from '../telemetry/storage';

function makeStorage(seed: Record<string, string> = {}): AsyncReadWriteStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

describe('dataNoticeStore (RN)', () => {
  it('reads not-acknowledged on first run (empty storage)', async () => {
    const store = createDataNoticeStore({ storage: makeStorage() });
    expect(await store.isAcknowledged()).toBe(false);
  });

  it('acknowledge() persists the marker and caches the flag', async () => {
    const storage = makeStorage();
    const store = createDataNoticeStore({ storage });

    await store.acknowledge();

    expect(storage.map.get(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY)).toBe('1');
    expect(await store.isAcknowledged()).toBe(true);
  });

  it('a fresh store over the same storage reads acknowledged (relaunch)', async () => {
    const storage = makeStorage();
    await createDataNoticeStore({ storage }).acknowledge();

    // Simulate a relaunch: a brand new store instance over the persisted storage.
    const reloaded = createDataNoticeStore({ storage });
    expect(await reloaded.isAcknowledged()).toBe(true);
  });

  it('reads acknowledged when storage is pre-seeded', async () => {
    const storage = makeStorage({
      [DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY]: '1',
    });
    const store = createDataNoticeStore({ storage });
    expect(await store.isAcknowledged()).toBe(true);
  });

  it('falls back to not-acknowledged with storage disabled (null), never throws', async () => {
    const store = createDataNoticeStore({ storage: null });
    expect(await store.isAcknowledged()).toBe(false);
    await expect(store.acknowledge()).resolves.toBeUndefined();
    // The in-memory flag still latches the acknowledgement for this process.
    expect(await store.isAcknowledged()).toBe(true);
  });

  it('is non-throwing when storage access fails (best-effort)', async () => {
    const throwingStorage: AsyncReadWriteStorage = {
      async getItem() {
        throw new Error('read failed');
      },
      async setItem() {
        throw new Error('write failed');
      },
    };
    const store = createDataNoticeStore({ storage: throwingStorage });

    await expect(store.isAcknowledged()).resolves.toBe(false);
    await expect(store.acknowledge()).resolves.toBeUndefined();
    // After acknowledge the in-memory flag short-circuits the failing read.
    await expect(store.isAcknowledged()).resolves.toBe(true);
  });
});
