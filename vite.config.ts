/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Scope discovery to the web app only. `mobile/` is a self-contained
    // Expo/React Native sub-project with its OWN jest gate; without this,
    // vitest's default glob would also collect mobile/src/core/**/*.test.ts and
    // couple the two toolchains (and break the root gate as soon as a mobile test
    // uses a jest-only API). The mobile gate is `cd mobile && npm test`.
    include: ['src/**/*.test.{ts,tsx}'],
    // Optional coverage run (`npm run test:coverage`) for the Technical Design
    // §17 assurance pass. Additive only — the standard `npm test` gate does not
    // collect coverage, so this never slows or destabilizes the quality gate.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
      ],
    },
  },
});
