/**
 * Best-run persistence store (Phase 4 — GAME POINTS).
 *
 * Persists the player's all-time BEST RUN (longest streak) and CUMULATIVE total
 * points across feed visits, best-effort. Mirrors the wrapped, never-throws
 * pattern of {@link file://./dataNoticeStore.ts} / `anonymousUser.ts`: every
 * storage access is guarded so a disabled / quota-exceeded / private-mode
 * `localStorage` degrades silently to an in-memory value that is stable for the
 * page lifetime.
 *
 * GUARDRAIL (Design §7/§21.8): this stores GAME progress only — "best run" and
 * "points". It is NOT a skill/ability record and must never be presented as one.
 *
 * NO PII (Technical Design §16): the only values stored are two non-negative
 * integers (a streak length and a point total). No identifiers, no card history.
 * Reset-safe: clearing storage simply resets the best run to zero.
 */

/** Namespaced, stable storage keys. Exported so tests can pre-seed a fake store. */
export const BEST_RUN_STORAGE_KEY = 'lumaloop.bestRun';
export const TOTAL_POINTS_STORAGE_KEY = 'lumaloop.totalPoints';

/** Minimal storage surface this module needs (a subset of the DOM `Storage`). */
export type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The persisted, all-time game-points snapshot. */
export type PersistedScore = {
  /** All-time best run (longest streak ever reached on this device). */
  bestRun: number;
  /** Cumulative points earned across all feed visits on this device. */
  totalPoints: number;
};

/** A zeroed snapshot — also the fallback when storage is empty/unavailable. */
export const EMPTY_PERSISTED_SCORE: PersistedScore = {
  bestRun: 0,
  totalPoints: 0,
};

/** Injectable dependencies (for testability — no hidden globals in tests). */
export interface ScoreStoreDeps {
  /**
   * Storage backend. `undefined` (the default) resolves to
   * `globalThis.localStorage`; pass `null` to force the in-memory fallback; pass
   * a fake `Storage`-like object in tests.
   */
  storage?: ReadWriteStorage | null;
}

/** A small store persisting the all-time best run + cumulative points. */
export interface ScoreStore {
  /** Read the persisted snapshot (cached after first read). Never throws. */
  read(): PersistedScore;
  /**
   * Record a finished feed visit: best run is RAISED to the visit's best streak
   * (never lowered), and the visit's points are ADDED to the cumulative total.
   * Returns the new persisted snapshot. Never throws.
   */
  record(visitBestStreak: number, visitPoints: number): PersistedScore;
}

/** Resolve the default storage, treating any access failure as unavailable. */
function defaultStorage(): ReadWriteStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Parse a stored non-negative integer; anything invalid reads as 0. */
function readInt(storage: ReadWriteStorage | null, key: string): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Persist an integer best-effort — a storage failure is swallowed, never thrown. */
function writeInt(
  storage: ReadWriteStorage | null,
  key: string,
  value: number,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // Best-effort: private mode / quota / disabled storage. The in-memory cache
    // keeps the value stable for the page lifetime.
  }
}

/**
 * Build a store with its own in-memory cache. Reads persistence lazily on the
 * first call and caches it, so the snapshot stays stable for the page lifetime
 * even when storage is unavailable. Tests create isolated stores with a fake
 * storage; production uses {@link defaultStorage}.
 */
export function createScoreStore(deps: ScoreStoreDeps = {}): ScoreStore {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  let cache: PersistedScore = {
    bestRun: readInt(storage, BEST_RUN_STORAGE_KEY),
    totalPoints: readInt(storage, TOTAL_POINTS_STORAGE_KEY),
  };

  return {
    read(): PersistedScore {
      return cache;
    },
    record(visitBestStreak: number, visitPoints: number): PersistedScore {
      const bestRun = Math.max(cache.bestRun, Math.max(0, visitBestStreak));
      const totalPoints = cache.totalPoints + Math.max(0, visitPoints);
      cache = { bestRun, totalPoints };
      writeInt(storage, BEST_RUN_STORAGE_KEY, bestRun);
      writeInt(storage, TOTAL_POINTS_STORAGE_KEY, totalPoints);
      return cache;
    },
  };
}
