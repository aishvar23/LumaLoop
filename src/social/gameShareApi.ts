/**
 * Best-effort data layer for ephemeral game "status" shares (accounts pivot).
 *
 * Reads/writes `public.game_shares` (migration 0005) through the Supabase
 * {@link AuthClient}. Mirrors the never-throwing style of `gameSocialApi.ts`:
 * gameplay / Home must NEVER break because a share read/write failed — any
 * failure (signed out, offline, RLS, transient) degrades to a no-op / empty rail.
 *
 * RLS is the security + EPHEMERALITY boundary: the SELECT policy only exposes
 * shares from the last 24h (so they auto-expire), INSERT/DELETE are scoped to the
 * caller's own rows. These helpers only shape the request/response; the client is
 * injected so they unit-test against a fake. The sharer's profile is EMBEDDED via
 * PostgREST `profiles(...)` (the `user_id` FK targets `profiles(id)`), exposing
 * only the public profile fields.
 */
import type { AuthClient } from '../auth/authClient';
import type { RawShareRow, ShareOutcome } from './statusFeed';

/** The embedded-profile shape PostgREST returns (object or, defensively, array). */
type EmbeddedProfile =
  | { handle?: unknown; display_name?: unknown; avatar_url?: unknown }
  | Array<{ handle?: unknown; display_name?: unknown; avatar_url?: unknown }>
  | null
  | undefined;

const PROFILE_EMBED = 'profiles(handle, display_name, avatar_url)';
const SHARE_SELECT = `id, card_id, user_id, outcome, points, created_at, ${PROFILE_EMBED}`;

/** Narrow an embedded profile (object or single-element array) to one record. */
function firstProfile(profiles: EmbeddedProfile) {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

/** Coerce an unknown to a non-empty string, else null. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Coerce an unknown to a finite, non-negative integer (points), else 0. */
function asPoints(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/** Coerce an unknown to a valid outcome, defaulting to 'incorrect'. */
function asOutcome(value: unknown): ShareOutcome {
  return value === 'correct' || value === 'timeout' ? value : 'incorrect';
}

export interface ShareGameInput {
  userId: string | null;
  cardId: string;
  outcome: ShareOutcome;
  points: number;
}

/**
 * Post a share for the signed-in user. Best-effort: returns whether it persisted
 * so the UI can show a "Shared" state, but never throws. No-op when signed out.
 */
export async function shareGame(
  client: AuthClient,
  { userId, cardId, outcome, points }: ShareGameInput,
): Promise<{ ok: boolean }> {
  if (!userId || !cardId) return { ok: false };
  try {
    const { error } = await client.from('game_shares').insert({
      user_id: userId,
      card_id: cardId,
      outcome,
      points: asPoints(points),
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export interface FetchSharesOptions {
  /** Max raw rows to read (the rail groups these per user). */
  limit?: number;
  /**
   * Restrict to these sharer ids (e.g. the people you follow + yourself). When
   * omitted/empty the read is unfiltered (the community fallback).
   */
  userIds?: readonly string[];
}

/**
 * Load recent shares (newest-first, sharer profile embedded). RLS already bounds
 * the result to the last 24h. Optionally restricted to `userIds` (the following
 * feed). Never throws — any failure resolves to `[]`.
 */
export async function fetchRecentShares(
  client: AuthClient,
  { limit = 50, userIds }: FetchSharesOptions = {},
): Promise<RawShareRow[]> {
  try {
    let builder = client.from('game_shares').select(SHARE_SELECT);
    if (userIds && userIds.length > 0) {
      builder = builder.in('user_id', userIds);
    }
    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    const rows = (data as unknown as Record<string, unknown>[] | null) ?? [];
    const out: RawShareRow[] = [];
    for (const raw of rows) {
      if (!raw) continue;
      const id = asString(raw.id);
      const cardId = asString(raw.card_id);
      const createdAt = asString(raw.created_at);
      if (!id || !cardId || !createdAt) continue;
      const profile = firstProfile(raw.profiles as EmbeddedProfile);
      out.push({
        id,
        userId: asString(raw.user_id),
        handle: profile ? asString(profile.handle) : null,
        displayName: profile ? asString(profile.display_name) : null,
        avatarUrl: profile ? asString(profile.avatar_url) : null,
        cardId,
        outcome: asOutcome(raw.outcome),
        points: asPoints(raw.points),
        createdAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Delete one of the viewer's own shares (remove a status). RLS guarantees only
 * own rows delete; the `user_id` filter is defensive. Returns true on success.
 */
export async function deleteShare(
  client: AuthClient,
  id: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId || !id) return false;
  try {
    const { error } = await client
      .from('game_shares')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}
