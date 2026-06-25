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
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { fetchRecentActivity } from './social/activityApi';
import { activityCaption, type ActivityItem } from './social/activityFeed';
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
  onStart: () => void;
  /** Open the profile (/you equivalent). */
  onOpenProfile: () => void;
  /** Test seam: the Supabase client. Defaults to the auth provider's client. */
  client?: AuthClient;
  /** Test seam: the featured games to show. Defaults to the catalog selection. */
  featuredGames?: readonly FeaturedGame[];
  /** Test seam: preset activity items (skips the network read when provided). */
  activityItems?: readonly ActivityItem[];
  /** Test seam: cardId → card resolver for activity game titles. */
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
  client: clientProp,
  featuredGames,
  activityItems,
  getCardById = defaultGetCardById,
}: HomeScreenProps) {
  const auth = useAuth();
  const { user, profile } = auth;
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<readonly ActivityItem[]>(activityItems ?? []);
  const [uploadNotice, setUploadNotice] = useState(false);

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

  // Recent COMMUNITY activity for the stories rail (skipped when a test injects it).
  useEffect(() => {
    if (activityItems !== undefined) return;
    let active = true;
    void (async () => {
      const items = await fetchRecentActivity(client, {
        // Prototype: there's no follow graph yet and often a single account, so
        // INCLUDE the viewer's own recent activity (like IG showing "your story")
        // — otherwise the rail is empty until other users exist. Pass the viewer
        // id here to switch to "others only" once there's a real community.
        excludeUserId: null,
        resolveTitle: (cardId) => {
          const card = getCardById(cardId);
          return card ? templateLabel(card.templateType) : cardId;
        },
      });
      if (active) setActivity(items);
    })();
    return () => {
      active = false;
    };
  }, [client, user, activityItems, getCardById]);

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
        <Text style={styles.brand}>LumaLoop</Text>
        <View style={styles.topbarActions}>
          {/* "Upload puzzle" — greyed out (the creator feature is coming). Native
              has no hover, so tapping reveals the inline "coming soon" notice. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload puzzle (coming soon)"
            accessibilityState={{ disabled: true }}
            testID="home-upload"
            onPress={() => setUploadNotice(true)}
            style={[styles.uploadBtn, a.primaryBtnDisabled]}
          >
            <Text style={styles.uploadBtnText}>＋ Upload puzzle</Text>
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

      {uploadNotice && (
        <Text style={styles.uploadNotice} accessibilityRole="alert">
          Uploading your own puzzles is coming soon.
        </Text>
      )}

      {activity.length > 0 && (
        <View accessibilityLabel="Recent activity">
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stories}
          >
            {activity.map((item, index) => {
              const ring = categoryAccent(RING_TONES[index % RING_TONES.length]).accent;
              return (
                <Pressable
                  key={`${item.kind}:${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${activityCaption(item)} — open the feed`}
                  testID={`home-story-${item.id}`}
                  onPress={onStart}
                  style={styles.story}
                >
                  <View style={[styles.storyRing, { borderColor: ring }]}>
                    {item.avatarUrl ? (
                      <Image
                        style={styles.storyAvatar}
                        source={{ uri: item.avatarUrl }}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={styles.storyAvatar}>
                        <Text style={styles.storyAvatarText}>{item.monogram}</Text>
                      </View>
                    )}
                    <Text style={styles.storyBadge}>
                      {item.kind === 'like' ? '♥' : '💬'}
                    </Text>
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>
                    {item.handle ? `@${item.handle}` : item.displayName ?? 'Someone'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>TODAY’S LOOP</Text>
        <Text style={styles.greeting}>Welcome back, {profile.display_name}</Text>
        <Text style={styles.subtitle}>
          Pick up where you left off, or jump into something new.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start playing"
          testID="home-start"
          onPress={onStart}
          style={({ pressed }) => [
            a.primaryBtn,
            styles.startBtn,
            pressed && a.primaryBtnPressed,
          ]}
        >
          <Text style={a.primaryBtnText}>▶ Start playing</Text>
        </Pressable>
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
                onPress={onStart}
                style={styles.tile}
              >
                <View style={[styles.tileMonogram, { backgroundColor: accent }]}>
                  <Text style={styles.tileMonogramText}>{tileMonogram(game.label)}</Text>
                </View>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {game.label}
                </Text>
                <Text style={styles.tileMeta} numberOfLines={1}>
                  {categoryLabel(game.category)} · ~{game.estimatedSeconds}s
                </Text>
                <Text style={[styles.tilePlay, { color: accent }]}>Play ▸</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
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
  brand: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
  },
  topbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  uploadBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  uploadBtnText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  uploadNotice: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
    fontSize: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
  storyName: {
    maxWidth: '100%',
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  // Hero.
  hero: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: '#1a1e30',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroEyebrow: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
  },
  greeting: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  startBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.xl,
  },
  // Slim stat strip.
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statChipIcon: {
    fontSize: fontSize.sm,
  },
  statChipValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  statChipLabel: {
    color: colors.textMuted,
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
    minHeight: 120,
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileMonogram: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMonogramText: {
    color: colors.accentContrast,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  tileTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  tileMeta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  tilePlay: {
    marginTop: 'auto',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
