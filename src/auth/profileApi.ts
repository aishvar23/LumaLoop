/**
 * Data helpers for the account-owned tables (`profiles`, `game_plays`).
 *
 * Thin, typed wrappers over the Supabase {@link AuthClient} so the screens and
 * the AuthProvider never inline raw query strings, and so each call is unit-
 * testable against a fake client. RLS is the security boundary on the server
 * side; these helpers only shape the request/response.
 */
import type { AuthClient } from './authClient';
import type { GamePlay, GamePlayInsert, Profile, ProfileInsert } from './types';

/** Postgres unique-violation code (handle already taken). */
export const PG_UNIQUE_VIOLATION = '23505';
/** Postgres check-constraint violation code (handle/display_name format). */
export const PG_CHECK_VIOLATION = '23514';

export interface ProfileResult {
  profile: Profile | null;
  /** A real load error (NOT "no row yet" — that surfaces as `profile: null`). */
  error: string | null;
}

/**
 * Load a single user's profile row, or `null` when they have not created one yet
 * (the guard treats a null profile as "needs profile creation"). `maybeSingle`
 * returns `null` data + no error for zero rows, so a missing profile is not an
 * error. RLS allows any authenticated user to read profiles.
 */
export async function fetchProfile(
  client: AuthClient,
  userId: string,
): Promise<ProfileResult> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  return { profile: (data as Profile | null) ?? null, error: null };
}

export interface CreateProfileResult {
  profile: Profile | null;
  error: string | null;
  /** True when the handle is already taken (unique violation) — UI hint. */
  handleTaken: boolean;
}

/**
 * Insert the caller's profile row (id = their auth user id; RLS enforces it).
 * Maps the DB unique-violation on `handle` to a friendly `handleTaken` flag so
 * the screen can show "that handle is taken" without leaking SQL.
 */
export async function createProfile(
  client: AuthClient,
  input: ProfileInsert,
): Promise<CreateProfileResult> {
  const { data, error } = await client
    .from('profiles')
    .insert(input)
    .select('*')
    .single();

  if (error) {
    const handleTaken = error.code === PG_UNIQUE_VIOLATION;
    return {
      profile: null,
      handleTaken,
      error: handleTaken
        ? 'That handle is already taken — pick another.'
        : error.message,
    };
  }
  return { profile: data as Profile, error: null, handleTaken: false };
}

/**
 * Read the signed-in user's own play history (most recent first), for the /you
 * stats. RLS restricts this to the caller's own rows.
 */
export async function fetchGamePlays(
  client: AuthClient,
  userId: string,
): Promise<{ plays: GamePlay[]; error: string | null }> {
  const { data, error } = await client
    .from('game_plays')
    .select('*')
    .eq('user_id', userId)
    .order('played_at', { ascending: false });

  if (error) return { plays: [], error: error.message };
  return { plays: (data as GamePlay[] | null) ?? [], error: null };
}

/**
 * Best-effort insert of one resolved-card play row. Never throws — gameplay must
 * never break if the write fails (offline, RLS, transient). Returns whether it
 * persisted so callers/tests can assert, but the feed ignores the result.
 */
export async function insertGamePlay(
  client: AuthClient,
  play: GamePlayInsert,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await client.from('game_plays').insert(play);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
