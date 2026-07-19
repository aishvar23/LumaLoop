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
    // Accounts pivot: the Supabase client (src/auth/supabaseClient.ts) reads
    // `import.meta.env.VITE_SUPABASE_*` at import and fails fast if missing.
    // Provide harmless placeholder values for the test run so importing app code
    // never throws — tests inject FAKE clients and never hit a real backend, so
    // the values are never used for a real request. (CI has no `.env.local`.)
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // Placeholder VAPID public key so src/notifications/webPush.ts has a key at
      // import (it's read once as a module const). Any valid URL-safe base64
      // string works — tests never contact a real push service.
      VITE_VAPID_PUBLIC_KEY:
        'KZFm8DMI4PxVHaR19dy6y2AG29aGWSzuPACeJ6vtk6KjM8dQGqDHpkxbDR4UBSja2SbtW39VnNH8gHBkPkcFQsA',
    },
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
