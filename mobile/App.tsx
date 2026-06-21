import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { v4 as uuidV4 } from 'uuid';

import FeedScreen from './src/feed/FeedScreen';
import { createTelemetryClient } from './src/telemetry/telemetryClient';
import { ensureAnonymousUserId } from './src/telemetry/anonymousUser';
import { useFeedTelemetry } from './src/telemetry/useFeedTelemetry';

/**
 * LumaLoop mobile (React Native + Expo).
 *
 * The app opens straight into the endless, full-screen vertical swipe feed of
 * mini-games (M3, docs/FEED_DIRECTION.md §3.1), driven by the pure logic ported
 * in M2 and the four real renderers from M4. M5 (ADO #129) wires the RN telemetry
 * client onto the feed's lifecycle seams so the native app emits the §6 feed
 * events to the SAME deployed ingestion as the web (`/api/event` → Supabase).
 *
 * Anonymous identity (Technical Design §10) is AsyncStorage-persisted and resolves
 * asynchronously; the feed mounts only once it is resolved so the deck seed and the
 * telemetry `anonymousUserId` agree on one stable id per launch (a fast read — a
 * brief blank frame, no spinner ceremony for the prototype).
 *
 * SEAM (M6): the one-time first-run anonymous-data notice (FEED_DIRECTION.md §3.6)
 * is shown once before/over the first feed view. It is intentionally NOT built
 * here yet — it will wrap or precede `<FeedScreen />` without changing the feed.
 *
 * `GestureHandlerRootView` wraps the tree so native gesture handlers work app-wide
 * (gesture-handler docs); it must be the root view and fill the screen.
 */
export default function App() {
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

  return (
    <GestureHandlerRootView style={styles.root}>
      {anonymousUserId !== null ? (
        <TelemetryFeed anonymousUserId={anonymousUserId} />
      ) : null}
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

/**
 * The feed with telemetry wired (M5). Owns the per-launch telemetry client and the
 * single feed instance id (`feedId`) shared by the feed's per-card start context
 * and the telemetry `sessionId` envelope, then forwards the M3 FeedScreen seam
 * callbacks to the instrumentation. Created with stable per-mount values so the
 * client and feedId never churn across renders.
 */
function TelemetryFeed({ anonymousUserId }: { anonymousUserId: string }) {
  // One client + one feed id per launch. The client uses production defaults:
  // AsyncStorage retry queue, `fetch` transport, and the absolute Vercel endpoint
  // resolved from `EXPO_PUBLIC_API_BASE_URL`.
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

  return (
    <FeedScreen
      anonymousUserId={anonymousUserId}
      feedId={feedId}
      onCardActive={handlers.onCardActive}
      onCardEngaged={handlers.onCardEngaged}
      onCardResolved={handlers.onCardResolved}
      onCardSkipped={handlers.onCardSkipped}
      onCardAbandoned={handlers.onCardAbandoned}
      onCardExplanationViewed={handlers.onCardExplanationViewed}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
});
