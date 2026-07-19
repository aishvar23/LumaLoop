/**
 * Per-card personal-best persistence store (engagement §4.4 — "give users
 * something to chase"; pairs with the in-feed "Play again" action).
 *
 * Persists the player's BEST game-points per card across visits, best-effort.
 * Mirrors the wrapped, never-throws pattern of {@link file://./streakStore.ts}:
 * every storage access is guarded so a disabled / quota-exceeded / private-mode
 * `localStorage` degrades silently to an in-memory value that stays stable for
 * the page lifetime.
 *
 * The shape is one JSON object `{ [cardId]: bestPoints }` under a single
 * `lumaloop.*` key (the internal key convention shared with `scoreStore` /
 * `streakStore`), so a new best folds the whole map atomically.
 *
 * GUARDRAIL (Design §7 / §21.8): stores GAME engagement only — "your best score
 * on this card". NOT a skill/ability record; never presented as one, no shame
 * framing.
 *
 * NO PII (Technical Design §16): a map of card ids → non-negative integers. No
 * identifiers, no timestamps. Reset-safe: clearing storage resets every best.
 */

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

/** Minimal storage surface this module needs (a subset of the DOM `Storage`). */
export type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Injectable dependencies (for testability — no hidden globals in tests). */
export interface CardBestStoreDeps {
  /**
   * Storage backend. `undefined` (the default) resolves to
   * `globalThis.localStorage`; pass `null` to force the in-memory fallback; pass
   * a fake `Storage`-like object in tests.
   */
  storage?: ReadWriteStorage | null;
}

/** A small store persisting per-card personal bests. */
export interface CardBestStore {
  /** Read the stored best for a card (cached after first read), or 0. Never throws. */
  readCardBest(cardId: string): number;
  /**
   * Fold `points` into the card's best: if it STRICTLY exceeds the stored best
   * it becomes the new best (persisted) and `isNewBest` is true; otherwise the
   * stored best is kept and `isNewBest` is false. A non-positive `points` never
   * becomes a best. Never throws.
   */
  recordCardBest(cardId: string, points: number): CardBestResult;
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

/** Parse the stored JSON map; anything invalid reads as an empty map. */
function readMap(storage: ReadWriteStorage | null): CardBestMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CARD_BEST_STORAGE_KEY);
    if (raw === null) return {};
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

/** Persist the map best-effort — a storage failure is swallowed, not thrown. */
function writeMap(storage: ReadWriteStorage | null, map: CardBestMap): void {
  if (!storage) return;
  try {
    storage.setItem(CARD_BEST_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort: private mode / quota / disabled storage. The in-memory cache
    // keeps the value stable for the page lifetime.
  }
}

/**
 * Build a store with its own in-memory cache. Reads persistence lazily on the
 * first call and caches it, so bests stay stable for the page lifetime even when
 * storage is unavailable. Tests create isolated stores with a fake storage;
 * production uses {@link defaultStorage}.
 */
export function createCardBestStore(deps: CardBestStoreDeps = {}): CardBestStore {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const cache: CardBestMap = readMap(storage);

  return {
    readCardBest(cardId: string): number {
      return cache[cardId] ?? 0;
    },
    recordCardBest(cardId: string, points: number): CardBestResult {
      const candidate = safeCount(points);
      const stored = cache[cardId] ?? 0;
      if (candidate > stored) {
        cache[cardId] = candidate;
        writeMap(storage, cache);
        return { best: candidate, isNewBest: true };
      }
      return { best: stored, isNewBest: false };
    },
  };
}

/** The process-wide default store (real `localStorage`), shared by the helpers. */
const defaultStore = createCardBestStore();

/** Read the stored best for a card from the default store. Never throws. */
export function readCardBest(cardId: string): number {
  return defaultStore.readCardBest(cardId);
}

/**
 * Record `points` against a card's best in the default store and return the
 * outcome. Best-effort (never throws); a new best is only set when `points`
 * strictly exceeds the prior stored value.
 */
export function recordCardBest(cardId: string, points: number): CardBestResult {
  return defaultStore.recordCardBest(cardId, points);
}
