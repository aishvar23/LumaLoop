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
 *
 * `batchIndex` is the zero-based position of this batch in the endless stream;
 * the default source uses it to ramp difficulty (see {@link feedDifficultyBias}
 * and {@link defaultFeedBatchSource}). A source may ignore it.
 */
export type FeedBatchSource = (
  seedUserId: string,
  batchIndex?: number,
) => readonly string[];

/**
 * How many batches it takes the difficulty ramp to reach full strength (bias 1).
 * Batch 0 starts easy (bias 0) and each later batch nudges harder, plateauing at
 * `hard` once `batchIndex >= FEED_RAMP_BATCHES`. Tuned so a user eases in over
 * the first several batches rather than jumping to hard immediately.
 */
export const FEED_RAMP_BATCHES = 5;

/**
 * The progressive difficulty bias for a given batch — a pure, monotonic ramp in
 * `[0, 1]`: `0` at batch 0 (easiest first impression), climbing linearly to `1`
 * by {@link FEED_RAMP_BATCHES} and staying there. Fed to `composeSession`'s
 * `difficultyBias`, which is template-agnostic (reads only `card.difficulty`).
 */
export function feedDifficultyBias(batchIndex: number | undefined): number {
  if (batchIndex == null || !Number.isFinite(batchIndex) || batchIndex <= 0) {
    return 0;
  }
  if (batchIndex >= FEED_RAMP_BATCHES) return 1;
  return batchIndex / FEED_RAMP_BATCHES;
}

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

/**
 * Default batch source: a seeded, mode-shaped composition over the catalog,
 * ramped by `batchIndex` so the endless feed starts easy and gets harder as the
 * user keeps playing (the progressive difficulty ramp). The bias is the only
 * per-batch ramp input; ordering within a batch stays the composer's job, and
 * the composer stays template-agnostic.
 */
export const defaultFeedBatchSource: FeedBatchSource = (seedUserId, batchIndex) =>
  composeSession({
    mode: FEED_BATCH_MODE,
    anonymousUserId: seedUserId,
    difficultyBias: feedDifficultyBias(batchIndex),
  });

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
  const batch = source(seed, state.batchesUsed);
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
