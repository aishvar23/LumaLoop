/**
 * Daily-streak persistence store (engagement — consecutive-days-played counter).
 *
 * Persists the player's {@link StreakState} (current streak, all-time longest,
 * last local play date) across visits, best-effort. Mirrors the wrapped,
 * never-throws pattern of {@link file://./scoreStore.ts}: every storage access is
 * guarded so a disabled / quota-exceeded / private-mode `localStorage` degrades
 * silently to an in-memory value that stays stable for the page lifetime.
 *
 * The streak shape is one JSON object under a single `lumaloop.*` key (the
 * internal key convention shared with `scoreStore`), so a play folds the whole
 * snapshot atomically.
 *
 * GUARDRAIL (Design §7 / §21.8): stores GAME engagement only — "days played in a
 * row". NOT a skill/ability record; never presented as one, no shame framing.
 *
 * NO PII (Technical Design §16): two non-negative integers + one local calendar
 * date. No identifiers, no card history. Reset-safe: clearing storage resets it.
 */

import {
  INITIAL_STREAK_STATE,
  recordPlay,
  toLocalIsoDate,
  type StreakState,
} from './dailyStreak';

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const DAILY_STREAK_STORAGE_KEY = 'lumaloop.dailyStreak';

/** Minimal storage surface this module needs (a subset of the DOM `Storage`). */
export type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Injectable dependencies (for testability — no hidden globals in tests). */
export interface StreakStoreDeps {
  /**
   * Storage backend. `undefined` (the default) resolves to
   * `globalThis.localStorage`; pass `null` to force the in-memory fallback; pass
   * a fake `Storage`-like object in tests.
   */
  storage?: ReadWriteStorage | null;
}

/** A small store persisting the daily streak. */
export interface StreakStore {
  /** Read the persisted streak (cached after first read). Never throws. */
  readStreak(): StreakState;
  /**
   * Fold "played today" into the streak using `now()`'s local date, persist it,
   * and return the new snapshot. Idempotent per local day. Never throws.
   */
  recordPlayToday(now?: () => Date): StreakState;
}

/** Resolve the default storage, treating any access failure as unavailable. */
function defaultStorage(): ReadWriteStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A non-negative integer, or 0 when the value isn't one. */
function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Parse the stored JSON snapshot; anything invalid reads as the initial state. */
function readState(storage: ReadWriteStorage | null): StreakState {
  if (!storage) return { ...INITIAL_STREAK_STATE };
  try {
    const raw = storage.getItem(DAILY_STREAK_STORAGE_KEY);
    if (raw === null) return { ...INITIAL_STREAK_STATE };
    const parsed = JSON.parse(raw) as Partial<StreakState>;
    const lastPlayedDate =
      typeof parsed.lastPlayedDate === 'string' ? parsed.lastPlayedDate : null;
    return {
      current: safeCount(parsed.current),
      longest: safeCount(parsed.longest),
      lastPlayedDate,
    };
  } catch {
    return { ...INITIAL_STREAK_STATE };
  }
}

/** Persist the snapshot best-effort — a storage failure is swallowed, not thrown. */
function writeState(storage: ReadWriteStorage | null, state: StreakState): void {
  if (!storage) return;
  try {
    storage.setItem(DAILY_STREAK_STORAGE_KEY, JSON.stringify(state));
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
export function createStreakStore(deps: StreakStoreDeps = {}): StreakStore {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  let cache: StreakState = readState(storage);

  return {
    readStreak(): StreakState {
      return cache;
    },
    recordPlayToday(now: () => Date = () => new Date()): StreakState {
      cache = recordPlay(cache, toLocalIsoDate(now()));
      writeState(storage, cache);
      return cache;
    },
  };
}

/** The process-wide default store (real `localStorage`), shared by the helpers. */
const defaultStore = createStreakStore();

/** Read the persisted streak from the default store. Never throws. */
export function readStreak(): StreakState {
  return defaultStore.readStreak();
}

/**
 * Record a play today against the default store and return the new streak.
 * Idempotent per local day; best-effort (never throws).
 */
export function recordPlayToday(now: () => Date = () => new Date()): StreakState {
  return defaultStore.recordPlayToday(now);
}
