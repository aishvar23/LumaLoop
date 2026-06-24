/**
 * Auth context (accounts pivot).
 *
 * Owns the Supabase session lifecycle for the whole web app and exposes it via
 * {@link useAuth}: the current `session`/`user`, the user's `profile` row (or
 * null until created), a `loading` flag, and the sign-in/out methods. The route
 * guard ({@link RequireAuth}) and the account screens are its only consumers; the
 * feed/session controller stays auth-free (CLAUDE.md §4) — auth is a wrapper, not
 * a dependency of the engine.
 *
 * Mirrors the behavioral-intelligence AuthContext PATTERN (a provider that holds
 * user + loading and exposes login/logout) but adapted to Supabase: the source of
 * truth is `onAuthStateChange`, not manual token storage. On mount we read the
 * existing session, then subscribe; whenever the session changes we (re)load the
 * profile row. OAuth/magic-link sign-in just kicks off the flow — the resulting
 * session arrives asynchronously via the subscription (and, for OAuth, after the
 * `/auth/callback` redirect).
 *
 * The Supabase client is injected (defaults to the real `supabase`) so tests
 * drive the whole thing with a fake — real OAuth can't run in CI.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AuthClient, OAuthProvider, Session, User } from './authClient';
import { fetchProfile } from './profileApi';
import { supabase } from './supabaseClient';
import type { Profile } from './types';

export interface AuthContextValue {
  /**
   * The Supabase client this provider was constructed with. Exposed so feature
   * data layers (the feed's already-played read, the profile reads) use the SAME
   * client the provider authenticated against — in tests that is the injected
   * fake, so no feature reaches the real network behind a fake session.
   */
  client: AuthClient;
  /** The current Supabase session, or null when signed out. */
  session: Session | null;
  /** The signed-in user, or null. */
  user: User | null;
  /** The user's profile row, or null when signed out / not yet created. */
  profile: Profile | null;
  /** True until the initial session + profile have been resolved. */
  loading: boolean;
  /** True while a profile (re)load is in flight (after a session change). */
  profileLoading: boolean;
  /** Begin an OAuth sign-in; the session arrives via the callback redirect. */
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  /** Send a passwordless magic-link to `email` (Supabase OTP email). */
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  /** Sign out and clear the local session. */
  signOut: () => Promise<void>;
  /** Re-read the profile row (e.g. just after profile creation). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where Supabase should return the user after an OAuth round-trip. */
function oauthRedirectTo(): string | undefined {
  try {
    return `${globalThis.location.origin}/auth/callback`;
  } catch {
    return undefined;
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Test seam: the Supabase client. Defaults to the real browser client. */
  client?: AuthClient;
}

export function AuthProvider({ children, client = supabase }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Keep the client + latest user id in refs so the long-lived subscription
  // callback and the stable methods never re-bind to a changing value.
  const clientRef = useRef(client);
  clientRef.current = client;

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // Load (or clear) the profile for a given user. Tolerant of unmount via a
  // generation token captured at call time, so a stale resolution can't clobber
  // a newer session's profile.
  const loadGenRef = useRef(0);
  const loadProfileFor = useCallback(async (id: string | null) => {
    const gen = ++loadGenRef.current;
    if (!id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const { profile: row } = await fetchProfile(clientRef.current, id);
    if (gen !== loadGenRef.current) return; // a newer load superseded this one.
    setProfile(row);
    setProfileLoading(false);
  }, []);

  // On mount: read the existing session, load its profile, then subscribe to all
  // future auth changes (sign-in via callback, sign-out, token refresh).
  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await clientRef.current.auth.getSession();
      if (!active) return;
      const current = data.session ?? null;
      setSession(current);
      await loadProfileFor(current?.user?.id ?? null);
      if (!active) return;
      setLoading(false);
    })();

    const { data: sub } = clientRef.current.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null);
        void loadProfileFor(nextSession?.user?.id ?? null);
      },
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileFor]);

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      const { error } = await clientRef.current.auth.signInWithOAuth({
        provider,
        options: { redirectTo: oauthRedirectTo() },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await clientRef.current.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: oauthRedirectTo() },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await clientRef.current.auth.signOut();
    // The subscription will also fire, but clear eagerly for immediate UI.
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(
    () => loadProfileFor(userId),
    [loadProfileFor, userId],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      client,
      session,
      user,
      profile,
      loading,
      profileLoading,
      signInWithProvider,
      signInWithEmail,
      signOut,
      refreshProfile,
    }),
    [
      client,
      session,
      user,
      profile,
      loading,
      profileLoading,
      signInWithProvider,
      signInWithEmail,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Throws if used outside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

/**
 * Access the auth context WITHOUT requiring a provider — returns null when there
 * is none. For the feed/wiring layer, which must stay independent of auth
 * (CLAUDE.md §4) and is mounted both under the real provider (production) and
 * standalone (tests / isolation). Production gates `/` behind {@link RequireAuth},
 * which lives under the provider, so a real feed always sees a user.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
