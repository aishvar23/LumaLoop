/**
 * Best-effort read of the signed-in user's per-game scores (D3) — mobile port of
 * web `src/profile/gameScoresApi.ts`.
 *
 * Reads `public.user_game_scores` (migration 0003) — one row per game the user
 * has played, with best/last points + times played — through the Supabase
 * {@link AuthClient}. RLS (security_invoker on the view → self-only on
 * `game_plays`) scopes the rows to the caller; this helper only shapes the
 * request/response.
 *
 * BEST-EFFORT / NEVER-THROWS: the /you page must still render its aggregate
 * stats if this read fails. Any error (signed out, offline, RLS, transient)
 * resolves to an EMPTY list plus the error message (for an optional inline
 * notice) — it never rejects.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): GAME scores only — points / times
 * played — never an ability / IQ / trait / clinical measure.
 */
import type { AuthClient } from '../auth/authClient';
import type { UserGameScore } from '../core/auth/types';

export interface GameScoresResult {
  scores: UserGameScore[];
  /** A real load error message (shown as an inline notice); null on success. */
  error: string | null;
}

/**
 * Fetch the signed-in user's per-game score rows, most-recently-played first.
 * Never throws; returns an empty list when `userId` is null/empty or on error.
 */
export async function fetchGameScores(
  client: AuthClient,
  userId: string | null,
): Promise<GameScoresResult> {
  if (!userId) return { scores: [], error: null };
  try {
    const { data, error } = await client
      .from('user_game_scores')
      .select('*')
      .eq('user_id', userId)
      .order('last_played_at', { ascending: false });

    if (error) return { scores: [], error: error.message };
    return { scores: (data as UserGameScore[] | null) ?? [], error: null };
  } catch {
    return { scores: [], error: null };
  }
}
