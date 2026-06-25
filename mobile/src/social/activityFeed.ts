/**
 * Pure shaping for the Home "Recent activity" rail (accounts pivot).
 *
 * Community activity — who recently liked or commented on which game — derived
 * from the cross-readable `game_likes` / `game_comments` + embedded `profiles`
 * (there is no follow graph yet, and `game_plays` is private per user). The
 * NETWORK read lives in `activityApi.ts`; this module is pure (no client, no
 * clock) so the merge/sort/dedup/limit is exhaustively unit-testable.
 *
 * POSITIONING GUARDRAIL (Design §7): activity is about playing games — handles,
 * avatars, game titles, like/comment verbs. No PII beyond the public profile.
 */

/** What a person did to a game. */
export type ActivityKind = 'like' | 'comment';

/**
 * A raw activity row as extracted from a `game_likes` / `game_comments` query
 * (author profile already flattened). The pure builder takes these so it never
 * depends on PostgREST's embedded-shape quirks.
 */
export interface RawActivityRow {
  kind: ActivityKind;
  /** Stable id: the comment id, or `<userId>:<cardId>` for a like. */
  id: string;
  userId: string | null;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  cardId: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** One rail item ready to render. */
export interface ActivityItem extends RawActivityRow {
  /** Friendly game title resolved from the catalog (e.g. "Spot it"). */
  gameTitle: string;
  /** Avatar monogram fallback (first letter of name/handle). */
  monogram: string;
}

export interface BuildActivityOptions {
  /** Max items to keep (after sort). Non-positive → keep all. */
  limit?: number;
  /** Drop this user's own activity so the rail shows OTHER people. */
  excludeUserId?: string | null;
  /** Resolve a cardId to a friendly game title; defaults to the raw id. */
  resolveTitle?: (cardId: string) => string;
}

/** Avatar monogram from a display name / handle. */
function monogramOf(displayName: string | null, handle: string | null): string {
  const source = (displayName ?? '').trim() || (handle ?? '').trim();
  return (source[0] ?? '?').toUpperCase();
}

/**
 * Merge like + comment rows into a single newest-first activity feed: drops rows
 * missing a card/timestamp, optionally excludes the viewer's own activity, sorts
 * by recency, dedupes by id, resolves a game title, and caps to `limit`.
 */
export function buildActivityFeed(
  rows: readonly RawActivityRow[],
  options: BuildActivityOptions = {},
): ActivityItem[] {
  const { limit = 12, excludeUserId = null, resolveTitle } = options;
  const seen = new Set<string>();
  const items: ActivityItem[] = [];

  const usable = rows
    .filter((r) => r && r.id && r.cardId && r.createdAt)
    .filter((r) => excludeUserId === null || r.userId !== excludeUserId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const row of usable) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push({
      ...row,
      gameTitle: resolveTitle ? resolveTitle(row.cardId) : row.cardId,
      monogram: monogramOf(row.displayName, row.handle),
    });
  }

  return limit > 0 ? items.slice(0, limit) : items;
}

/** A short human caption for one activity item, e.g. "@gridwise commented on Spot it". */
export function activityCaption(item: ActivityItem): string {
  const who = item.handle ? `@${item.handle}` : item.displayName ?? 'Someone';
  const verb = item.kind === 'like' ? 'liked' : 'commented on';
  return `${who} ${verb} ${item.gameTitle}`;
}
