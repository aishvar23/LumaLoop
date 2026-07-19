/**
 * Best-effort data layer for the follow graph (accounts pivot, Phase 2/3).
 *
 * Reads/writes `public.follows` (migration 0006) through the Supabase
 * {@link AuthClient}. Mirrors the never-throwing style of `gameShareApi.ts`: the UI
 * must never break because a follow read/write failed — any failure (signed out,
 * offline, RLS, transient) degrades to a no-op / empty result.
 *
 * RLS is the security boundary: follows are PUBLIC-readable (counts + "do I follow
 * X?"), but a user may only insert/delete edges where they are the FOLLOWER. The
 * client is injected so each helper unit-tests against a fake.
 */
import type { AuthClient } from '../auth/authClient';

export interface FollowInput {
  followerId: string | null;
  followeeId: string;
}

/** Follow a user (idempotent on the (follower, followee) PK). No-op on self/empty. */
export async function followUser(
  client: AuthClient,
  { followerId, followeeId }: FollowInput,
): Promise<{ ok: boolean }> {
  if (!followerId || !followeeId || followerId === followeeId) return { ok: false };
  try {
    const { error } = await client
      .from('follows')
      .upsert(
        { follower_id: followerId, followee_id: followeeId },
        { onConflict: 'follower_id,followee_id' },
      );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Unfollow a user. Returns true on success; no-op (false) on empty input. */
export async function unfollowUser(
  client: AuthClient,
  { followerId, followeeId }: FollowInput,
): Promise<{ ok: boolean }> {
  if (!followerId || !followeeId) return { ok: false };
  try {
    const { error } = await client
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('followee_id', followeeId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** The set of user ids `userId` follows. Empty on signed-out / error. */
export async function fetchFollowing(
  client: AuthClient,
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await client
      .from('follows')
      .select('followee_id')
      .eq('follower_id', userId);
    if (error) return new Set();
    const out = new Set<string>();
    for (const row of (data as { followee_id?: unknown }[] | null) ?? []) {
      if (typeof row?.followee_id === 'string') out.add(row.followee_id);
    }
    return out;
  } catch {
    return new Set();
  }
}

/** Whether `followerId` follows `followeeId`. False on signed-out / error. */
export async function isFollowing(
  client: AuthClient,
  followerId: string | null,
  followeeId: string,
): Promise<boolean> {
  if (!followerId || !followeeId) return false;
  try {
    const { data, error } = await client
      .from('follows')
      .select('followee_id')
      .eq('follower_id', followerId)
      .eq('followee_id', followeeId)
      .limit(1);
    if (error) return false;
    return (((data as unknown[] | null) ?? []).length > 0);
  } catch {
    return false;
  }
}

export interface FollowCounts {
  followers: number;
  following: number;
}

/** A user's follower + following counts (head-only COUNT queries). Zero on error. */
export async function fetchFollowCounts(
  client: AuthClient,
  userId: string | null,
): Promise<FollowCounts> {
  if (!userId) return { followers: 0, following: 0 };
  try {
    const [followersRes, followingRes] = await Promise.all([
      client
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('followee_id', userId),
      client
        .from('follows')
        .select('followee_id', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ]);
    return {
      followers: typeof followersRes.count === 'number' ? followersRes.count : 0,
      following: typeof followingRes.count === 'number' ? followingRes.count : 0,
    };
  } catch {
    return { followers: 0, following: 0 };
  }
}
