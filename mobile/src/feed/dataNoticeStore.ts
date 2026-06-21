/**
 * First-run data-notice acknowledgement store for React Native (ADO #130, M6;
 * docs/FEED_DIRECTION.md §3.6, Technical Design §21.8).
 *
 * The RN counterpart of the web `src/feed/dataNoticeStore.ts`. Same contract — a
 * single best-effort flag recording that the player acknowledged the one-time
 * anonymous-data / non-assessment notice, so the notice shows ONCE (first launch)
 * and never again — but rebuilt for RN: the web store read the SYNCHRONOUS
 * `localStorage`, while React Native persists through
 * `@react-native-async-storage/async-storage`, whose API is PROMISE-based. So the
 * read/write API here is ASYNC, reusing the shared
 * {@link ../telemetry/storage | AsyncReadWriteStorage} seam from M5.
 *
 * BEST-EFFORT by design (Technical Design §10): every storage access is wrapped so
 * a disabled / failed native store never throws. An in-memory flag keeps the
 * acknowledgement stable for the process lifetime even when persistence is
 * unavailable, and short-circuits redundant reads after the first resolution.
 *
 * NO PII (Technical Design §16): the only value stored is the literal marker.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import { defaultAsyncStorage } from '../telemetry/storage';

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY =
  'lumaloop.dataNoticeAcknowledged';

/** The persisted marker value written on acknowledgement. */
const ACKNOWLEDGED_VALUE = '1';

/** Injectable dependencies (for testability — no native module in tests). */
export interface DataNoticeStoreDeps {
  /**
   * Async storage backend. `undefined` (the default) resolves to
   * {@link defaultAsyncStorage}; pass `null` to force the in-memory fallback;
   * pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
}

/** A small store gating the one-time first-run notice. */
export interface DataNoticeStore {
  /**
   * Resolve whether the player has acknowledged the notice (this device). Reads
   * persistence on the first call, then serves the cached flag. Never rejects.
   */
  isAcknowledged(): Promise<boolean>;
  /** Record acknowledgement (best-effort persisted + in-memory). Never rejects. */
  acknowledge(): Promise<void>;
}

/**
 * Build a store with its own in-memory flag. The first {@link
 * DataNoticeStore.isAcknowledged} reads the persisted marker and caches the
 * result; once acknowledged (here or in a prior launch) the flag stays true for
 * the process lifetime, so the notice stays dismissed even if persistence later
 * fails. Tests create isolated stores with a fake storage; production uses
 * {@link defaultAsyncStorage}.
 */
export function createDataNoticeStore(
  deps: DataNoticeStoreDeps = {},
): DataNoticeStore {
  const storage =
    deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  // In-memory cache: once we know the player acknowledged, never re-read storage.
  let acknowledged = false;

  return {
    async isAcknowledged(): Promise<boolean> {
      if (acknowledged) return true;
      if (!storage) return false;
      try {
        const raw = await storage.getItem(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY);
        acknowledged = raw !== null;
        return acknowledged;
      } catch {
        // Best-effort: an unreadable store reads as not-yet-acknowledged.
        return false;
      }
    },
    async acknowledge(): Promise<void> {
      // Set the in-memory flag first so the notice never reappears this launch
      // even if the persistent write below fails.
      acknowledged = true;
      if (!storage) return;
      try {
        await storage.setItem(
          DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY,
          ACKNOWLEDGED_VALUE,
        );
      } catch {
        // Best-effort: private mode / quota / disabled storage. The in-memory
        // flag keeps the acknowledgement stable for the process lifetime.
      }
    },
  };
}
