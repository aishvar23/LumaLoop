/**
 * Supabase client for React Native (accounts pivot — mobile port of web
 * `src/auth/supabaseClient.ts`).
 *
 * One shared client for the native app's auth + account-owned tables (`profiles`,
 * `game_plays`). It uses the SAME Supabase project as the web app, but is wired for
 * a native runtime rather than a browser:
 *   - `storage: AsyncStorage` — RN has no `localStorage`; the session persists to
 *     `@react-native-async-storage/async-storage` so a relaunch stays signed in.
 *   - `flowType: 'pkce'` — the secure auth-code flow; the OAuth/magic-link return
 *     deep link (`lumaloop://auth/callback`) is exchanged for a session via
 *     `exchangeCodeForSession` (see {@link AuthProvider}).
 *   - `autoRefreshToken` + `persistSession` — refresh the access token in the
 *     background and keep the session across launches.
 *   - `detectSessionInUrl: false` — there is no page URL on native; we complete the
 *     code exchange explicitly from the deep link, not by URL auto-detection.
 *
 * `react-native-url-polyfill/auto` is imported FIRST: supabase-js relies on a
 * standards `URL`/`URLSearchParams`, which Hermes lacks; the polyfill installs them
 * before the client is constructed.
 *
 * The publishable (anon) key is PUBLIC — it ships in the app bundle and RLS is the
 * security boundary (profiles public-read + self-write; game_plays self-only).
 * Never put a service-role key here. Values come from Expo public env
 * (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, inlined at build
 * time); we fail fast at startup if missing so a misconfigured build is obvious
 * rather than silently unauthenticated.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (see mobile/.env.example). Copy it to ' +
      'mobile/.env / .env.development for local dev.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // No page URL on native — the deep-link callback is exchanged explicitly.
    detectSessionInUrl: false,
  },
});
