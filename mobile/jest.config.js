// Jest config for the mobile app (Expo SDK 56). Uses the official `jest-expo`
// preset (babel-preset-expo transform via babel-jest) so tests run under the
// same toolchain as the app. The ported pure-TS core under `src/core/` imports
// no React Native, but running it through the Expo preset keeps one consistent
// transform pipeline and lets future component tests share this config.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
