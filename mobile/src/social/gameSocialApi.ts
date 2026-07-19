/**
 * Best-effort data layer for the per-game social surface (likes + comments).
 *
 * Reads/writes `public.game_likes` + `public.game_comments` (migration 0004)
 * through the Supabase {@link AuthClient}. Mirrors the never-throwing,
 * best-effort style of `feed/playedCardsApi.ts` and `profile/gameScoresApi.ts`:
 * gameplay must NEVER break because a social read/write failed — any failure
 * (signed out, offline, RLS, transient, malformed) degrades to the empty/zero
 * state.
 *
 * RLS does the security: any authenticated user may SELECT likes/comments
 * (public counts + who liked/commented); INSERT/DELETE are scoped to the
 * caller's own rows (`auth.uid() = user_id`). These helpers only shape the
 * request/response — the client is injected so they unit-test against a fake.
 *
 * Comment authors are EMBEDDED via a PostgREST `profiles(handle, display_name)`
 * select (the `user_id` FK targets `profiles(id)`), exposing only the public
 * profile fields — no extra PII.
 */
import type { AuthClient } from '../auth/authClient';
import { validateCommentBody } from './commentValidation';
import {
  EMPTY_SOCIAL,
  type AddCommentResult,
  type GameComment,
  type GameSocial,
} from './types';

/** The embedded-profile shape PostgREST returns (object or, defensively, array). */
type EmbeddedProfile =
  | { handle?: unknown; display_name?: unknown }
  | Array<{ handle?: unknown; display_name?: unknown }>
  | null
  | undefined;

/** One `game_comments` row with its embedded author profile, as selected. */
interface CommentRow {
  id?: unknown;
  body?: unknown;
  created_at?: unknown;
  user_id?: unknown;
  profiles?: EmbeddedProfile;
}

/** The columns we select for a comment, with the author profile embedded. */
const COMMENT_SELECT = 'id, body, created_at, user_id, profiles(handle, display_name)';

/** Narrow an embedded profile (object or single-element array) to one record. */
function firstProfile(
  profiles: EmbeddedProfile,
): { handle?: unknown; display_name?: unknown } | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

/** Coerce an unknown to a non-empty string, else null. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Shape one raw comment row into a UI {@link GameComment}; null if unusable. */
function shapeComment(row: CommentRow, viewerId: string | null): GameComment | null {
  const id = asString(row.id);
  const body = asString(row.body);
  const createdAt = asString(row.created_at);
  if (!id || !body || !createdAt) return null; // missing essentials → drop.
  const profile = firstProfile(row.profiles);
  const userId = asString(row.user_id);
  return {
    id,
    body,
    createdAt,
    authorHandle: profile ? asString(profile.handle) : null,
    authorDisplayName: profile ? asString(profile.display_name) : null,
    isOwn: viewerId !== null && userId === viewerId,
  };
}

/**
 * Load a card's full social state: like count, whether the viewer liked it, and
 * its comments (newest-first, authors embedded). Never throws — any failure
 * (incl. a signed-out viewer) resolves to {@link EMPTY_SOCIAL}.
 *
 * The like count uses a `head: true` COUNT query (no rows transferred); the
 * viewer's like is a targeted single-row lookup; comments come back ordered by
 * the `(card_id, created_at desc)` index. Each is independent and individually
 * tolerant, so a partial failure still yields whatever did load.
 */
export async function fetchGameSocial(
  client: AuthClient,
  cardId: string,
  userId: string | null,
): Promise<GameSocial> {
  if (!cardId) return EMPTY_SOCIAL;
  try {
    const [likeCount, viewerLiked, comments] = await Promise.all([
      fetchLikeCount(client, cardId),
      fetchViewerLiked(client, cardId, userId),
      fetchComments(client, cardId, userId),
    ]);
    return { likeCount, viewerLiked, comments };
  } catch {
    return EMPTY_SOCIAL;
  }
}

/** Exact like count for a card via a head-only COUNT query; 0 on any failure. */
async function fetchLikeCount(client: AuthClient, cardId: string): Promise<number> {
  try {
    const { count, error } = await client
      .from('game_likes')
      .select('user_id', { count: 'exact', head: true })
      .eq('card_id', cardId);
    if (error) return 0;
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

/** Whether `userId` has liked the card; false when signed out or on failure. */
async function fetchViewerLiked(
  client: AuthClient,
  cardId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await client
      .from('game_likes')
      .select('user_id')
      .eq('card_id', cardId)
      .eq('user_id', userId)
      .limit(1);
    if (error) return false;
    const rows = (data as unknown[] | null) ?? [];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** A card's comments, newest-first, authors embedded; [] on any failure. */
async function fetchComments(
  client: AuthClient,
  cardId: string,
  userId: string | null,
): Promise<GameComment[]> {
  try {
    const { data, error } = await client
      .from('game_comments')
      .select(COMMENT_SELECT)
      .eq('card_id', cardId)
      .order('created_at', { ascending: false });
    if (error) return [];
    const rows = (data as CommentRow[] | null) ?? [];
    const out: GameComment[] = [];
    for (const row of rows) {
      if (!row) continue;
      const shaped = shapeComment(row, userId);
      if (shaped) out.push(shaped);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Toggle the viewer's like on a card. `nextLiked` is the DESIRED state: true →
 * insert (idempotent on the `(user_id, card_id)` PK via upsert), false → delete.
 * Returns true on success, false on any failure (so the UI can revert an
 * optimistic toggle). No-op (false) when signed out.
 */
export async function toggleLike(
  client: AuthClient,
  cardId: string,
  userId: string | null,
  nextLiked: boolean,
): Promise<boolean> {
  if (!userId || !cardId) return false;
  try {
    if (nextLiked) {
      const { error } = await client
        .from('game_likes')
        // Idempotent: re-liking an already-liked card must not error on the PK.
        .upsert({ user_id: userId, card_id: cardId }, { onConflict: 'user_id,card_id' });
      return !error;
    }
    const { error } = await client
      .from('game_likes')
      .delete()
      .eq('user_id', userId)
      .eq('card_id', cardId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Add a comment to a card for the signed-in user. Validates + trims the body
 * client-side (1..280) BEFORE the network call, returning a friendly error for
 * empty/whitespace/over-cap input. On success returns the inserted comment
 * (shaped, marked `isOwn`, author = the viewer's profile if it embeds back).
 * Never throws — a network/RLS failure returns a friendly error.
 */
export async function addComment(
  client: AuthClient,
  cardId: string,
  userId: string | null,
  rawBody: string,
): Promise<AddCommentResult> {
  if (!userId) return { comment: null, error: 'Sign in to comment.' };
  if (!cardId) return { comment: null, error: 'Could not post your comment.' };

  const { body, error: invalid } = validateCommentBody(rawBody);
  if (invalid || body === null) {
    return { comment: null, error: invalid ?? 'Could not post your comment.' };
  }

  try {
    const { data, error } = await client
      .from('game_comments')
      .insert({ user_id: userId, card_id: cardId, body })
      .select(COMMENT_SELECT)
      .single();
    if (error) {
      return { comment: null, error: 'Could not post your comment. Try again.' };
    }
    const shaped = shapeComment((data as CommentRow) ?? {}, userId);
    if (!shaped) {
      return { comment: null, error: 'Could not post your comment. Try again.' };
    }
    return { comment: shaped, error: null };
  } catch {
    return { comment: null, error: 'Could not post your comment. Try again.' };
  }
}

/**
 * Delete one of the viewer's own comments. RLS guarantees only own rows delete.
 * Returns true on success, false on any failure (so the UI can revert). The
 * `user_id` filter is defensive — RLS already scopes deletes to the caller.
 */
export async function deleteComment(
  client: AuthClient,
  commentId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId || !commentId) return false;
  try {
    const { error } = await client
      .from('game_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}
