/**
 * Records each resolved card as a `game_plays` row for the signed-in user
 * (accounts pivot — mobile port of web `src/feed/useRecordGamePlay.ts`).
 *
 * Returns an `onCardScored` handler the feed wires to {@link FeedScreen}'s
 * accounts-pivot seam — the SAME resolution path the Phase-4 scoring uses, not a
 * parallel observer. For each resolution it builds the row from the resolved card
 * + the shared {@link CardResolution} + the Phase-4 points (via the pure
 * {@link buildGamePlay}) and inserts it best-effort.
 *
 * BEST-EFFORT / NON-BLOCKING (task constraint): the insert is fire-and-forget and
 * never throws — gameplay must never break if the write fails (signed out,
 * offline, RLS, transient). When there is no signed-in user it records nothing.
 * The existing anonymous telemetry is unaffected (it rides its own seam).
 *
 * Stays template-agnostic: it reads only the card's `templateType`/`category` and
 * the universal points value — no switch on `templateType`.
 */
import { useCallback } from 'react';

import type { AuthClient } from '../auth/authClient';
import { buildGamePlay } from '../core/auth/gamePlayFromResolution';
import { insertGamePlay } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import type { CardScore } from '../core/feed/scoring';

export interface UseRecordGamePlayOptions {
  /** The signed-in user's id, or null when signed out (records nothing). */
  userId: string | null;
  /** cardId → card, for the card's templateType/category. */
  getCardById: (cardId: string) => LiquidCard | undefined;
  /** Test seam: the Supabase client. Defaults to the real native client. */
  client?: AuthClient;
}

export type RecordGamePlay = (
  index: number,
  resolution: CardResolution,
  score: CardScore,
) => void;

export function useRecordGamePlay({
  userId,
  getCardById,
  client = supabase,
}: UseRecordGamePlayOptions): RecordGamePlay {
  return useCallback(
    (_index, resolution, score) => {
      if (!userId) return; // not signed in — nothing to record.
      const card = getCardById(resolution.cardId);
      if (!card) return; // unknown card — can't shape a row.
      const row = buildGamePlay({
        userId,
        card,
        resolution,
        points: score.points,
      });
      // Fire-and-forget: best-effort, never blocks or throws into the feed.
      void insertGamePlay(client, row);
    },
    [userId, getCardById, client],
  );
}
