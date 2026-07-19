/**
 * Tests for the infinite feed controller hook (#104), driven through a tiny
 * harness with a deterministic injected batch source (no real catalog, no React
 * internals asserted) — the endless-progression behaviour is what matters here.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FeedBatchSource } from './feedDeck';
import { useFeedController, type FeedControllerOptions } from './useFeedController';

/** batch N → ['bN-0','bN-1','bN-2'] (decoded from the per-batch seed suffix). */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

function Harness(props: FeedControllerOptions) {
  const c = useFeedController(props);
  return (
    <div>
      <span data-testid="idx">{c.activeIndex}</span>
      <span data-testid="card">{c.activeCardId ?? 'none'}</span>
      <span data-testid="len">{c.cards.length}</span>
      <button data-testid="next" onClick={c.next}>
        next
      </button>
      <button data-testid="prev" onClick={c.prev}>
        prev
      </button>
      <button data-testid="jump" onClick={() => c.setActiveIndex(20)}>
        jump
      </button>
    </div>
  );
}

const idx = () => screen.getByTestId('idx').textContent;
const card = () => screen.getByTestId('card').textContent;
const len = () => Number(screen.getByTestId('len').textContent);

describe('useFeedController', () => {
  it('materialises an initial window and focuses the first card', () => {
    render(<Harness anonymousUserId="anon" source={fakeSource} />);
    expect(idx()).toBe('0');
    expect(card()).toBe('b0-0');
    expect(len()).toBeGreaterThanOrEqual(8);
  });

  it('pins a startCardId as the first slide (featured-game deep link)', () => {
    render(
      <Harness anonymousUserId="anon" source={fakeSource} startCardId="b0-2" />,
    );
    // The chosen game opens first…
    expect(idx()).toBe('0');
    expect(card()).toBe('b0-2');
    // …and is not duplicated immediately after (deduped from the rest).
    fireEvent.click(screen.getByTestId('next'));
    expect(card()).not.toBe('b0-2');
  });

  it('advances across batch boundaries with next()', () => {
    render(<Harness anonymousUserId="anon" source={fakeSource} />);
    fireEvent.click(screen.getByTestId('next'));
    expect([idx(), card()]).toEqual(['1', 'b0-1']);
    fireEvent.click(screen.getByTestId('next'));
    fireEvent.click(screen.getByTestId('next'));
    expect([idx(), card()]).toEqual(['3', 'b1-0']); // crossed into batch 1
  });

  it('never runs out — advancing far keeps materialising (endless)', () => {
    render(<Harness anonymousUserId="anon" source={fakeSource} />);
    for (let i = 0; i < 30; i += 1) {
      fireEvent.click(screen.getByTestId('next'));
    }
    expect(idx()).toBe('30');
    expect(card()).not.toBe('none');
    expect(len()).toBeGreaterThan(30);
  });

  it('clamps prev() at the start', () => {
    render(<Harness anonymousUserId="anon" source={fakeSource} />);
    fireEvent.click(screen.getByTestId('prev'));
    expect(idx()).toBe('0');
    expect(card()).toBe('b0-0');
  });

  it('setActiveIndex jumps and materialises ahead', () => {
    render(<Harness anonymousUserId="anon" source={fakeSource} />);
    fireEvent.click(screen.getByTestId('jump'));
    expect(idx()).toBe('20');
    expect(card()).not.toBe('none');
    expect(len()).toBeGreaterThanOrEqual(21);
  });
});
