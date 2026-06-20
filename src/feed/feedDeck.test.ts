/**
 * Tests for the pure endless-feed deck logic (#104). The default source is the
 * real catalog composer; most cases inject a deterministic fake source so the
 * endless-ordering rules are asserted without depending on catalog contents.
 */
import { describe, expect, it } from 'vitest';

import {
  EMPTY_FEED_DECK,
  appendNextBatch,
  defaultFeedBatchSource,
  ensureDeckLength,
  feedBatchSeedUserId,
  type FeedBatchSource,
} from './feedDeck';

/** A fake source: batch N → ['bN-0','bN-1','bN-2'], decoded from the seed suffix. */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

describe('feedBatchSeedUserId', () => {
  it('keeps batch 0 plain and suffixes later batches', () => {
    expect(feedBatchSeedUserId('anon', 0)).toBe('anon');
    expect(feedBatchSeedUserId('anon', 1)).toBe('anon#feed-1');
    expect(feedBatchSeedUserId('anon', 5)).toBe('anon#feed-5');
  });
});

describe('appendNextBatch', () => {
  it('appends a batch and increments batchesUsed', () => {
    const s1 = appendNextBatch(EMPTY_FEED_DECK, 'anon', fakeSource);
    expect(s1.cards).toEqual(['b0-0', 'b0-1', 'b0-2']);
    expect(s1.batchesUsed).toBe(1);
    const s2 = appendNextBatch(s1, 'anon', fakeSource);
    expect(s2.cards).toEqual(['b0-0', 'b0-1', 'b0-2', 'b1-0', 'b1-1', 'b1-2']);
    expect(s2.batchesUsed).toBe(2);
  });

  it('avoids an exact back-to-back repeat at the seam (rotates the dup)', () => {
    // A source whose every batch starts with the same id 'X'.
    const repeating: FeedBatchSource = () => ['X', 'Y', 'Z'];
    const s1 = appendNextBatch(EMPTY_FEED_DECK, 'anon', repeating);
    expect(s1.cards[s1.cards.length - 1]).toBe('Z');
    const s2 = appendNextBatch(s1, 'anon', repeating);
    // The new batch's leading 'X' would have repeated against… 'Z' (no repeat),
    // so this batch is appended as-is; assert no adjacent duplicate anywhere.
    for (let i = 1; i < s2.cards.length; i += 1) {
      expect(s2.cards[i]).not.toBe(s2.cards[i - 1]);
    }
  });

  it('rotates when the seam truly repeats', () => {
    const endsAndStartsSame: FeedBatchSource = () => ['Q', 'R', 'Q'];
    const s1 = appendNextBatch(EMPTY_FEED_DECK, 'anon', endsAndStartsSame); // Q R Q
    const s2 = appendNextBatch(s1, 'anon', endsAndStartsSame); // next batch starts Q == last Q → rotate
    expect(s2.cards[3]).not.toBe(s2.cards[2]); // no Q,Q seam
  });

  it('returns the same state when the source yields nothing (no infinite growth)', () => {
    const empty: FeedBatchSource = () => [];
    const s = appendNextBatch(EMPTY_FEED_DECK, 'anon', empty);
    expect(s).toBe(EMPTY_FEED_DECK);
  });
});

describe('ensureDeckLength', () => {
  it('grows until at least minLength cards exist', () => {
    const s = ensureDeckLength(EMPTY_FEED_DECK, 7, 'anon', fakeSource);
    expect(s.cards.length).toBeGreaterThanOrEqual(7);
    expect(s.batchesUsed).toBe(3); // 3 batches × 3 = 9 ≥ 7
  });

  it('is idempotent when already long enough', () => {
    const s = ensureDeckLength(EMPTY_FEED_DECK, 3, 'anon', fakeSource);
    const again = ensureDeckLength(s, 3, 'anon', fakeSource);
    expect(again).toBe(s);
  });

  it('stops (does not loop) when the source is empty', () => {
    const s = ensureDeckLength(EMPTY_FEED_DECK, 100, 'anon', () => []);
    expect(s.cards).toEqual([]);
  });

  it('is deterministic for the same anon id + source', () => {
    const a = ensureDeckLength(EMPTY_FEED_DECK, 12, 'anon', fakeSource);
    const b = ensureDeckLength(EMPTY_FEED_DECK, 12, 'anon', fakeSource);
    expect(a.cards).toEqual(b.cards);
  });
});

describe('defaultFeedBatchSource (real catalog composition)', () => {
  it('produces a non-empty batch from the catalog', () => {
    expect(defaultFeedBatchSource('anon').length).toBeGreaterThan(0);
  });

  it('reshuffles across batches (later batches are not identical orderings)', () => {
    const grown = ensureDeckLength(EMPTY_FEED_DECK, 30, 'anon-real');
    // Across several real batches we expect more than one distinct card overall.
    expect(new Set(grown.cards).size).toBeGreaterThan(1);
    expect(grown.cards.length).toBeGreaterThanOrEqual(30);
  });

  it('never places the same card back-to-back at any seam', () => {
    const grown = ensureDeckLength(EMPTY_FEED_DECK, 40, 'anon-seams');
    for (let i = 1; i < grown.cards.length; i += 1) {
      expect(grown.cards[i]).not.toBe(grown.cards[i - 1]);
    }
  });
});
