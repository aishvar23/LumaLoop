/**
 * Infinite feed controller for React Native (ADO #127, docs/FEED_DIRECTION.md
 * §3.1). Adapted from web `src/feed/useFeedController.ts` — the hook is plain
 * React (no DOM), so it ports unchanged onto the pure {@link feedDeck} core that
 * M2 brought into `mobile/src/core/`.
 *
 * Owns feed PROGRESSION for the endless game feed: a growing ordered deck of
 * cardIds (via {@link ensureDeckLength}) and the active (focused) index. It never
 * "completes" — focusing past the materialised tail grows the deck. The
 * {@link FeedScreen} owns presentation/scroll/viewability; this hook owns which
 * card is active and keeps enough cards materialised ahead of it (CLAUDE.md §4 —
 * controller/renderer separation).
 */
import { useCallback, useRef, useState } from 'react';

import {
  EMPTY_FEED_DECK,
  FEED_PREFETCH_THRESHOLD,
  defaultFeedBatchSource,
  ensureDeckLength,
  type FeedBatchSource,
  type FeedDeckState,
} from '../core/feed/feedDeck';

export interface FeedController {
  /** The materialised endless stream so far (grows as the user advances). */
  cards: readonly string[];
  /** Index of the active/focused card in {@link cards}. */
  activeIndex: number;
  /** The active cardId, or `null` before anything is materialised. */
  activeCardId: string | null;
  /** Focus a specific index (e.g. from the feed's snap viewability); grows ahead. */
  setActiveIndex: (index: number) => void;
  /** Advance to the next game (swipe up). */
  next: () => void;
  /** Go back to the previous game (swipe down); clamps at the start. */
  prev: () => void;
}

export interface FeedControllerOptions {
  /** Seeds the deck composition (the persisted anonymous id in real usage). */
  anonymousUserId: string;
  /** Batch source — injected in tests; defaults to seeded catalog composition. */
  source?: FeedBatchSource;
  /** How many cards to materialise up front. */
  initialLength?: number;
}

/** Materialise enough cards to cover `index` plus the prefetch window. */
function grownFor(
  state: FeedDeckState,
  index: number,
  anonymousUserId: string,
  source: FeedBatchSource,
): FeedDeckState {
  return ensureDeckLength(
    state,
    index + 1 + FEED_PREFETCH_THRESHOLD,
    anonymousUserId,
    source,
  );
}

export function useFeedController(options: FeedControllerOptions): FeedController {
  const { anonymousUserId } = options;
  const source = options.source ?? defaultFeedBatchSource;
  const initialLength = options.initialLength ?? 8;

  // Source + anon id are fixed for the controller's lifetime; capture via refs so
  // the navigation callbacks stay stable and never re-seed an in-flight feed.
  const sourceRef = useRef(source);
  const anonRef = useRef(anonymousUserId);

  const [deck, setDeck] = useState<FeedDeckState>(() =>
    ensureDeckLength(EMPTY_FEED_DECK, initialLength, anonymousUserId, source),
  );
  const [activeIndex, setActiveIndexState] = useState(0);

  // Latest active index for the stable next()/prev() callbacks.
  const indexRef = useRef(0);
  indexRef.current = activeIndex;

  const goTo = useCallback((rawIndex: number) => {
    const index = rawIndex < 0 ? 0 : rawIndex;
    // Grow synchronously so the active card is materialised in the same render
    // (no swipe into an empty gap), then focus it.
    setDeck((d) => grownFor(d, index, anonRef.current, sourceRef.current));
    setActiveIndexState(index);
  }, []);

  const setActiveIndex = useCallback((index: number) => goTo(index), [goTo]);
  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);
  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo]);

  return {
    cards: deck.cards,
    activeIndex,
    activeCardId: deck.cards[activeIndex] ?? null,
    setActiveIndex,
    next,
    prev,
  };
}
