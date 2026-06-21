// Jest setup (ADO #129, M5). The telemetry layer's production defaults import the
// AsyncStorage native module at load time; under Jest there is no native module,
// so swap in AsyncStorage's official in-memory mock for every test. The telemetry
// UNIT tests inject their own fake async storage and never touch this mock — it
// exists only so importing the production modules doesn't crash on a null native
// module (the `uuid` CJS build is mapped in via `moduleNameMapper`).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
