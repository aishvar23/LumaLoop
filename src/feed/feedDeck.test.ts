/**
 * Tests for the pure endless-feed deck logic (#104). The default source is the
 * real catalog composer; most cases inject a deterministic fake source so the
 * endless-ordering rules are asserted without depending on catalog contents.
 */
import { describe, expect, it } from 'vitest';

import { catalog } from '../cards/catalog';
import type { Difficulty } from '../cards/types';
import {
  EMPTY_FEED_DECK,
  FEED_RAMP_BATCHES,
  appendNextBatch,
  defaultFeedBatchSource,
  ensureDeckLength,
  excludeWithStart,
  feedBatchSeedUserId,
  feedDifficultyBias,
  makeFeedBatchSource,
  withPinnedFirst,
  type FeedBatchSource,
} from './feedDeck';

/** A fake source: batch N → ['bN-0','bN-1','bN-2'], decoded from the seed suffix. */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  extremely_easy: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  extremely_hard: 4,
};
const cardById = new Map(catalog.map((c) => [c.cardId, c]));
const meanRank = (ids: readonly string[]): number => {
  const ranks = ids.map((id) => DIFFICULTY_RANK[cardById.get(id)!.difficulty]);
  return ranks.reduce((s, r) => s + r, 0) / ranks.length;
};

describe('feedBatchSeedUserId', () => {
  it('keeps batch 0 plain and suffixes later batches', () => {
    expect(feedBatchSeedUserId('anon', 0)).toBe('anon');
    expect(feedBatchSeedUserId('anon', 1)).toBe('anon#feed-1');
    expect(feedBatchSeedUserId('anon', 5)).toBe('anon#feed-5');
  });
});

describe('feedDifficultyBias (progressive ramp curve)', () => {
  it('starts at 0 for batch 0 (easiest first impression)', () => {
    expect(feedDifficultyBias(0)).toBe(0);
    expect(feedDifficultyBias(-1)).toBe(0); // defensive clamp
  });

  it('plateaus at 1 once the ramp completes', () => {
    expect(feedDifficultyBias(FEED_RAMP_BATCHES)).toBe(1);
    expect(feedDifficultyBias(FEED_RAMP_BATCHES + 10)).toBe(1);
  });

  it('is monotonically non-decreasing across batches', () => {
    let prev = -1;
    for (let i = 0; i <= FEED_RAMP_BATCHES + 3; i++) {
      const bias = feedDifficultyBias(i);
      expect(bias).toBeGreaterThanOrEqual(prev);
      expect(bias).toBeGreaterThanOrEqual(0);
      expect(bias).toBeLessThanOrEqual(1);
      prev = bias;
    }
  });

  it('passes the per-batch index through to the source', () => {
    const seen: number[] = [];
    const recording: FeedBatchSource = (_seed, batchIndex = -1) => {
      seen.push(batchIndex);
      return [`b${batchIndex}`];
    };
    const s1 = appendNextBatch(EMPTY_FEED_DECK, 'anon', recording);
    const s2 = appendNextBatch(s1, 'anon', recording);
    appendNextBatch(s2, 'anon', recording);
    expect(seen).toEqual([0, 1, 2]);
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

  it('ramps difficulty across the endless stream: early skews easier than late', () => {
    // Grow well past the ramp plateau so early and late windows differ, then
    // compare the mean difficulty of the first window vs. the last window. The
    // ramp lives in the composer (bias per batch), so this is the end-to-end
    // check that the user starts easy and gets harder as they keep playing.
    const grown = ensureDeckLength(EMPTY_FEED_DECK, 60, 'anon-ramp');
    const window = 12;
    const early = grown.cards.slice(0, window);
    const late = grown.cards.slice(-window);
    expect(meanRank(late)).toBeGreaterThan(meanRank(early));
  });

  it('is deterministic end-to-end (same anon id ⇒ same ramped stream)', () => {
    const a = ensureDeckLength(EMPTY_FEED_DECK, 50, 'anon-det');
    const b = ensureDeckLength(EMPTY_FEED_DECK, 50, 'anon-det');
    expect(a.cards).toEqual(b.cards);
  });
});

describe('makeFeedBatchSource (D2 already-played skip)', () => {
  it('with no/empty exclusion reproduces the default source exactly', () => {
    const src = makeFeedBatchSource(undefined);
    const srcEmpty = makeFeedBatchSource(new Set<string>());
    for (const batchIndex of [0, 1, 5]) {
      const seed = feedBatchSeedUserId('mk', batchIndex);
      const def = defaultFeedBatchSource(seed, batchIndex);
      expect(src(seed, batchIndex)).toEqual(def);
      expect(srcEmpty(seed, batchIndex)).toEqual(def);
    }
  });

  it('omits excluded cards from the materialised endless stream', () => {
    // Find some cards the default stream actually serves, then exclude them.
    const baseline = ensureDeckLength(EMPTY_FEED_DECK, 40, 'mk-skip');
    const excluded = new Set(baseline.cards.slice(0, 3));
    const grown = ensureDeckLength(
      EMPTY_FEED_DECK,
      40,
      'mk-skip',
      makeFeedBatchSource(excluded),
    );
    for (const id of excluded) expect(grown.cards).not.toContain(id);
  });

  it('stays endless: excluding the entire catalog still grows (exhaustion fallback)', () => {
    const excludeAll = new Set(catalog.map((c) => c.cardId));
    const grown = ensureDeckLength(
      EMPTY_FEED_DECK,
      40,
      'mk-all',
      makeFeedBatchSource(excludeAll),
    );
    expect(grown.cards.length).toBeGreaterThanOrEqual(40);
  });
});

describe('withPinnedFirst (featured-game deep link)', () => {
  it('moves the chosen card to index 0 and removes other occurrences', () => {
    const deck = { cards: ['a', 'b', 'c', 'b'], batchesUsed: 2 };
    const pinned = withPinnedFirst(deck, 'b');
    expect(pinned.cards).toEqual(['b', 'a', 'c']);
    expect(pinned.batchesUsed).toBe(2);
  });

  it('prepends a card not already present', () => {
    expect(withPinnedFirst({ cards: ['a', 'b'], batchesUsed: 1 }, 'z').cards).toEqual([
      'z',
      'a',
      'b',
    ]);
  });

  it('returns the deck unchanged for a falsy cardId', () => {
    const deck = { cards: ['a', 'b'], batchesUsed: 1 };
    expect(withPinnedFirst(deck, undefined)).toBe(deck);
  });
});

describe('excludeWithStart', () => {
  it('adds the start card to an existing exclusion set', () => {
    const set = excludeWithStart(['a', 'b'], 'c');
    expect(new Set(set)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns the original exclusion untouched when there is no start card', () => {
    const set = ['a'];
    expect(excludeWithStart(set, undefined)).toBe(set);
  });

  it('builds a singleton set when only a start card is given', () => {
    expect(new Set(excludeWithStart(undefined, 'c'))).toEqual(new Set(['c']));
  });
});
