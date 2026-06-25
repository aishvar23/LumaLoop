/**
 * Best-effort data layer for the Home "Recent activity" rail (accounts pivot).
 *
 * Reads recent rows from the cross-readable `game_likes` + `game_comments`
 * (authors embedded from `profiles`) and folds them through the pure
 * {@link buildActivityFeed}. Mirrors the never-throwing style of
 * `gameSocialApi.ts`: a failure (signed out, offline, RLS, transient) degrades to
 * an empty rail — Home must never break because activity failed to load.
 *
 * RLS is the security boundary: any authenticated user may SELECT likes/comments
 * and profiles; this helper only shapes the request/response. The client is
 * injected so it unit-tests against a fake.
 */
import type { AuthClient } from '../auth/authClient';
import {
  buildActivityFeed,
  type ActivityItem,
  type RawActivityRow,
} from './activityFeed';

/** The embedded-profile shape PostgREST returns (object or, defensively, array). */
type EmbeddedProfile =
  | { handle?: unknown; display_name?: unknown; avatar_url?: unknown }
  | Array<{ handle?: unknown; display_name?: unknown; avatar_url?: unknown }>
  | null
  | undefined;

const PROFILE_EMBED = 'profiles(handle, display_name, avatar_url)';
const COMMENT_SELECT = `id, card_id, user_id, created_at, ${PROFILE_EMBED}`;
const LIKE_SELECT = `card_id, user_id, created_at, ${PROFILE_EMBED}`;

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

export interface FetchActivityOptions {
  /** Max rail items. */
  limit?: number;
  /** Exclude this user's own activity (so the rail shows other people). */
  excludeUserId?: string | null;
  /** Resolve a cardId to a friendly game title. */
  resolveTitle?: (cardId: string) => string;
}

/**
 * Load recent community activity (likes + comments), newest-first, authors
 * embedded. Never throws — any failure resolves to `[]`. Over-fetches each table
 * (2× the cap) so the merged, recency-sorted result has enough to fill `limit`.
 */
export async function fetchRecentActivity(
  client: AuthClient,
  options: FetchActivityOptions = {},
): Promise<ActivityItem[]> {
  const { limit = 12, excludeUserId = null, resolveTitle } = options;
  const perTable = Math.max(limit * 2, 10);
  try {
    const [comments, likes] = await Promise.all([
      fetchRows(client, 'game_comments', COMMENT_SELECT, perTable, 'comment'),
      fetchRows(client, 'game_likes', LIKE_SELECT, perTable, 'like'),
    ]);
    return buildActivityFeed([...comments, ...likes], {
      limit,
      excludeUserId,
      resolveTitle,
    });
  } catch {
    return [];
  }
}

/** Select recent rows from one social table and flatten to {@link RawActivityRow}. */
async function fetchRows(
  client: AuthClient,
  table: 'game_comments' | 'game_likes',
  select: string,
  limit: number,
  kind: RawActivityRow['kind'],
): Promise<RawActivityRow[]> {
  try {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    const rows = (data as unknown as Record<string, unknown>[] | null) ?? [];
    const out: RawActivityRow[] = [];
    for (const raw of rows) {
      if (!raw) continue;
      const cardId = asString(raw.card_id);
      const createdAt = asString(raw.created_at);
      const userId = asString(raw.user_id);
      if (!cardId || !createdAt) continue;
      const profile = firstProfile(raw.profiles as EmbeddedProfile);
      // Likes have no own id (composite PK) — synthesize a stable one.
      const id = kind === 'comment' ? asString(raw.id) : `${userId ?? 'anon'}:${cardId}`;
      if (!id) continue;
      out.push({
        kind,
        id,
        userId,
        handle: profile ? asString(profile.handle) : null,
        displayName: profile ? asString(profile.display_name) : null,
        avatarUrl: profile ? asString(profile.avatar_url) : null,
        cardId,
        createdAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}
