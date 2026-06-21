/**
 * Card-score context for React Native (Phase 4 — GAME POINTS). The RN counterpart
 * of web `src/feed/cardScoreContext.ts`.
 *
 * The per-card {@link CardScore} is computed by the feed-level score accumulator
 * ({@link useFeedScore}) when a resolution fires, but it must be shown on the
 * RESULT CARD ({@link CardFeedback}), which lives BELOW the feed inside the
 * feedback gate. The feed provides a lookup through this context and the gate reads
 * its slide's score by `context.cardIndex` — so renderers and the template contract
 * stay untouched (CLAUDE.md §4/§6). A `null` context means "no scoring" and the
 * result card omits the chip (standalone renders / tests behave as before).
 */

import { createContext, useContext } from 'react';

import type { CardScore } from '../core/feed/scoring';

/** Looks up the per-card score for a feed index; null until that card resolves. */
export type CardScoreLookup = (cardIndex: number) => CardScore | null;

const CardScoreContext = createContext<CardScoreLookup | null>(null);

export const CardScoreProvider = CardScoreContext.Provider;

/** The score lookup from context, or null when no provider is present. */
export function useCardScoreLookup(): CardScoreLookup | null {
  return useContext(CardScoreContext);
}
