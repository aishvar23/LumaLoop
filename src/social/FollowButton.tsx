/**
 * Follow / Unfollow toggle (accounts pivot, Phase 2/3).
 *
 * A small button that follows or unfollows `targetUserId` for the signed-in user.
 * Reads the social config ({@link useSocialConfig}) for the client + viewer id;
 * renders NOTHING for your own id or when signed out (so it's safe to drop next to
 * any profile/search row). Optimistic: it flips state immediately and reverts on
 * failure. Best-effort underlying writes never throw (`followApi`).
 */
import { useEffect, useState } from 'react';

import { useSocialConfig } from './SocialContext';
import { followUser, isFollowing as fetchIsFollowing, unfollowUser } from './followApi';
import './FollowButton.css';

export interface FollowButtonProps {
  /** The user to follow/unfollow. */
  targetUserId: string;
  /** Test/seed seam: initial following state (skips the read when provided). */
  initialFollowing?: boolean;
  /** Notified after a successful toggle (e.g. to refresh follower counts). */
  onChange?: (following: boolean) => void;
}

export default function FollowButton({
  targetUserId,
  initialFollowing,
  onChange,
}: FollowButtonProps) {
  const config = useSocialConfig();
  const userId = config?.userId ?? null;
  const client = config?.client ?? null;
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [busy, setBusy] = useState(false);

  // Resolve the current relationship once (unless seeded), best-effort.
  useEffect(() => {
    if (initialFollowing !== undefined) return;
    if (!client || !userId || userId === targetUserId) return;
    let active = true;
    void (async () => {
      const f = await fetchIsFollowing(client, userId, targetUserId);
      if (active) setFollowing(f);
    })();
    return () => {
      active = false;
    };
  }, [client, userId, targetUserId, initialFollowing]);

  // No config / signed out / your own id → render nothing.
  if (!client || !userId || userId === targetUserId) return null;

  async function toggle() {
    if (busy || !client || !userId) return;
    setBusy(true);
    const nextState = !following;
    setFollowing(nextState); // optimistic
    const res = nextState
      ? await followUser(client, { followerId: userId, followeeId: targetUserId })
      : await unfollowUser(client, { followerId: userId, followeeId: targetUserId });
    if (!res.ok) {
      setFollowing(!nextState); // revert
    } else {
      onChange?.(nextState);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      className={`follow-btn${following ? ' follow-btn--on' : ''}`}
      data-testid="follow-button"
      data-following={following ? 'true' : 'false'}
      aria-pressed={following}
      disabled={busy}
      onClick={toggle}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
