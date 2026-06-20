/**
 * Tests for the native feed controller (ADO #127). The batch source is injected
 * so progression is deterministic and independent of the real catalog. Focus:
 * the endless invariant (advancing never empties) and materialise-ahead.
 */
import { act, renderHook } from '@testing-library/react-native';

import type { FeedBatchSource } from '../core/feed/feedDeck';
import { FEED_PREFETCH_THRESHOLD } from '../core/feed/feedDeck';
import { useFeedController } from './useFeedController';

/** batch N → ['bN-0','bN-1','bN-2'] (decoded from the per-batch seed suffix). */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

function renderController(initialLength = 8) {
  return renderHook(() =>
    useFeedController({ anonymousUserId: 'anon', source: fakeSource, initialLength }),
  );
}

describe('useFeedController (native)', () => {
  it('materialises the initial deck and focuses the first card', () => {
    const { result } = renderController();
    expect(result.current.cards.length).toBeGreaterThanOrEqual(8);
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.activeCardId).toBe('b0-0');
  });

  it('grows the deck ahead of the focused index on setActiveIndex', () => {
    const { result } = renderController();
    act(() => result.current.setActiveIndex(20));
    expect(result.current.activeIndex).toBe(20);
    // Materialised at least up to the prefetch window past the focused index.
    expect(result.current.cards.length).toBeGreaterThanOrEqual(
      20 + 1 + FEED_PREFETCH_THRESHOLD,
    );
    expect(result.current.activeCardId).toBeDefined();
  });

  it('advances with next() and never empties — the feed is endless', () => {
    const { result } = renderController();
    for (let i = 0; i < 50; i += 1) {
      act(() => result.current.next());
      // Every advance keeps a materialised, defined active card.
      expect(result.current.activeCardId).not.toBeNull();
    }
    expect(result.current.activeIndex).toBe(50);
    expect(result.current.cards.length).toBeGreaterThan(50);
  });

  it('prev() goes back and clamps at the start', () => {
    const { result } = renderController();
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.activeIndex).toBe(2);
    act(() => result.current.prev());
    expect(result.current.activeIndex).toBe(1);
    act(() => result.current.prev());
    act(() => result.current.prev());
    expect(result.current.activeIndex).toBe(0); // clamped, not negative.
  });
});
