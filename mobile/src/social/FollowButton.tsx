/**
 * Follow / Unfollow toggle for React Native (accounts pivot, Phase 2/3) — the RN
 * counterpart of web `src/social/FollowButton.tsx`.
 *
 * Reads {@link useSocialConfig} for the client + viewer id; renders NOTHING for
 * your own id or when signed out. Optimistic; best-effort writes never throw.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSocialConfig } from './SocialContext';
import { followUser, isFollowing as fetchIsFollowing, unfollowUser } from './followApi';
import { colors, fontSize, fontWeight, radius, space } from '../feed/templates/tokens';

export interface FollowButtonProps {
  targetUserId: string;
  initialFollowing?: boolean;
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

  if (!client || !userId || userId === targetUserId) return null;

  async function toggle() {
    if (busy || !client || !userId) return;
    setBusy(true);
    const nextState = !following;
    setFollowing(nextState);
    const res = nextState
      ? await followUser(client, { followerId: userId, followeeId: targetUserId })
      : await unfollowUser(client, { followerId: userId, followeeId: targetUserId });
    if (!res.ok) setFollowing(!nextState);
    else onChange?.(nextState);
    setBusy(false);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={following ? 'Following' : 'Follow'}
      accessibilityState={{ selected: following, busy }}
      testID="follow-button"
      disabled={busy}
      onPress={toggle}
      style={[styles.btn, following && styles.btnOn]}
    >
      <Text style={[styles.text, following && styles.textOn]}>
        {following ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.accent,
  },
  btnOn: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  text: {
    color: colors.accentContrast,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  textOn: {
    color: colors.textMuted,
  },
});
