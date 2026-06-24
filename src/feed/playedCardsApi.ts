/**
 * Best-effort read of the signed-in user's already-played games (D2).
 *
 * The endless feed skips games the user has already played. The set of played
 * `card_id`s is derived from `public.user_game_scores` (one row per played
 * card; migration 0003), read through the Supabase {@link AuthClient}. RLS
 * (security_invoker on the view → self-only on `game_plays`) guarantees the
 * caller only ever sees their own rows; this helper only shapes the request.
 *
 * "ALREADY PLAYED" = ANY play of that card (a row exists in `user_game_scores`,
 * i.e. `times_played >= 1`), NOT "answered correctly". Default per the task: a
 * skip-on-replay should fire once the user has engaged a game at all, regardless
 * of outcome — re-serving a game they already lost is still a repeat.
 *
 * BEST-EFFORT / NEVER-THROWS (task constraint): gameplay must never be blocked
 * by this read. Any failure (signed out, offline, RLS, transient, malformed)
 * resolves to an EMPTY set, so the feed simply falls back to skipping nothing.
 */
import type { AuthClient } from '../auth/authClient';

/** One row of `user_game_scores` we read here (only the id is needed for D2). */
interface PlayedCardRow {
  card_id: string;
}

export interface PlayedCardIdsResult {
  /** The user's already-played cardIds; EMPTY on signed-out or any error. */
  cardIds: ReadonlySet<string>;
  /** A real load error message (diagnostics only; the feed ignores it). */
  error: string | null;
}

/** A stable empty result, reused for the no-op / error paths. */
const EMPTY_RESULT: PlayedCardIdsResult = {
  cardIds: new Set<string>(),
  error: null,
};

/**
 * Fetch the signed-in user's already-played `card_id`s. Never throws; returns an
 * empty set when `userId` is null/empty or the query fails. RLS scopes the rows
 * to the caller, so no extra `user_id` filter is strictly required, but we add it
 * defensively (and it lets the planner use the view's grouping key).
 */
export async function fetchPlayedCardIds(
  client: AuthClient,
  userId: string | null,
): Promise<PlayedCardIdsResult> {
  if (!userId) return EMPTY_RESULT;
  try {
    const { data, error } = await client
      .from('user_game_scores')
      .select('card_id')
      .eq('user_id', userId);

    if (error) return { cardIds: new Set<string>(), error: error.message };

    const rows = (data as PlayedCardRow[] | null) ?? [];
    const cardIds = new Set<string>();
    for (const row of rows) {
      if (row && typeof row.card_id === 'string') cardIds.add(row.card_id);
    }
    return { cardIds, error: null };
  } catch {
    // Defensive: a throwing client must never break the feed.
    return EMPTY_RESULT;
  }
}
