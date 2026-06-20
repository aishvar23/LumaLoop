/**
 * First-run data-notice acknowledgement store (docs/FEED_DIRECTION.md §3.6,
 * Technical Design §21.8).
 *
 * Persists a single best-effort flag recording that the player has acknowledged
 * the one-time anonymous-data / non-assessment notice, so the notice is shown
 * ONCE (first visit) and never again. Mirrors the wrapped, never-throws pattern
 * of {@link file://./../telemetry/anonymousUser.ts}: every storage access is
 * guarded so a disabled / quota-exceeded / private-mode `localStorage` degrades
 * silently to an in-memory flag that is stable for the page lifetime.
 *
 * NO PII: the only value stored is the literal acknowledgement marker.
 */

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY =
  'lumaloop.dataNoticeAcknowledged';

/** The persisted marker value written on acknowledgement. */
const ACKNOWLEDGED_VALUE = '1';

/** Minimal storage surface this module needs (a subset of the DOM `Storage`). */
export type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Injectable dependencies (for testability — no hidden globals in tests). */
export interface DataNoticeStoreDeps {
  /**
   * Storage backend. `undefined` (the default) resolves to
   * `globalThis.localStorage`; pass `null` to force the in-memory fallback; pass
   * a fake `Storage`-like object in tests.
   */
  storage?: ReadWriteStorage | null;
}

/** A small store gating the one-time first-run notice. */
export interface DataNoticeStore {
  /** True once the player has acknowledged the notice (this device). */
  isAcknowledged(): boolean;
  /** Record acknowledgement (best-effort persisted + in-memory). */
  acknowledge(): void;
}

/** Resolve the default storage, treating any access failure as unavailable. */
function defaultStorage(): ReadWriteStorage | null {
  try {
    // Accessing `localStorage` itself can throw in sandboxed contexts.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read the persisted acknowledgement flag — never throws. */
function readAcknowledged(storage: ReadWriteStorage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Persist the flag best-effort — a storage failure is swallowed, never thrown. */
function persistAcknowledged(storage: ReadWriteStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(DATA_NOTICE_ACKNOWLEDGED_STORAGE_KEY, ACKNOWLEDGED_VALUE);
  } catch {
    // Best-effort: private mode / quota / disabled storage. The in-memory flag
    // in the store keeps the acknowledgement stable for the page lifetime.
  }
}

/**
 * Build a store with its own in-memory flag. Reads the persisted flag lazily on
 * first call and caches it, so the notice stays dismissed for the page lifetime
 * even when storage is unavailable. Tests create isolated stores with a fake
 * storage; production uses {@link defaultStorage}.
 */
export function createDataNoticeStore(
  deps: DataNoticeStoreDeps = {},
): DataNoticeStore {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  let acknowledged = readAcknowledged(storage);

  return {
    isAcknowledged(): boolean {
      return acknowledged;
    },
    acknowledge(): void {
      acknowledged = true;
      persistAcknowledged(storage);
    },
  };
}
