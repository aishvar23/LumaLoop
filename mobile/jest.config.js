// Jest config for the mobile app (Expo SDK 56). Uses the official `jest-expo`
// preset (babel-preset-expo transform via babel-jest) so tests run under the same
// toolchain as the app. The ported pure-TS core under `src/core/` imports no React
// Native; the M3 feed adds React Native component tests (`.test.tsx`) driven by
// `@testing-library/react-native`, whose built-in Jest matchers auto-extend
// `expect` on import (RNTL v12.4+), so no extra matcher setup file is needed.
//
// M5 (ADO #129) adds the RN telemetry client:
//   - `setupFilesAfterEnv` swaps in AsyncStorage's official in-memory mock so the
//     production telemetry modules (which import the native module at load) don't
//     crash under Jest. Unit tests still inject their own fake async storage.
//   - `transformIgnorePatterns` adds `uuid` to the preset's babel-transform
//     allowlist; `uuid` v14 ships only ESM, which Jest's CommonJS runtime cannot
//     load untransformed.
const expoPreset = require('jest-expo/jest-preset');

// Extend the jest-expo babel-transform allowlist with `uuid` (ESM-only) by
// injecting it into the preset's first pattern, leaving the rest untouched.
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern, i) =>
  i === 0 ? pattern.replace('standard-navigation', 'standard-navigation|uuid') : pattern,
);

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns,
};
