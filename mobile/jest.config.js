// Jest config for the mobile app (Expo SDK 56). Uses the official `jest-expo`
// preset (babel-preset-expo transform via babel-jest) so tests run under the same
// toolchain as the app. The ported pure-TS core under `src/core/` imports no React
// Native; the M3 feed adds React Native component tests (`.test.tsx`) driven by
// `@testing-library/react-native`, whose built-in Jest matchers auto-extend
// `expect` on import (RNTL v12.4+), so no extra setup file is needed.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
};
