/**
 * Daily-streak persistence store for React Native (engagement — consecutive-days-
 * played counter). The RN counterpart of web `src/feed/streakStore.ts` — same
 * contract (persist the {@link StreakState}) — but rebuilt for RN: the web store
 * reads the SYNCHRONOUS `localStorage`; React Native persists through
 * `@react-native-async-storage/async-storage`, whose API is PROMISE-based, so the
 * read/record API here is ASYNC, reusing the shared {@link AsyncReadWriteStorage}
 * seam (mirrors `scoreStore.ts`).
 *
 * GUARDRAIL (Design §7 / §21.8): stores GAME engagement only — "days played in a
 * row". NOT a skill/ability record; never presented as one, no shame framing.
 *
 * BEST-EFFORT (Technical Design §10): every access is wrapped so a disabled /
 * failed native store never rejects; an in-memory cache keeps the snapshot stable
 * for the process lifetime. NO PII (Technical Design §16): two non-negative
 * integers + one local calendar date. Reset-safe: clearing storage resets it.
 */

import {
  INITIAL_STREAK_STATE,
  recordPlay,
  toLocalIsoDate,
  type StreakState,
} from '../core/feed/dailyStreak';
import type { AsyncReadWriteStorage } from '../telemetry/storage';
import { defaultAsyncStorage } from '../telemetry/storage';

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const DAILY_STREAK_STORAGE_KEY = 'lumaloop.dailyStreak';

/** Injectable dependencies (for testability — no native module in tests). */
export interface StreakStoreDeps {
  /**
   * Async storage backend. `undefined` (the default) resolves to
   * {@link defaultAsyncStorage}; pass `null` to force the in-memory fallback;
   * pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
}

/** A small store persisting the daily streak. */
export interface StreakStore {
  /** Resolve the persisted streak (cached after the first read). Never rejects. */
  readStreak(): Promise<StreakState>;
  /**
   * Fold "played today" into the streak using `now()`'s local date, persist it,
   * and return the new snapshot. Idempotent per local day. Never rejects.
   */
  recordPlayToday(now?: () => Date): Promise<StreakState>;
}

/** A non-negative integer, or 0 when the value isn't one. */
function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Parse the stored JSON snapshot; anything invalid reads as the initial state. */
function parseState(raw: string | null): StreakState {
  if (raw === null) return { ...INITIAL_STREAK_STATE };
  try {
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

/**
 * Build a store with its own in-memory cache. The first {@link StreakStore.readStreak}
 * reads persistence and caches it; once read (or recorded) the snapshot stays
 * stable for the process lifetime even if persistence later fails. Tests inject a
 * fake storage; production uses {@link defaultAsyncStorage}.
 */
export function createStreakStore(deps: StreakStoreDeps = {}): StreakStore {
  const storage =
    deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  let cache: StreakState | null = null;

  async function loadCache(): Promise<StreakState> {
    if (cache) return cache;
    if (!storage) {
      cache = { ...INITIAL_STREAK_STATE };
      return cache;
    }
    try {
      cache = parseState(await storage.getItem(DAILY_STREAK_STORAGE_KEY));
    } catch {
      cache = { ...INITIAL_STREAK_STATE };
    }
    return cache;
  }

  return {
    async readStreak(): Promise<StreakState> {
      return loadCache();
    },
    async recordPlayToday(
      now: () => Date = () => new Date(),
    ): Promise<StreakState> {
      const current = await loadCache();
      cache = recordPlay(current, toLocalIsoDate(now()));
      if (storage) {
        try {
          await storage.setItem(DAILY_STREAK_STORAGE_KEY, JSON.stringify(cache));
        } catch {
          // Best-effort: the in-memory cache keeps the value stable this launch.
        }
      }
      return cache;
    },
  };
}

/** The process-wide default store (real AsyncStorage), shared by the helpers. */
const defaultStore = createStreakStore();

/** Read the persisted streak from the default store. Never rejects. */
export function readStreak(): Promise<StreakState> {
  return defaultStore.readStreak();
}

/**
 * Record a play today against the default store and return the new streak.
 * Idempotent per local day; best-effort (never rejects).
 */
export function recordPlayToday(now: () => Date = () => new Date()): Promise<StreakState> {
  return defaultStore.recordPlayToday(now);
}
