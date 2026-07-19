/**
 * Shared types for the per-game social layer (likes + comments).
 *
 * These mirror `public.game_likes` and `public.game_comments`
 * (`supabase/migrations/0004_game_likes_comments.sql`) as the app consumes them.
 * A comment EMBEDS its author's public profile fields (handle/display name) via
 * a PostgREST `profiles(...)` select — only the public fields the `profiles` RLS
 * already exposes; no extra PII.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): these are plain SOCIAL signals on a
 * game (a "like", a "comment") — never framed as an ability / IQ / trait /
 * clinical measure.
 */

/** The hard length cap on a comment body, matching the DB CHECK (1..280). */
export const COMMENT_MAX_LENGTH = 280;

/** A single comment, shaped for the UI (camelCase, author flattened). */
export interface GameComment {
  /** The comment row id (uuid). */
  id: string;
  /** The comment text (1..280 chars). */
  body: string;
  /** ISO timestamp the comment was created. */
  createdAt: string;
  /** The author's public `@handle` (without leading `@`), or null if missing. */
  authorHandle: string | null;
  /** The author's public display name, or null if missing. */
  authorDisplayName: string | null;
  /** True when the comment belongs to the viewing user (can delete it). */
  isOwn: boolean;
}

/** A card's social state, loaded when the card becomes active in the feed. */
export interface GameSocial {
  /** Total likes for the card (public count). */
  likeCount: number;
  /** Whether the viewing user has liked the card. */
  viewerLiked: boolean;
  /** The card's comments, newest-first. */
  comments: GameComment[];
}

/** The empty/zero social state — the best-effort fallback on any failure. */
export const EMPTY_SOCIAL: GameSocial = {
  likeCount: 0,
  viewerLiked: false,
  comments: [],
};

/** Outcome of validating + adding a comment. */
export interface AddCommentResult {
  /** The inserted comment (shaped) on success; null on failure/invalid. */
  comment: GameComment | null;
  /** A friendly, user-facing error message; null on success. */
  error: string | null;
}
