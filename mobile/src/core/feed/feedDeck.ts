// Ported from web `src/feed/feedDeck.ts`; source of truth is the web app — keep
// in sync (Phase M, M2). The React `useFeedController` wrapper is NOT ported —
// the RN feed is M3. See `mobile/src/core/README.md`.
/**
 * Endless feed deck (Azure DevOps #104, docs/FEED_DIRECTION.md §3.1).
 *
 * Pure, runtime-agnostic logic for the infinite game feed: it materialises an
 * ever-growing ordered stream of cardIds by appending freshly-seeded batches, so
 * the feed never ends (no "N of M", no completed state). Each batch reuses the
 * existing seeded composer (ramp + category spread + no-3-in-a-row), with a
 * seed-only per-batch suffix so successive batches reshuffle deterministically.
 *
 * No React here — {@link useFeedController} wraps this for the UI. Kept pure so
 * the endless-ordering rules unit-test without a component (CLAUDE.md §3).
 */

import { composeSession } from '../session/composeSession';
import type { SessionMode } from '../session/sessionTypes';

/** Mode used to size/shape each batch — the largest, best-mixed composition. */
const FEED_BATCH_MODE: SessionMode = 'three_minute_reset';

/**
 * Append the next batch once the active card is within this many of the tail, so
 * the user never swipes into an unmaterialised gap.
 */
export const FEED_PREFETCH_THRESHOLD = 2;

/**
 * Produces the cardIds for one batch given a seed. Injected in tests; the
 * default is a mode-shaped seeded composition over the catalog.
 */
export type FeedBatchSource = (seedUserId: string) => readonly string[];

/** The materialised endless stream so far, plus how many batches produced it. */
export interface FeedDeckState {
  cards: readonly string[];
  batchesUsed: number;
}

/** A fresh, empty deck. */
export const EMPTY_FEED_DECK: FeedDeckState = { cards: [], batchesUsed: 0 };

/**
 * Seed-only per-batch user id: batch 0 keeps the plain anonymous id (a stable
 * first impression), later batches get a `#feed-N` suffix so each reshuffles
 * deterministically. The suffix never leaves composition and is never persisted
 * (mirrors the continue-seed pattern), so it is NOT a user identity.
 */
export function feedBatchSeedUserId(anonymousUserId: string, batchIndex: number): string {
  return batchIndex === 0 ? anonymousUserId : `${anonymousUserId}#feed-${batchIndex}`;
}

/** Default batch source: a seeded, mode-shaped composition over the catalog. */
export const defaultFeedBatchSource: FeedBatchSource = (seedUserId) =>
  composeSession({ mode: FEED_BATCH_MODE, anonymousUserId: seedUserId });

/**
 * Append one more batch to the deck, avoiding an exact back-to-back repeat at
 * the seam (if the new batch's first card equals the deck's last card, rotate it
 * to the end). A source that yields no cards returns the deck unchanged — the
 * caller uses that to stop growing rather than loop forever.
 */
export function appendNextBatch(
  state: FeedDeckState,
  anonymousUserId: string,
  source: FeedBatchSource = defaultFeedBatchSource,
): FeedDeckState {
  const seed = feedBatchSeedUserId(anonymousUserId, state.batchesUsed);
  const batch = source(seed);
  if (batch.length === 0) return state;

  let next = [...batch];
  const last = state.cards[state.cards.length - 1];
  if (last !== undefined && next[0] === last && next.length > 1) {
    next = [...next.slice(1), next[0]];
  }
  return { cards: [...state.cards, ...next], batchesUsed: state.batchesUsed + 1 };
}

/**
 * Grow the deck until it holds at least `minLength` cards (or the source dries
 * up). Idempotent when already long enough. Bounded against a pathological empty
 * source via the unchanged-state break.
 */
export function ensureDeckLength(
  state: FeedDeckState,
  minLength: number,
  anonymousUserId: string,
  source: FeedBatchSource = defaultFeedBatchSource,
): FeedDeckState {
  let current = state;
  while (current.cards.length < minLength) {
    const grown = appendNextBatch(current, anonymousUserId, source);
    if (grown === current) break; // source produced nothing → stop, never loop
    current = grown;
  }
  return current;
}
