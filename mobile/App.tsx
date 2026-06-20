import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * LumaLoop mobile (React Native + Expo) — Phase M scaffold (ADO #125).
 *
 * Minimal entry screen for now: the endless full-screen swipe feed of mini-games
 * is built in M3 (feed) + M4 (the four game renderers), driven by the pure logic
 * ported in M2 and instrumented by the telemetry client in M5. This placeholder
 * just proves the app boots in Expo Go / the iOS Simulator.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LumaLoop</Text>
      <Text style={styles.subtitle}>Feed coming up next.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9aa0aa',
    fontSize: 15,
  },
});
