/**
 * Home / Discover landing screen for React Native (accounts pivot — mobile
 * parallel of web `src/profile/HomePage.tsx`).
 *
 * The DEFAULT surface a signed-in user lands on (before the feed): a greeting, a
 * snapshot of their game stats, a grid of featured games, and a prominent "Start
 * playing" CTA that enters the immersive feed. It replaces dropping straight into
 * a game card on launch.
 *
 * Separation of concerns (CLAUDE.md §4): presentational only. Navigation is the
 * parent's job — `onStart` enters the feed, `onOpenProfile` opens /you (native has
 * no router; App.tsx owns the view toggle). Stats reuse the SAME pipeline the
 * profile screen uses ({@link fetchGamePlays} + the ported {@link computeStats}).
 * Featured tiles come from the pure {@link selectFeaturedGames} (template-agnostic).
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
import { selectFeaturedGames, type FeaturedGame } from './core/cards/featured';
import type { GamePlay } from './core/auth/types';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from './core/profile/computeStats';
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
}

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
}: HomeScreenProps) {
  const auth = useAuth();
  const { user, profile } = auth;
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
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

      <View style={styles.hero}>
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
      </View>

      <View accessibilityLabel="Your game activity">
        {loading ? (
          <Text style={a.note}>Loading your stats…</Text>
        ) : (
          <View style={styles.statsGrid}>
            <Stat value={String(stats.gamesPlayed)} label="Games played" tone="visual_attention" />
            <Stat value={formatAccuracy(stats.accuracy)} label="Accuracy" tone="logical_reasoning" />
            <Stat value={String(stats.bestStreak)} label="Best streak" tone="cognitive_flexibility" />
            <Stat value={String(stats.totalPoints)} label="Total points" tone="processing_speed" />
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
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  /** Category id whose accent tints the card stripe; cosmetic only. */
  tone: string;
}) {
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
  hero: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  stat: {
    position: 'relative',
    overflow: 'hidden',
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  statStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    opacity: 0.9,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: space.xs,
  },
  featured: {
    gap: space.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: space.xs,
  },
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileMonogram: {
    width: 36,
    height: 36,
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
});
