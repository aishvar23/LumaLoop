// Jest setup (ADO #129, M5). The telemetry layer's production defaults import the
// AsyncStorage native module at load time; under Jest there is no native module,
// so swap in AsyncStorage's official in-memory mock for every test. The telemetry
// UNIT tests inject their own fake async storage and never touch this mock — it
// exists only so importing the production modules doesn't crash on a null native
// module (the ESM-only `uuid` package is transformed via the
// `transformIgnorePatterns` allowlist in jest.config.js).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// MP2 (ADO #134). The full-bleed feed reads device safe-area insets via
// `react-native-safe-area-context`, whose native module is absent under Jest. Mock
// it with a passthrough provider + zero insets so component tests render the feed
// WITHOUT wrapping every case in a real `SafeAreaProvider` (zero insets keep the
// layout assertions deterministic; the real insets are exercised on the Simulator).
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
}));
