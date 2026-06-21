/**
 * Best-run persistence store for React Native (Phase 4 — GAME POINTS). The RN
 * counterpart of web `src/feed/scoreStore.ts` — same contract (persist the all-
 * time best run + cumulative total) — but rebuilt for RN: the web store reads the
 * SYNCHRONOUS `localStorage`; React Native persists through
 * `@react-native-async-storage/async-storage`, whose API is PROMISE-based, so the
 * read/record API here is ASYNC, reusing the shared {@link AsyncReadWriteStorage}
 * seam (mirrors `dataNoticeStore.ts`).
 *
 * GUARDRAIL (Design §7/§21.8): stores GAME progress only — "best run" and
 * "points". NOT a skill/ability record; never presented as one.
 *
 * BEST-EFFORT (Technical Design §10): every access is wrapped so a disabled /
 * failed native store never throws; an in-memory cache keeps the snapshot stable
 * for the process lifetime. NO PII (Technical Design §16): two non-negative
 * integers only. Reset-safe: clearing storage resets the best run to zero.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import { defaultAsyncStorage } from '../telemetry/storage';

/** Namespaced, stable storage keys. Exported so tests can pre-seed a fake store. */
export const BEST_RUN_STORAGE_KEY = 'lumaloop.bestRun';
export const TOTAL_POINTS_STORAGE_KEY = 'lumaloop.totalPoints';

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

/** Injectable dependencies (for testability — no native module in tests). */
export interface ScoreStoreDeps {
  /**
   * Async storage backend. `undefined` (the default) resolves to
   * {@link defaultAsyncStorage}; pass `null` to force the in-memory fallback;
   * pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
}

/** A small store persisting the all-time best run + cumulative points. */
export interface ScoreStore {
  /** Resolve the persisted snapshot (cached after the first read). Never rejects. */
  read(): Promise<PersistedScore>;
  /**
   * Record a finished feed visit: best run is RAISED to the visit's best streak
   * (never lowered), and the visit's points are ADDED to the cumulative total.
   * Returns the new snapshot. Never rejects.
   */
  record(visitBestStreak: number, visitPoints: number): Promise<PersistedScore>;
}

/** Parse a stored non-negative integer; anything invalid reads as 0. */
function parseInt0(raw: string | null): number {
  if (raw === null) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Build a store with its own in-memory cache. The first {@link ScoreStore.read}
 * reads persistence and caches it; once read (or recorded) the snapshot stays
 * stable for the process lifetime even if persistence later fails. Tests inject a
 * fake storage; production uses {@link defaultAsyncStorage}.
 */
export function createScoreStore(deps: ScoreStoreDeps = {}): ScoreStore {
  const storage =
    deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  let cache: PersistedScore | null = null;

  async function loadCache(): Promise<PersistedScore> {
    if (cache) return cache;
    if (!storage) {
      cache = { ...EMPTY_PERSISTED_SCORE };
      return cache;
    }
    try {
      const [best, total] = await Promise.all([
        storage.getItem(BEST_RUN_STORAGE_KEY),
        storage.getItem(TOTAL_POINTS_STORAGE_KEY),
      ]);
      cache = { bestRun: parseInt0(best), totalPoints: parseInt0(total) };
    } catch {
      cache = { ...EMPTY_PERSISTED_SCORE };
    }
    return cache;
  }

  return {
    async read(): Promise<PersistedScore> {
      return loadCache();
    },
    async record(
      visitBestStreak: number,
      visitPoints: number,
    ): Promise<PersistedScore> {
      const current = await loadCache();
      const bestRun = Math.max(current.bestRun, Math.max(0, visitBestStreak));
      const totalPoints = current.totalPoints + Math.max(0, visitPoints);
      cache = { bestRun, totalPoints };
      if (storage) {
        try {
          await Promise.all([
            storage.setItem(BEST_RUN_STORAGE_KEY, String(bestRun)),
            storage.setItem(TOTAL_POINTS_STORAGE_KEY, String(totalPoints)),
          ]);
        } catch {
          // Best-effort: the in-memory cache keeps the value stable this launch.
        }
      }
      return cache;
    },
  };
}
