// Ported from web `src/auth/types.ts`; source of truth is the web app — keep in
// sync (accounts pivot). Byte-faithful: only this header differs. See
// `mobile/src/core/README.md`.
/**
 * Shared account-domain types (accounts pivot).
 *
 * These mirror the `public.profiles` and `public.game_plays` tables defined in
 * `supabase/migrations/0002_profiles_game_plays.sql`. They are the typed contract
 * the web app speaks to Supabase — kept in lock-step with the migration. The
 * categorical columns are plain strings on purpose (a new challenge template
 * never needs a DB migration; CLAUDE.md §6), so the app does not narrow them to a
 * union here — the catalog/evaluator layer owns those unions.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): a profile shows GAME activity —
 * "games played", "points", "best streak", "accuracy". It is NOT an ability / IQ
 * / trait / clinical measure and its copy must never be framed as one.
 */

/** Handle format enforced both client-side and by the DB check constraint. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** A row of `public.profiles` (1:1 with an authenticated user). */
export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `public.game_plays` — one resolved card owned by the player. */
export interface GamePlay {
  id: string;
  user_id: string;
  card_id: string;
  template_type: string;
  category: string;
  is_correct: boolean;
  points: number;
  elapsed_ms: number | null;
  played_at: string;
}

/**
 * The insert payload for a new play row. `id` and `played_at` are DB-defaulted;
 * `user_id` is set from the authenticated session (RLS enforces `auth.uid()`).
 */
export type GamePlayInsert = Omit<GamePlay, 'id' | 'played_at'>;

/** The insert payload for a new profile row (id = the auth user's id). */
export type ProfileInsert = Pick<
  Profile,
  'id' | 'handle' | 'display_name' | 'avatar_url'
>;

/**
 * A row of `public.user_game_scores` — the per-user, per-game score aggregate
 * over `game_plays` (migration 0003). One row per (user_id, card_id) the user
 * has played: best/last points, times played, ever/last correct. Read-only
 * (a VIEW); `security_invoker` + game_plays RLS scope it to the caller.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): these are GAME scores — points,
 * times played — NOT an ability / IQ / trait / clinical measure.
 */
export interface UserGameScore {
  user_id: string;
  card_id: string;
  template_type: string;
  category: string;
  times_played: number;
  best_points: number;
  last_points: number;
  ever_correct: boolean;
  last_is_correct: boolean;
  last_played_at: string;
}
