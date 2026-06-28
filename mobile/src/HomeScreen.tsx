/**
 * Home / Discover landing screen for React Native (accounts pivot — mobile
 * parallel of web `src/profile/HomePage.tsx`).
 *
 * The DEFAULT surface a signed-in user lands on (before the feed), visually
 * distinct from the /you profile: a "Recent activity" stories rail, a bold
 * gradient-ish hero with the "Start playing" CTA, a slim stat strip, and a grid
 * of featured games. It replaces dropping straight into a game card on launch.
 *
 * Separation of concerns (CLAUDE.md §4): presentational only. Navigation is the
 * parent's job — `onStart` enters the feed, `onOpenProfile` opens /you (native has
 * no router; App.tsx owns the view toggle). Stats reuse the profile pipeline
 * ({@link fetchGamePlays} + ported {@link computeStats}); the activity rail reuses
 * the cross-readable social tables via {@link fetchRecentActivity} (no follow
 * graph yet — recent COMMUNITY activity). Featured tiles come from the pure
 * {@link selectFeaturedGames}.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): copy stays about playing games and
 * GAME activity — no IQ / brain-training / ability / clinical framing.
 */
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from './auth/AuthProvider';
import type { AuthClient } from './auth/authClient';
import { fetchGamePlays } from './auth/profileApi';
import { supabase } from './auth/supabaseClient';
import { getCardById as defaultGetCardById } from './core/cards/catalog';
import { selectFeaturedGames, templateLabel, type FeaturedGame } from './core/cards/featured';
import type { LiquidCard } from './core/cards/types';
import type { GamePlay } from './core/auth/types';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from './core/profile/computeStats';
import { fetchRecentShares } from './social/gameShareApi';
import { fetchFollowing } from './social/followApi';
import { groupSharesByUser, type UserStatus } from './social/statusFeed';
import StatusViewer from './social/StatusViewer';
import { authStyles as a } from './auth/authStyles';
import {
  categoryAccent,
  colors,
  fontSize,
  fontWeight,
  PAGE_BACKGROUND,
  radius,
  space,
} from './feed/templates/tokens';

export interface HomeScreenProps {
  /** Enter the feed ("Start playing"). */
  onStart: (cardId?: string) => void;
  /** Open the profile (/you equivalent). */
  onOpenProfile: () => void;
  /** Open the people-search screen. */
  onOpenSearch: () => void;
  /** Test seam: the Supabase client. Defaults to the auth provider's client. */
  client?: AuthClient;
  /** Test seam: the featured games to show. Defaults to the catalog selection. */
  featuredGames?: readonly FeaturedGame[];
  /** Test seam: preset status rail (skips the network read when provided). */
  statuses?: readonly UserStatus[];
  /** Test seam: cardId → card resolver for status game titles + accents. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
}

/** Ring colors cycled across story bubbles for an Instagram-like accent. */
const RING_TONES = [
  'processing_speed',
  'cognitive_flexibility',
  'visual_attention',
  'pattern_recognition',
  'working_memory',
] as const;

/** Format a category id ("visual_attention") into a label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The monogram for the avatar fallback (first letter of name/handle). */
function monogram(displayName: string, handle: string): string {
  const source = displayName.trim() || handle.trim();
  return (source[0] ?? '?').toUpperCase();
}

/** Two-letter monogram for a template label ("Spot it" → "SI"). */
function tileMonogram(label: string): string {
  return label
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function HomeScreen({
  onStart,
  onOpenProfile,
  onOpenSearch,
  client: clientProp,
  featuredGames,
  statuses: statusesProp,
  getCardById = defaultGetCardById,
}: HomeScreenProps) {
  const auth = useAuth();
  const { user, profile } = auth;
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<readonly UserStatus[]>(statusesProp ?? []);
  const [openStatus, setOpenStatus] = useState<UserStatus | null>(null);
  // "Upload puzzle" isn't built yet — pressing it shows a "coming soon" notice
  // that auto-dismisses after 2s.
  const [uploadNotice, setUploadNotice] = useState(false);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showComingSoon = () => {
    setUploadNotice(true);
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => setUploadNotice(false), 2000);
  };
  useEffect(
    () => () => {
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const playsRes = await fetchGamePlays(client, user.id);
      if (!active) return;
      setStats(computeStats(playsRes.plays as GamePlay[]));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, user]);

  // Recent ephemeral SHARES (statuses), grouped per user for the rail (skipped
  // when a test injects them). RLS bounds the read to the last 24h.
  useEffect(() => {
    if (statusesProp !== undefined) return;
    let active = true;
    void (async () => {
      // Following feed: if you follow anyone, show THEIR statuses + your own;
      // otherwise fall back to the whole community so the rail isn't empty.
      const following = user ? await fetchFollowing(client, user.id) : new Set<string>();
      if (!active) return;
      const rows =
        user && following.size > 0
          ? await fetchRecentShares(client, { userIds: [...following, user.id], limit: 60 })
          : await fetchRecentShares(client, { limit: 60 });
      if (!active) return;
      setStatuses(
        groupSharesByUser(rows, {
          viewerId: user?.id ?? null,
          resolveTitle: (cardId) => {
            const card = getCardById(cardId);
            return card ? templateLabel(card.templateType) : cardId;
          },
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [client, user, statusesProp, getCardById]);

  if (!profile) {
    return (
      <View style={styles.page}>
        <Text style={a.note}>No profile to show.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 48) + space.md },
      ]}
    >
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoLoop}>∞</Text>
          </View>
          <Text style={styles.brand}>Witzy</Text>
        </View>
        <View style={styles.topbarActions}>
          {/* Find other users to follow. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find people"
            testID="home-search"
            onPress={onOpenSearch}
            style={styles.searchBtn}
          >
            <Text style={styles.searchIcon}>🔍</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            testID="home-open-profile"
            onPress={onOpenProfile}
          >
            {profile.avatar_url ? (
              <Image
                style={styles.avatar}
                source={{ uri: profile.avatar_url }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {monogram(profile.display_name, profile.handle)}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {statuses.length > 0 && (
        <View accessibilityLabel="Recent activity">
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stories}
          >
            {statuses.map((status, index) => {
              const ring = categoryAccent(RING_TONES[index % RING_TONES.length]).accent;
              const who = status.handle
                ? `@${status.handle}`
                : status.displayName ?? 'Someone';
              const count = status.items.length;
              return (
                <Pressable
                  key={status.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`${status.isOwn ? 'Your' : `${who}’s`} status — ${count} shared ${count === 1 ? 'game' : 'games'}`}
                  testID={`home-status-${status.userId}`}
                  onPress={() => setOpenStatus(status)}
                  style={styles.story}
                >
                  <View style={[styles.storyRing, { borderColor: ring }]}>
                    {status.avatarUrl ? (
                      <Image
                        style={styles.storyAvatar}
                        source={{ uri: status.avatarUrl }}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={styles.storyAvatar}>
                        <Text style={styles.storyAvatarText}>{status.monogram}</Text>
                      </View>
                    )}
                    {count > 1 && <Text style={styles.storyBadge}>{count}</Text>}
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>
                    {status.isOwn ? 'Your status' : who}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.hero}>
        <Text style={styles.greeting}>Hi {profile.display_name}! 🎮</Text>
        <Text style={styles.subtitle}>Ready for today’s puzzles?</Text>
        <View style={styles.heroCta}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play now"
            testID="home-start"
            onPress={() => onStart()}
            style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
          >
            <LinearGradient
              colors={['#3fd6c9', '#5b8cff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaIcon}
            >
              <Text style={styles.ctaIconText}>▶</Text>
            </LinearGradient>
            <Text style={styles.ctaText}>Play now</Text>
          </Pressable>
          <View style={styles.ctaWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload puzzle"
              testID="home-upload"
              onPress={showComingSoon}
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
            >
              <LinearGradient
                colors={['#ff7eb6', '#9d7bff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaIcon}
              >
                <Text style={styles.ctaIconText}>＋</Text>
              </LinearGradient>
              <Text style={styles.ctaText}>Upload puzzle</Text>
            </Pressable>
            {uploadNotice ? (
              <View style={styles.pop} pointerEvents="none" accessibilityRole="alert">
                <View style={styles.popBubble}>
                  <Text style={styles.popText}>Coming soon ✨</Text>
                </View>
                <View style={styles.popTail} />
              </View>
            ) : null}
          </View>
        </View>
        {!loading && (
          <View style={styles.statStrip} accessibilityLabel="Your game activity">
            <StatChip icon="🎮" value={String(stats.gamesPlayed)} label="Games played" />
            <StatChip icon="🎯" value={formatAccuracy(stats.accuracy)} label="Accuracy" />
            <StatChip icon="🔥" value={String(stats.bestStreak)} label="Best streak" />
            <StatChip icon="⭐" value={String(stats.totalPoints)} label="Total points" />
          </View>
        )}
      </View>

      <View accessibilityLabel="Featured games" style={styles.featured}>
        <Text style={styles.sectionTitle}>Featured games</Text>
        <View style={styles.featuredGrid}>
          {featured.map((game) => {
            const accent = categoryAccent(game.category).accent;
            return (
              <Pressable
                key={game.templateType}
                accessibilityRole="button"
                accessibilityLabel={`${game.label} — play`}
                testID={`home-tile-${game.templateType}`}
                onPress={() => onStart(game.cardId)}
                style={[styles.tile, { backgroundColor: accent }]}
              >
                <View style={styles.tileMonogram}>
                  <Text style={styles.tileMonogramText}>{tileMonogram(game.label)}</Text>
                </View>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {game.label}
                </Text>
                <Text style={styles.tileMeta} numberOfLines={1}>
                  {categoryLabel(game.category)} · ~{game.estimatedSeconds}s
                </Text>
                <Text style={styles.tilePlay}>Play ▸</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {openStatus && (
        <StatusViewer
          status={openStatus}
          categoryForCard={(cardId) => getCardById(cardId)?.category}
          onClose={() => setOpenStatus(null)}
          onPlay={(item) => {
            setOpenStatus(null);
            onStart(item.cardId);
          }}
        />
      )}
    </ScrollView>
  );
}

function StatChip({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipIcon}>{icon}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PAGE_BACKGROUND,
  },
  content: {
    padding: space.xl,
    gap: space.xl,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#7b54d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLoop: {
    color: '#fff',
    fontSize: 24,
    fontWeight: fontWeight.bold,
    marginTop: -2,
  },
  brand: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    letterSpacing: -0.3,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    fontSize: fontSize.md,
  },
  topbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  // Hero CTA row: "Play now" + "Upload puzzle" side by side.
  heroCta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
  },
  ctaWrap: { position: 'relative' },
  // Both CTAs share the SAME format: a bold white pill with a gradient icon chip.
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingLeft: space.sm,
    paddingRight: space.lg,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaBtnPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
  ctaIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconText: { color: '#fff', fontSize: 15, fontWeight: fontWeight.bold },
  ctaText: { color: '#1a1330', fontSize: fontSize.md, fontWeight: fontWeight.bold },
  // "Coming soon" popover — pops OUT of the Upload button (above it, with a tail).
  pop: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  popBubble: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: '#15101f',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  popText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  popTail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#15101f',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  // Stories rail.
  stories: {
    flexDirection: 'row',
    gap: space.lg,
    paddingVertical: space.xs,
  },
  story: {
    width: 64,
    alignItems: 'center',
    gap: space.xs,
  },
  storyRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  storyBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    minWidth: 20,
    height: 20,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 18,
    color: '#fff',
    fontWeight: fontWeight.bold,
    backgroundColor: '#ff5d8f',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
  storyName: {
    maxWidth: '100%',
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  // Hero — vivid playful panel.
  hero: {
    gap: space.md,
    padding: space.xl,
    borderRadius: 28,
    backgroundColor: '#5a52e0',
  },
  greeting: {
    color: '#fff',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.md,
  },
  // Slim stat strip (on the colored hero).
  statStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  statChipIcon: {
    fontSize: fontSize.sm,
  },
  statChipValue: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  statChipLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
  },
  // Featured games.
  featured: {
    gap: space.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: space.sm,
  },
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 132,
    gap: space.sm,
    padding: space.lg,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  tileMonogram: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tileMonogramText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  tileTitle: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  tileMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
  },
  tilePlay: {
    marginTop: 'auto',
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
});
