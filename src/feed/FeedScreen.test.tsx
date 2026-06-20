/**
 * Tests for the full-screen swipe/snap FeedScreen (#105, docs/FEED_DIRECTION.md
 * §3.1). The renderer + deck source + anonymous id are all injected so the feed
 * is deterministic and template-agnostic (no real catalog, no real games).
 *
 * jsdom ships no IntersectionObserver, so a minimal typed mock stands in: it
 * captures the observer callback and lets a test simulate a slide snapping into
 * view (the real on-scroll signal that drives the active index → endless growth).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiquidCard, SpotItCard } from '../cards/types';
import type { RendererRegistry } from '../session/rendererRegistry';
import type { CardResolution, TemplateProps } from '../templates/contract';
import type { FeedBatchSource } from './feedDeck';
import FeedScreen from './FeedScreen';

// --- IntersectionObserver mock -------------------------------------------------

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IOCallback;
  readonly observed = new Set<Element>();

  constructor(callback: IOCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Simulate `el` snapping into view at `ratio` visibility. */
  emit(el: Element, ratio = 1): void {
    this.callback([
      {
        target: el,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      } as IntersectionObserverEntry,
    ]);
  }
}

// --- Deterministic feed source + stub renderer ---------------------------------

/** batch N → ['bN-0','bN-1','bN-2'] (decoded from the per-batch seed suffix). */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

/** Minimal valid card so the registry lookup + renderer have something to play. */
function makeCard(cardId: string): LiquidCard {
  const card: SpotItCard = {
    cardId,
    creatorHandle: `creator_${cardId}`,
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'unreviewed',
    estimatedSeconds: 10,
    prompt: 'Find the odd one out',
    puzzleDna: { mechanic: 'scan', inputMode: 'tap', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      rows: 1,
      columns: 1,
      baseElement: 'a',
      anomalyElement: 'b',
      anomalyRow: 0,
      anomalyColumn: 0,
      timeLimitMs: 1000,
    },
  };
  return card;
}

const fakeGetCardById = (cardId: string): LiquidCard | undefined =>
  makeCard(cardId);

/** A stub renderer: shows the card id + a button to drive a resolution. */
function StubRenderer({ card, onResolve }: TemplateProps<SpotItCard>) {
  const resolution: CardResolution = {
    cardId: card.cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 1,
    interactionElapsedMs: 1,
    attemptCount: 1,
    signals: {},
  };
  return (
    <button
      type="button"
      data-testid={`stub-${card.cardId}`}
      onClick={() => onResolve(resolution)}
    >
      game:{card.cardId}
    </button>
  );
}

const stubRegistry: RendererRegistry = { spot_it: StubRenderer };

function renderFeed(extra?: { onCardResolved?: (i: number, r: CardResolution) => void }) {
  return render(
    <FeedScreen
      anonymousUserId="anon"
      source={fakeSource}
      registry={stubRegistry}
      getCardById={fakeGetCardById}
      onCardResolved={extra?.onCardResolved}
    />,
  );
}

const scroller = () => screen.getByTestId('feed-scroller');

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedScreen', () => {
  it('exposes an accessible feed landmark and renders the first active game', () => {
    renderFeed();
    expect(
      screen.getByRole('heading', { name: 'Game feed' }),
    ).toBeInTheDocument();
    // The active game (index 0) is mounted with the first deck card.
    expect(screen.getByTestId('feed-game-0')).toHaveTextContent('game:b0-0');
  });

  it('only mounts games inside the active window; others are placeholders', () => {
    renderFeed();
    // Active is 0 → indices 0 and 1 are windowed, 2+ are placeholders.
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
    expect(screen.getByTestId('feed-game-1')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-game-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-placeholder-3')).toBeInTheDocument();
  });

  it('advances the active game on ArrowDown and never empties (endless)', () => {
    renderFeed();
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(screen.getByTestId('feed-game-1')).toHaveTextContent('game:b0-1');

    for (let i = 0; i < 40; i += 1) {
      fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    }
    // 41 advances from index 1 → index 41 still materialises a real game.
    expect(screen.getByTestId('feed-game-41')).toBeInTheDocument();
  });

  it('clamps at the start on ArrowUp', () => {
    renderFeed();
    fireEvent.keyDown(scroller(), { key: 'ArrowUp' });
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
    // Still the first card — nothing advanced past it.
    expect(screen.getByTestId('feed-game-0')).toHaveTextContent('game:b0-0');
  });

  it('updates the active game when a slide snaps into view (IntersectionObserver)', () => {
    const { container } = renderFeed();
    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();

    const slideTwo = container.querySelector('[data-index="2"]');
    expect(slideTwo).not.toBeNull();
    act(() => {
      observer.emit(slideTwo as Element, 1);
    });

    // Active moved to 2 → its game mounts, and the no-longer-windowed index 0
    // collapses back to a placeholder.
    expect(screen.getByTestId('feed-game-2')).toHaveTextContent('game:b0-2');
    expect(screen.queryByTestId('feed-game-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-placeholder-0')).toBeInTheDocument();
  });

  it('records a resolution locally without auto-advancing (#106 seam)', () => {
    const onCardResolved = vi.fn();
    renderFeed({ onCardResolved });
    fireEvent.click(screen.getByTestId('stub-b0-0'));

    expect(onCardResolved).toHaveBeenCalledTimes(1);
    expect(onCardResolved).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ cardId: 'b0-0', isCorrect: true }),
    );
    // The feed did NOT advance — index 1 is still a windowed game, not the active
    // focus moving on. (Active stays 0; the user swipes to continue.)
    expect(screen.getByTestId('feed-game-0')).toBeInTheDocument();
  });
});
