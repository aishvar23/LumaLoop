/**
 * Supabase browser client (accounts pivot).
 *
 * One shared client for the web app's auth + account-owned tables (`profiles`,
 * `game_plays`). Configured for an SPA OAuth flow:
 *   - `flowType: 'pkce'` — the secure browser auth-code flow (no implicit tokens
 *     in the URL fragment); the `/auth/callback` route exchanges the code.
 *   - `persistSession` — keep the session in localStorage so a refresh stays
 *     signed in.
 *   - `detectSessionInUrl` — let supabase-js pick up the auth params on the
 *     callback route automatically.
 *   - `autoRefreshToken` — refresh the access token in the background.
 *
 * The publishable (anon) key is PUBLIC — it ships in the client bundle and RLS
 * is the security boundary (profiles public-read + self-write; game_plays
 * self-only). Never put a service-role key here. Values come from Vite env
 * (`import.meta.env`, see `.env.example`); we fail fast at startup if missing so
 * a misconfigured deploy is obvious rather than silently unauthenticated.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '(see .env.example). Copy .env.example to .env.local for local dev.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});
