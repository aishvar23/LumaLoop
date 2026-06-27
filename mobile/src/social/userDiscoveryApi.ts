/**
 * Best-effort data layer for user discovery (accounts pivot, Phase 2/3):
 * searching profiles, loading another user's public profile, and their public
 * game-stats aggregate.
 *
 * Reads `public.profiles` (public-readable) and the `public.user_public_stats`
 * view (migration 0006 — aggregates only, no raw plays). Never throws: any failure
 * degrades to an empty result. The client is injected so each helper unit-tests
 * against a fake.
 *
 * POSITIONING GUARDRAIL (Design §7): public stats are GAME activity (games played,
 * accuracy, points) — never an ability / IQ / trait / clinical measure.
 */
import type { AuthClient } from '../auth/authClient';

/** The public-profile fields used by search results + the user-profile header. */
export interface ProfileLite {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

/** A user's public game-stats aggregate (accuracy derived client-side). */
export interface PublicStats {
  gamesPlayed: number;
  correctCount: number;
  totalPoints: number;
}

const PROFILE_COLS = 'id, handle, display_name, avatar_url, bio';
const EMPTY_STATS: PublicStats = { gamesPlayed: 0, correctCount: 0, totalPoints: 0 };

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asCount(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function shapeProfile(row: Record<string, unknown>): ProfileLite | null {
  const id = asString(row.id);
  const handle = asString(row.handle);
  if (!id || !handle) return null;
  return {
    id,
    handle,
    displayName: asString(row.display_name) ?? handle,
    avatarUrl: asString(row.avatar_url),
    bio: asString(row.bio),
  };
}

export interface SearchOptions {
  limit?: number;
  /** Drop this user (the viewer) from results. */
  excludeUserId?: string | null;
}

/**
 * Search profiles by handle or display name (case-insensitive substring). Returns
 * `[]` for an empty/whitespace query. The query is sanitised to handle-safe
 * characters so it can never break the PostgREST `or(...)` filter syntax.
 */
export async function searchProfiles(
  client: AuthClient,
  query: string,
  { limit = 20, excludeUserId = null }: SearchOptions = {},
): Promise<ProfileLite[]> {
  const safe = query.trim().replace(/[^a-zA-Z0-9_ ]/g, '');
  if (safe.length === 0) return [];
  try {
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_COLS)
      .or(`handle.ilike.*${safe}*,display_name.ilike.*${safe}*`)
      .limit(limit);
    if (error) return [];
    const out: ProfileLite[] = [];
    for (const raw of (data as Record<string, unknown>[] | null) ?? []) {
      const p = raw ? shapeProfile(raw) : null;
      if (p && p.id !== excludeUserId) out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

/** Load a single user's public profile, or null on error / not found. */
export async function fetchProfileById(
  client: AuthClient,
  id: string | null,
): Promise<ProfileLite | null> {
  if (!id) return null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return shapeProfile(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Load a user's public game-stats aggregate. Calls the SECURITY DEFINER function
 * `user_public_stats(target)` (migration 0007) — it returns ONLY the aggregate
 * (counts + points), never raw plays. Zeroes on error / no plays.
 */
export async function fetchPublicStats(
  client: AuthClient,
  id: string | null,
): Promise<PublicStats> {
  if (!id) return EMPTY_STATS;
  try {
    const { data, error } = await client.rpc('user_public_stats', { target: id });
    if (error || !data) return EMPTY_STATS;
    // The table-returning function yields rows; take the single aggregate row.
    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | undefined;
    if (!row) return EMPTY_STATS;
    return {
      gamesPlayed: asCount(row.games_played),
      correctCount: asCount(row.correct_count),
      totalPoints: asCount(row.total_points),
    };
  } catch {
    return EMPTY_STATS;
  }
}

/** Accuracy in [0,1] from a public stats aggregate (0 when no games). */
export function publicAccuracy(stats: PublicStats): number {
  return stats.gamesPlayed > 0 ? stats.correctCount / stats.gamesPlayed : 0;
}
