import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import FeedScreen from './src/feed/FeedScreen';

/**
 * LumaLoop mobile (React Native + Expo).
 *
 * The app opens straight into the endless, full-screen vertical swipe feed of
 * mini-games (M3, docs/FEED_DIRECTION.md §3.1), driven by the pure logic ported
 * in M2. M3 renders games through a template-agnostic STUB behind the renderer
 * registry seam; M4 swaps in the four real game renderers with no feed change, and
 * M5 wires the telemetry client onto the feed's lifecycle callbacks.
 *
 * SEAM (M6): the one-time first-run anonymous-data notice (FEED_DIRECTION.md §3.6)
 * is shown once before/over the first feed view. It is intentionally NOT built
 * here yet — it will wrap or precede `<FeedScreen />` without changing the feed.
 *
 * `GestureHandlerRootView` wraps the tree so native gesture handlers work app-wide
 * (gesture-handler docs); it must be the root view and fill the screen.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <FeedScreen />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
});
