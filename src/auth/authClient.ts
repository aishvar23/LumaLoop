/**
 * The narrow Supabase surface the auth + account layer actually uses.
 *
 * Depending on this small port (rather than the whole `SupabaseClient`) keeps the
 * {@link AuthProvider}, the route guard, and the data helpers fully unit-testable
 * with a hand-written fake — we can never hit real OAuth in CI (providers aren't
 * configured), so every account behaviour is verified against a mock that
 * implements exactly this interface. The real client (`supabase`) satisfies it
 * structurally; tests inject a fake.
 *
 * Types are kept deliberately loose at the boundary (the values returned by
 * supabase-js are richly typed there); the app narrows what it consumes via the
 * typed row models in `./types`.
 */
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

export type { AuthChangeEvent, Session, User };

/** OAuth providers offered on the login screen. */
export type OAuthProvider = 'google' | 'apple' | 'facebook';

/** The subset of `SupabaseClient` the account layer depends on. */
export type AuthClient = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>;
