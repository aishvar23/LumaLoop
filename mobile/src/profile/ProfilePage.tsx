/**
 * Profile screen for React Native (accounts pivot — mobile port of web
 * `src/profile/ProfilePage.tsx`, the /you page).
 *
 * Shows the signed-in user's avatar / handle / display name and their GAME
 * activity stats, computed from `game_plays` via the pure {@link computeStats}
 * (all aggregation logic lives in the ported core, not in this component): games
 * played, accuracy %, best streak, total points, and a per-category breakdown.
 * Includes a Sign out button and (mobile-specific, no router) an optional Back
 * affordance to return to the feed.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): everything here is GAME activity —
 * "games played", "points", "best streak", "performance categories". Never
 * traits / IQ / ability / clinical framing.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { fetchGamePlays } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import { getCardById as defaultGetCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { GamePlay } from '../core/auth/types';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from '../core/profile/computeStats';
import {
  buildYourGames,
  type YourGameRow,
} from '../core/profile/yourGames';
import { fetchGameScores } from './gameScoresApi';
import { authStyles as a } from '../auth/authStyles';
import {
  colors,
  fontSize,
  fontWeight,
  PAGE_BACKGROUND,
  radius,
  space,
} from '../feed/templates/tokens';

export interface ProfilePageProps {
  /**
   * Test seam: the Supabase client. Defaults to the auth provider's client (the
   * injected fake in tests), falling back to the real native client.
   */
  client?: AuthClient;
  /** Test seam: cardId → card resolver for friendly game titles. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** Optional back-to-feed affordance (no router on native). */
  onBack?: () => void;
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

export default function ProfilePage({
  client: clientProp,
  getCardById = defaultGetCardById,
  onBack,
}: ProfilePageProps) {
  const auth = useAuth();
  const { user, profile, signOut } = auth;
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [games, setGames] = useState<YourGameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      // Aggregate stats + per-game scores in parallel; both best-effort.
      const [playsRes, scoresRes] = await Promise.all([
        fetchGamePlays(client, user.id),
        fetchGameScores(client, user.id),
      ]);
      if (!active) return;
      if (playsRes.error) setError(playsRes.error);
      setStats(computeStats(playsRes.plays as GamePlay[]));
      setGames(buildYourGames(scoresRes.scores, getCardById, 'recent'));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, user, getCardById]);

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
        // Clear the status bar / Dynamic Island so the back button is visible
        // and tappable (the page has no router; this is the only way back). Use a
        // hard minimum so it's safe even if the safe-area inset reports 0 (e.g.
        // before the provider measures) — otherwise the button overlaps the
        // status bar and can't be tapped.
        { paddingTop: Math.max(insets.top, 48) + space.md },
      ]}
    >
      {onBack && (
        <Pressable
          accessibilityRole="button"
          testID="profile-back"
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ Feed</Text>
        </Pressable>
      )}

      <View style={styles.header}>
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
        <View style={styles.identity}>
          <Text style={styles.name}>{profile.display_name}</Text>
          <Text style={styles.handle}>@{profile.handle}</Text>
        </View>
      </View>

      <View accessibilityLabel="Your game activity">
        {loading ? (
          <Text style={a.note}>Loading your stats…</Text>
        ) : (
          <View style={styles.statsGrid}>
            <Stat value={String(stats.gamesPlayed)} label="Games played" />
            <Stat value={formatAccuracy(stats.accuracy)} label="Accuracy" />
            <Stat value={String(stats.bestStreak)} label="Best streak" />
            <Stat value={String(stats.totalPoints)} label="Total points" />
          </View>
        )}
      </View>

      {!loading && stats.categories.length > 0 && (
        <View accessibilityLabel="Per-category breakdown" style={styles.categories}>
          <Text style={styles.sectionTitle}>By performance category</Text>
          {stats.categories.map((c) => (
            <View key={c.category} style={styles.categoryRow}>
              <Text style={styles.categoryName}>{categoryLabel(c.category)}</Text>
              <Text style={styles.categoryMeta}>
                {c.played} played · {formatAccuracy(c.accuracy)} · {c.points} pts
              </Text>
            </View>
          ))}
        </View>
      )}

      {!loading && games.length > 0 && (
        <View accessibilityLabel="Your games" style={styles.categories}>
          <Text style={styles.sectionTitle}>Your games</Text>
          {games.map((g) => (
            <View key={g.cardId} style={styles.gameRow}>
              <View style={styles.gameMain}>
                <Text style={styles.gameTitle} numberOfLines={1}>
                  {g.title}
                </Text>
                <Text style={styles.gameCategory}>{g.categoryLabel}</Text>
              </View>
              <Text style={styles.gameScores}>
                <Text style={styles.gameBest}>Best {g.bestPoints}</Text>
                {`  ·  Last ${g.lastPoints}  ·  ${
                  g.timesPlayed === 1 ? '1 play' : `${g.timesPlayed} plays`
                }`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {error && (
        <Text style={a.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        testID="profile-signout"
        onPress={() => void signOut()}
        style={({ pressed }) => [
          a.providerBtn,
          styles.signOut,
          pressed && a.providerBtnPressed,
        ]}
      >
        <Text style={a.providerBtnText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
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
  back: {
    alignSelf: 'flex-start',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginLeft: -space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentContrast,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  identity: {
    flexShrink: 1,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  handle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  stat: {
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
  categories: {
    gap: space.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: space.xs,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryName: {
    color: colors.text,
    fontSize: fontSize.md,
    flexShrink: 1,
  },
  categoryMeta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  gameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  gameMain: {
    flexShrink: 1,
    gap: 2,
  },
  gameTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  gameCategory: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  gameScores: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'right',
    flexShrink: 0,
  },
  gameBest: {
    color: colors.text,
    fontWeight: fontWeight.bold,
  },
  signOut: {
    marginTop: space.md,
  },
});
