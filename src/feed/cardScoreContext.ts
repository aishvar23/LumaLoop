/**
 * Card-score context (Phase 4 — GAME POINTS).
 *
 * The per-card {@link CardScore} is computed by the feed-level score accumulator
 * ({@link useFeedScore}) when a resolution fires, but it must be shown on the
 * RESULT CARD ({@link CardFeedback}), which lives BELOW the feed inside the
 * feedback gate. Rather than thread it through the template `onResolve` contract
 * (which would couple every renderer to scoring), the feed provides a lookup
 * through this context and the gate reads its slide's score by `context.cardIndex`.
 *
 * Decoupled by design (CLAUDE.md §4/§6): renderers and the contract are untouched;
 * scoring stays a feed-layer concern. A `null` context (no provider) means "no
 * scoring" and the result card simply omits the chip — so standalone renders
 * (tests, isolation, `/c/:cardId`) behave exactly as before.
 */

import { createContext, useContext } from 'react';

import type { CardScore } from './scoring';

/** Looks up the per-card score for a feed index; null until that card resolves. */
export type CardScoreLookup = (cardIndex: number) => CardScore | null;

const CardScoreContext = createContext<CardScoreLookup | null>(null);

export const CardScoreProvider = CardScoreContext.Provider;

/** The score lookup from context, or null when no provider is present. */
export function useCardScoreLookup(): CardScoreLookup | null {
  return useContext(CardScoreContext);
}
