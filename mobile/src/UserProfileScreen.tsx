/**
 * Another user's public profile for React Native (accounts pivot, Phase 2/3) —
 * the RN counterpart of web `src/social/UserProfilePage.tsx`.
 *
 * Avatar / handle / bio, follower+following counts, a {@link FollowButton}, their
 * PUBLIC game-stats aggregate (not raw plays), and their live (24h) statuses (tap
 * opens the shared {@link StatusViewer}). Provides the {@link SocialConfigProvider}
 * so the follow button gets the client + viewer id.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from './auth/AuthProvider';
import type { AuthClient } from './auth/authClient';
import { supabase } from './auth/supabaseClient';
import { getCardById as defaultGetCardById } from './core/cards/catalog';
import { templateLabel } from './core/cards/featured';
import { formatAccuracy } from './core/profile/computeStats';
import FollowButton from './social/FollowButton';
import { fetchFollowCounts, type FollowCounts } from './social/followApi';
import { fetchRecentShares } from './social/gameShareApi';
import { SocialConfigProvider } from './social/SocialContext';
import StatusViewer from './social/StatusViewer';
import { groupSharesByUser, type UserStatus } from './social/statusFeed';
import {
  fetchProfileById,
  fetchPublicStats,
  publicAccuracy,
  type ProfileLite,
  type PublicStats,
} from './social/userDiscoveryApi';
import {
  categoryAccent,
  colors,
  fontSize,
  fontWeight,
  PAGE_BACKGROUND,
  radius,
  space,
} from './feed/templates/tokens';

const EMPTY_COUNTS: FollowCounts = { followers: 0, following: 0 };
const EMPTY_STATS: PublicStats = { gamesPlayed: 0, correctCount: 0, totalPoints: 0 };

export interface UserProfileScreenProps {
  userId: string;
  onBack: () => void;
  /** Enter the feed to play a shared game (from a status). */
  onStart: (cardId?: string) => void;
  client?: AuthClient;
}

export default function UserProfileScreen({
  userId,
  onBack,
  onStart,
  client: clientProp,
}: UserProfileScreenProps) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const viewerId = auth.user?.id ?? null;

  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [counts, setCounts] = useState<FollowCounts>(EMPTY_COUNTS);
  const [stats, setStats] = useState<PublicStats>(EMPTY_STATS);
  const [statuses, setStatuses] = useState<readonly UserStatus[]>([]);
  const [openStatus, setOpenStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      const [p, c, s, rows] = await Promise.all([
        fetchProfileById(client, userId),
        fetchFollowCounts(client, userId),
        fetchPublicStats(client, userId),
        fetchRecentShares(client, { userIds: [userId] }),
      ]);
      if (!active) return;
      setProfile(p);
      setCounts(c);
      setStats(s);
      setStatuses(
        groupSharesByUser(rows, {
          viewerId: null,
          resolveTitle: (cardId) => {
            const card = defaultGetCardById(cardId);
            return card ? templateLabel(card.templateType) : cardId;
          },
        }),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, userId]);

  const pad = { paddingTop: Math.max(insets.top, 48) + space.md };
  const status = statuses[0];

  return (
    <SocialConfigProvider value={{ client, userId: viewerId }}>
      <ScrollView style={styles.page} contentContainerStyle={[styles.content, pad]}>
        <Pressable accessibilityRole="button" testID="user-back" onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Find people</Text>
        </Pressable>

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : !profile ? (
          <Text style={styles.empty}>User not found.</Text>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatar}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} accessibilityIgnoresInvertColors />
                ) : (
                  <Text style={styles.avatarText}>{(profile.displayName[0] ?? '?').toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.id}>
                <Text style={styles.name}>{profile.displayName}</Text>
                <Text style={styles.handle}>@{profile.handle}</Text>
              </View>
              <FollowButton targetUserId={profile.id} />
            </View>

            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.counts}>
              <Text style={styles.countText}>
                <Text style={styles.countStrong} testID="followers-count">
                  {counts.followers}
                </Text>{' '}
                followers
              </Text>
              <Text style={styles.countText}>
                <Text style={styles.countStrong} testID="following-count">
                  {counts.following}
                </Text>{' '}
                following
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <Stat value={String(stats.gamesPlayed)} label="Games" tone="visual_attention" />
              <Stat value={formatAccuracy(publicAccuracy(stats))} label="Accuracy" tone="logical_reasoning" />
              <Stat value={String(stats.totalPoints)} label="Points" tone="processing_speed" />
            </View>

            {status ? (
              <View style={styles.statusSection} accessibilityLabel="Active statuses">
                <Text style={styles.sectionTitle}>Active statuses</Text>
                <Pressable
                  testID="user-status-bubble"
                  accessibilityRole="button"
                  onPress={() => setOpenStatus(status)}
                  style={styles.statusBubble}
                >
                  <View style={styles.statusRing}>
                    <Text style={styles.statusMono}>
                      {(profile.displayName[0] ?? '?').toUpperCase()}
                    </Text>
                    {status.items.length > 1 ? (
                      <Text style={styles.statusBadge}>{status.items.length}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.statusLabel}>
                    {status.items.length === 1 ? '1 game' : `${status.items.length} games`}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}

        {openStatus ? (
          <StatusViewer
            status={openStatus}
            categoryForCard={(cardId) => defaultGetCardById(cardId)?.category}
            onClose={() => setOpenStatus(null)}
            onPlay={(item) => {
              setOpenStatus(null);
              onStart(item.cardId);
            }}
          />
        ) : null}
      </ScrollView>
    </SocialConfigProvider>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  const accent = categoryAccent(tone).accent;
  return (
    <View style={styles.stat}>
      <View style={[styles.statStripe, { backgroundColor: accent }]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE_BACKGROUND },
  content: { padding: space.xl, gap: space.lg },
  back: { color: colors.accent, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatar,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: colors.accentContrast, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  id: { flex: 1 },
  name: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  handle: { color: colors.textMuted, fontSize: fontSize.md },
  bio: { color: colors.text, fontSize: fontSize.md },
  counts: { flexDirection: 'row', gap: space.xl },
  countText: { color: colors.textMuted, fontSize: fontSize.sm },
  countStrong: { color: colors.text, fontWeight: fontWeight.bold },
  statsGrid: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  statStripe: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  statValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.heavy },
  statLabel: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: space.xs },
  statusSection: { gap: space.sm },
  sectionTitle: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  statusBubble: { alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  statusRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#ff7eb6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  statusMono: { color: colors.text, fontWeight: fontWeight.bold },
  statusBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    minWidth: 20,
    height: 20,
    textAlign: 'center',
    color: '#fff',
    fontSize: 11,
    fontWeight: fontWeight.bold,
    backgroundColor: '#ff5d8f',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  statusLabel: { color: colors.textMuted, fontSize: fontSize.sm },
});
