import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { v4 as uuidV4 } from 'uuid';

import FeedScreen from './src/feed/FeedScreen';
import FirstRunNotice from './src/feed/FirstRunNotice';
import { createTelemetryClient } from './src/telemetry/telemetryClient';
import { ensureAnonymousUserId } from './src/telemetry/anonymousUser';
import { useFeedTelemetry } from './src/telemetry/useFeedTelemetry';
import { AuthProvider, useAuth, useOptionalAuth } from './src/auth/AuthProvider';
import RequireAuth from './src/auth/RequireAuth';
import ProfilePage from './src/profile/ProfilePage';
import HomeScreen from './src/HomeScreen';
import { useRecordGamePlay } from './src/feed/useRecordGamePlay';
import { usePlayedCardIds } from './src/feed/usePlayedCardIds';
import { SocialConfigProvider } from './src/social/SocialContext';
import { supabase } from './src/auth/supabaseClient';
import { getCardById as getCatalogCardById } from './src/core/cards/catalog';
import { colors, fontSize, fontWeight } from './src/feed/templates/tokens';

/**
 * LumaLoop mobile (React Native + Expo).
 *
 * ACCOUNTS PIVOT (mobile): the app is now gated behind a Supabase account + profile,
 * mirroring the web app. {@link AuthProvider} owns the session/profile lifecycle and
 * {@link RequireAuth} renders one of three surfaces BEFORE the feed: signed-out →
 * LoginScreen; signed-in w/o profile → ProfileCreationScreen; else → the feed. The
 * feed/session controller stays auth-decoupled (CLAUDE.md §4) — auth wraps it, the
 * engine never depends on it.
 *
 * The app opens into the endless, full-screen vertical swipe feed of mini-games (M3,
 * docs/FEED_DIRECTION.md §3.1), driven by the pure logic ported in M2 and the real
 * renderers from M4. M5 wires the RN telemetry client onto the feed's lifecycle
 * seams so the native app emits the §6 feed events to the SAME deployed ingestion as
 * the web (`/api/event` → Supabase). The accounts pivot ADDS a best-effort
 * `game_plays` write per resolution for the signed-in user, off the feed's
 * `onCardScored` seam — anonymous telemetry is untouched.
 *
 * Anonymous identity (Technical Design §10) is AsyncStorage-persisted and resolves
 * asynchronously; the feed mounts only once it is resolved so the deck seed and the
 * telemetry `anonymousUserId` agree on one stable id per launch.
 *
 * {@link FirstRunNotice} shows the REQUIRED non-assessment notice ONCE over the
 * first view of the feed (behind the auth gate) and persists the acknowledgement.
 *
 * `GestureHandlerRootView` + `SafeAreaProvider` wrap the whole tree so native
 * gesture handlers and safe-area insets work app-wide.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <RequireAuth>
            <FeedApp />
          </RequireAuth>
        </AuthProvider>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The signed-in app surface, with a simple router-less view toggle (native has no
 * React Router). A signed-in user lands on the {@link HomeScreen} (accounts pivot
 * — replaces dropping straight into a game card); "Start playing" enters the feed.
 * A small "You" button overlays the feed → {@link ProfilePage}; a "Home" button
 * returns to the landing. ProfilePage and Home both have Back affordances.
 */
function FeedApp() {
  const [view, setView] = useState<'home' | 'feed' | 'profile'>('home');

  // Resolve the best-effort anonymous id once (AsyncStorage-backed, §10). The feed
  // waits for it so the deck seed and telemetry identity share one stable id.
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    ensureAnonymousUserId().then((id) => {
      if (active) setAnonymousUserId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  if (view === 'home') {
    return (
      <HomeScreen
        onStart={() => setView('feed')}
        onOpenProfile={() => setView('profile')}
      />
    );
  }

  if (view === 'profile') {
    return <ProfilePage onBack={() => setView('feed')} />;
  }

  return (
    <View style={styles.root}>
      <FirstRunNotice>
        {anonymousUserId !== null ? (
          <TelemetryFeed anonymousUserId={anonymousUserId} />
        ) : null}
      </FirstRunNotice>
      <HomeButton onPress={() => setView('home')} />
      <YouButton onPress={() => setView('profile')} />
    </View>
  );
}

/** A small overlay entry back to the Home landing (top-left, clear of the HUD). */
function HomeButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to home"
      testID="open-home"
      onPress={onPress}
      style={styles.homeButton}
    >
      <Text style={styles.homeButtonText}>⌂</Text>
    </Pressable>
  );
}

/** A small overlay entry to the profile screen (the native /you equivalent). */
function YouButton({ onPress }: { onPress: () => void }) {
  const { profile } = useAuth();
  const monogram = (
    profile?.display_name?.trim()?.[0] ??
    profile?.handle?.trim()?.[0] ??
    '?'
  ).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      testID="open-profile"
      onPress={onPress}
      style={styles.youButton}
    >
      <Text style={styles.youButtonText}>{monogram}</Text>
    </Pressable>
  );
}

/**
 * The feed with telemetry wired (M5) + the accounts-pivot `game_plays` recorder.
 * Owns the per-launch telemetry client and the single feed instance id (`feedId`)
 * shared by the feed's per-card start context and the telemetry `sessionId`
 * envelope, then forwards the M3 FeedScreen seam callbacks to the instrumentation.
 */
function TelemetryFeed({ anonymousUserId }: { anonymousUserId: string }) {
  const [client] = useState(() => createTelemetryClient());
  const [feedId] = useState(() => uuidV4());

  const telemetry = useFeedTelemetry({
    client,
    feedId,
    getAnonymousUserId: () => anonymousUserId,
    // Native has no entry URL; the headline organic-return metric filters on
    // `source: 'direct'` (FEED_DIRECTION §6), the default.
    source: 'direct',
  });

  // The feed was opened: Session_Initialized + Return_Session_Started, once.
  const { observeFeedOpened } = telemetry;
  useEffect(() => {
    observeFeedOpened();
  }, [observeFeedOpened]);

  // Accounts pivot: record each resolved card as a `game_plays` row for the
  // signed-in user, best-effort, off the SAME resolution path Phase-4 scoring uses
  // (FeedScreen's `onCardScored` seam). Anonymous telemetry is untouched. The feed
  // is gated by RequireAuth, so in production there is always a user; the recorder
  // no-ops when there isn't (defensive / tests).
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  // Use the SAME client the provider authenticated against (the fake in tests),
  // falling back to the real client when mounted standalone.
  const effectiveClient = auth?.client ?? supabase;
  const recordGamePlay = useRecordGamePlay({
    userId,
    getCardById: getCatalogCardById,
    client: effectiveClient,
  });

  // D2: best-effort fetch of the signed-in user's already-played games so the
  // feed skips them. The controller captures the exclusion set ONCE at mount, so
  // we wait for `ready` before mounting the feed (the first batch already skips
  // played cards). `ready` flips true on success OR error, so a failed/slow fetch
  // never blocks gameplay; re-keyed by userId so a fresh sign-in re-reads.
  const played = usePlayedCardIds(effectiveClient, userId);

  const handlers = useMemo(
    () => ({
      onCardActive: telemetry.onCardActive,
      onCardEngaged: telemetry.onCardEngaged,
      onCardResolved: telemetry.onCardResolved,
      onCardSkipped: telemetry.onCardSkipped,
      onCardAbandoned: telemetry.onCardAbandoned,
      onCardExplanationViewed: telemetry.onCardExplanationViewed,
    }),
    [telemetry],
  );

  // Wait for the played set to settle before mounting the feed so the very first
  // batch already skips already-played games (best-effort: `ready` flips true even
  // on error, with an empty set).
  if (!played.ready) return null;

  return (
    // Supply the per-card social surface (likes + comments) with the SAME client
    // the provider authenticated against + the signed-in user id. Feed-layer
    // concern keyed by cardId — the feed/engine stays auth-free (the rail reads
    // this context; no provider → it renders nothing).
    <SocialConfigProvider value={{ client: effectiveClient, userId }}>
      <FeedScreen
        key={userId ?? 'anon'}
        anonymousUserId={anonymousUserId}
        excludeCardIds={played.cardIds}
        feedId={feedId}
        onCardActive={handlers.onCardActive}
        onCardEngaged={handlers.onCardEngaged}
        onCardResolved={handlers.onCardResolved}
        onCardSkipped={handlers.onCardSkipped}
        onCardAbandoned={handlers.onCardAbandoned}
        onCardExplanationViewed={handlers.onCardExplanationViewed}
        onCardScored={recordGamePlay}
      />
    </SocialConfigProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  youButton: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  youButtonText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  homeButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    height: 40,
    minWidth: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 28, 0.7)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
});
