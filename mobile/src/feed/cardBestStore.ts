/**
 * Per-card personal-best persistence store for React Native (engagement §4.4 —
 * "give users something to chase"; pairs with the in-feed "Play again" action).
 * The RN counterpart of web `src/feed/cardBestStore.ts` — same contract (persist
 * the BEST game-points per card) — but rebuilt for RN: the web store reads the
 * SYNCHRONOUS `localStorage`; React Native persists through
 * `@react-native-async-storage/async-storage`, whose API is PROMISE-based, so the
 * read/record API here is ASYNC, reusing the shared {@link AsyncReadWriteStorage}
 * seam (mirrors `streakStore.ts` / `scoreStore.ts`).
 *
 * The shape is one JSON object `{ [cardId]: bestPoints }` under a single
 * `lumaloop.*` key, so a new best folds the whole map atomically.
 *
 * GUARDRAIL (Design §7 / §21.8): stores GAME engagement only — "your best score
 * on this card". NOT a skill/ability record; never presented as one, no shame
 * framing.
 *
 * BEST-EFFORT (Technical Design §10): every access is wrapped so a disabled /
 * failed native store never rejects; an in-memory cache keeps the snapshot stable
 * for the process lifetime. NO PII (Technical Design §16): a map of card ids →
 * non-negative integers. Reset-safe: clearing storage resets every best.
 */

import type { AsyncReadWriteStorage } from '../telemetry/storage';
import { defaultAsyncStorage } from '../telemetry/storage';

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const CARD_BEST_STORAGE_KEY = 'lumaloop.cardBest';

/** The persisted shape: best game-points keyed by card id. */
export type CardBestMap = Record<string, number>;

/** The outcome of recording a score against a card's stored best. */
export interface CardBestResult {
  /** The card's best score after this record (the higher of stored vs. points). */
  best: number;
  /** True only when `points` STRICTLY exceeded the prior stored best. */
  isNewBest: boolean;
}

/** Injectable dependencies (for testability — no native module in tests). */
export interface CardBestStoreDeps {
  /**
   * Async storage backend. `undefined` (the default) resolves to
   * {@link defaultAsyncStorage}; pass `null` to force the in-memory fallback;
   * pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
}

/** A small store persisting per-card personal bests. */
export interface CardBestStore {
  /** Resolve the stored best for a card (cached after the first read), or 0. Never rejects. */
  readCardBest(cardId: string): Promise<number>;
  /**
   * Fold `points` into the card's best: if it STRICTLY exceeds the stored best
   * it becomes the new best (persisted) and `isNewBest` is true; otherwise the
   * stored best is kept and `isNewBest` is false. A non-positive `points` never
   * becomes a best. Never rejects.
   */
  recordCardBest(cardId: string, points: number): Promise<CardBestResult>;
}

/** A non-negative integer, or 0 when the value isn't one. */
function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Parse the stored JSON map; anything invalid reads as an empty map. */
function parseMap(raw: string | null): CardBestMap {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const map: CardBestMap = {};
    for (const [cardId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const best = safeCount(value);
      if (best > 0) map[cardId] = best;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Build a store with its own in-memory cache. The first read loads persistence
 * and caches it; once read (or recorded) the map stays stable for the process
 * lifetime even if persistence later fails. Tests inject a fake storage;
 * production uses {@link defaultAsyncStorage}.
 */
export function createCardBestStore(deps: CardBestStoreDeps = {}): CardBestStore {
  const storage =
    deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  let cache: CardBestMap | null = null;

  async function loadCache(): Promise<CardBestMap> {
    if (cache) return cache;
    if (!storage) {
      cache = {};
      return cache;
    }
    try {
      cache = parseMap(await storage.getItem(CARD_BEST_STORAGE_KEY));
    } catch {
      cache = {};
    }
    return cache;
  }

  return {
    async readCardBest(cardId: string): Promise<number> {
      const map = await loadCache();
      return map[cardId] ?? 0;
    },
    async recordCardBest(cardId: string, points: number): Promise<CardBestResult> {
      const map = await loadCache();
      const candidate = safeCount(points);
      const stored = map[cardId] ?? 0;
      if (candidate > stored) {
        map[cardId] = candidate;
        if (storage) {
          try {
            await storage.setItem(CARD_BEST_STORAGE_KEY, JSON.stringify(map));
          } catch {
            // Best-effort: the in-memory cache keeps the value stable this launch.
          }
        }
        return { best: candidate, isNewBest: true };
      }
      return { best: stored, isNewBest: false };
    },
  };
}

/** The process-wide default store (real AsyncStorage), shared by the helpers. */
const defaultStore = createCardBestStore();

/** Read the stored best for a card from the default store. Never rejects. */
export function readCardBest(cardId: string): Promise<number> {
  return defaultStore.readCardBest(cardId);
}

/**
 * Record `points` against a card's best in the default store and return the
 * outcome. Best-effort (never rejects); a new best is only set when `points`
 * strictly exceeds the prior stored value.
 */
export function recordCardBest(
  cardId: string,
  points: number,
): Promise<CardBestResult> {
  return defaultStore.recordCardBest(cardId, points);
}
