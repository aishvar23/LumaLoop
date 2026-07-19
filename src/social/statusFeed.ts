/**
 * Pure shaping for the Home "Recent activity" status rail (accounts pivot).
 *
 * Ephemeral game "status" shares — what a user shared after playing — grouped per
 * user (WhatsApp/IG style: one bubble per user, even with several shares). The
 * NETWORK read + 24h expiry live in `gameShareApi.ts` + the DB RLS window; this
 * module is pure (no client, no clock) so the grouping/ordering is exhaustively
 * unit-testable.
 *
 * POSITIONING GUARDRAIL (Design §7): shares are about playing games — handles,
 * game titles, outcomes, points. No PII beyond the public profile.
 */

/** A resolution outcome, mirrored from the templates contract. */
export type ShareOutcome = 'correct' | 'incorrect' | 'timeout';

/**
 * A raw share row as extracted from a `game_shares` query (author profile already
 * flattened). The pure builder takes these so it never depends on PostgREST's
 * embedded-shape quirks.
 */
export interface RawShareRow {
  id: string;
  userId: string | null;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  cardId: string;
  outcome: ShareOutcome;
  points: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** One shared game within a user's status. */
export interface ShareItem {
  id: string;
  cardId: string;
  /** Friendly game title resolved from the catalog (e.g. "Spot it"). */
  gameTitle: string;
  outcome: ShareOutcome;
  /** Human outcome word ("solved" / "played" / "timed out"). */
  outcomeLabel: string;
  points: number;
  createdAt: string;
}

/** All of one user's recent shares, grouped into a single status (one bubble). */
export interface UserStatus {
  userId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Avatar monogram fallback (first letter of name/handle). */
  monogram: string;
  /** True when this is the viewer's own status (sorted first, like IG). */
  isOwn: boolean;
  /** ISO timestamp of the most recent share (drives rail ordering). */
  latestAt: string;
  /** This user's shares, newest-first. */
  items: ShareItem[];
}

export interface GroupSharesOptions {
  /** Resolve a cardId to a friendly game title; defaults to the raw id. */
  resolveTitle?: (cardId: string) => string;
  /** The viewer's user id — their own status sorts first ("your story"). */
  viewerId?: string | null;
  /** Max users (bubbles) to keep. Non-positive → keep all. */
  limit?: number;
}

/** Map a resolution outcome to a short human word. */
export function outcomeLabel(outcome: ShareOutcome): string {
  if (outcome === 'correct') return 'solved';
  if (outcome === 'timeout') return 'timed out';
  return 'played';
}

/** A short summary of one shared game, e.g. "Spot it · solved +120". */
export function shareSummary(item: ShareItem): string {
  const points = item.points > 0 ? ` +${item.points}` : '';
  return `${item.gameTitle} · ${item.outcomeLabel}${points}`;
}

/** Avatar monogram from a display name / handle. */
function monogramOf(displayName: string | null, handle: string | null): string {
  const source = (displayName ?? '').trim() || (handle ?? '').trim();
  return (source[0] ?? '?').toUpperCase();
}

/**
 * Group share rows into per-user statuses: drops rows missing a user/card/
 * timestamp, collapses each user's shares into one status (items newest-first),
 * and sorts statuses by recency — with the VIEWER's own status first (IG "your
 * story"). Caps to `limit` users.
 */
export function groupSharesByUser(
  rows: readonly RawShareRow[],
  options: GroupSharesOptions = {},
): UserStatus[] {
  const { resolveTitle, viewerId = null, limit = 20 } = options;
  const byUser = new Map<string, UserStatus>();
  const seenItem = new Set<string>();

  for (const row of rows) {
    if (!row || !row.id || !row.userId || !row.cardId || !row.createdAt) continue;
    if (seenItem.has(row.id)) continue;
    seenItem.add(row.id);

    const item: ShareItem = {
      id: row.id,
      cardId: row.cardId,
      gameTitle: resolveTitle ? resolveTitle(row.cardId) : row.cardId,
      outcome: row.outcome,
      outcomeLabel: outcomeLabel(row.outcome),
      points: row.points,
      createdAt: row.createdAt,
    };

    const existing = byUser.get(row.userId);
    if (existing) {
      existing.items.push(item);
      if (item.createdAt > existing.latestAt) existing.latestAt = item.createdAt;
    } else {
      byUser.set(row.userId, {
        userId: row.userId,
        handle: row.handle,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        monogram: monogramOf(row.displayName, row.handle),
        isOwn: viewerId !== null && row.userId === viewerId,
        latestAt: item.createdAt,
        items: [item],
      });
    }
  }

  const statuses = [...byUser.values()];
  for (const status of statuses) {
    status.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  statuses.sort((a, b) => {
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1; // own first.
    return b.latestAt.localeCompare(a.latestAt);
  });

  return limit > 0 ? statuses.slice(0, limit) : statuses;
}
