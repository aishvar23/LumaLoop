/**
 * Auth context for React Native (accounts pivot — mobile port of web
 * `src/auth/AuthProvider.tsx`).
 *
 * Owns the Supabase session lifecycle for the whole native app and exposes it via
 * {@link useAuth}: the current `session`/`user`, the user's `profile` row (or null
 * until created), a `loading` flag, and the sign-in/out methods. The route guard
 * ({@link RequireAuth}) and the account screens are its only consumers; the
 * feed/session controller stays auth-free (CLAUDE.md §4) — auth is a wrapper, not
 * a dependency of the engine.
 *
 * Source of truth is `onAuthStateChange`, not manual token storage: on mount we
 * read the existing session, then subscribe; whenever the session changes we
 * (re)load the profile row.
 *
 * NATIVE OAUTH (the web→mobile difference): a browser app simply navigates to the
 * provider and returns to `/auth/callback`. On native there is no page navigation,
 * so for OAuth we:
 *   1. `signInWithOAuth({ provider, options:{ redirectTo, skipBrowserRedirect } })`
 *      to GET the provider authorize URL without navigating,
 *   2. open it in the system auth browser via `expo-web-browser`
 *      `openAuthSessionAsync(url, redirectTo)`, which returns the
 *      `lumaloop://auth/callback?code=…` deep link the provider redirects to, then
 *   3. `exchangeCodeForSession(returnedUrl)` to mint the session — which fires the
 *      subscription and (re)loads the profile.
 * Apple on iOS prefers the NATIVE Sign in with Apple sheet
 * (`expo-apple-authentication`) → `signInWithIdToken` (App Store requirement when
 * shipping other social logins). Magic link uses `signInWithOtp` with
 * `emailRedirectTo: lumaloop://auth/callback`; the emailed link reopens the app and
 * the deep-link listener exchanges the code.
 *
 * Every external (the Supabase client, the browser-open, the Apple sheet, the
 * deep-link/initial-URL sources) is injected with a production default so tests
 * drive the whole flow with fakes — real OAuth can't run in CI.
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
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';

import type { AuthClient, OAuthProvider, Session, User } from './authClient';
import { fetchProfile } from './profileApi';
import { supabase } from './supabaseClient';
import type { Profile } from '../core/auth/types';

/** The deep-link Supabase returns the user to after an OAuth/magic-link round-trip. */
export const AUTH_REDIRECT_URL = 'lumaloop://auth/callback';

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
  /** Begin an OAuth sign-in (opens the system auth browser / native Apple sheet). */
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  /** Send a passwordless magic-link to `email` (Supabase OTP email). */
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  /** Sign out and clear the local session. */
  signOut: () => Promise<void>;
  /** Re-read the profile row (e.g. just after profile creation). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Native browser-open seam: open `url` in the system auth session and resolve the
 * deep link the provider redirects back to (`lumaloop://auth/callback?code=…`), or
 * null if the user dismissed it. Defaults to `expo-web-browser`.
 */
export type OpenAuthSession = (
  url: string,
  redirectTo: string,
) => Promise<string | null>;

const defaultOpenAuthSession: OpenAuthSession = async (url, redirectTo) => {
  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  return result.type === 'success' ? result.url : null;
};

/** Native Apple sign-in seam: returns the identity token, or null if cancelled. */
export type SignInWithApple = () => Promise<{
  identityToken: string | null;
  nonce?: string;
}>;

const defaultSignInWithApple: SignInWithApple = async () => {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  return { identityToken: credential.identityToken };
};

/** Deep-link source seam: the initial URL + a subscription to incoming URLs. */
export interface LinkingSource {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (handler: (url: string) => void) => { remove: () => void };
}

const defaultLinkingSource: LinkingSource = {
  getInitialURL: () => Linking.getInitialURL(),
  addEventListener: (handler) => {
    const sub = Linking.addEventListener('url', ({ url }) => handler(url));
    return { remove: () => sub.remove() };
  },
};

export interface AuthProviderProps {
  children: ReactNode;
  /** Test seam: the Supabase client. Defaults to the real native client. */
  client?: AuthClient;
  /** Test seam: open the system auth browser. Defaults to `expo-web-browser`. */
  openAuthSession?: OpenAuthSession;
  /** Test seam: the native Apple sheet. Defaults to `expo-apple-authentication`. */
  signInWithApple?: SignInWithApple;
  /** Test seam: deep-link source. Defaults to `expo-linking`. */
  linking?: LinkingSource;
  /** Test seam: force the Apple-native path on/off (defaults to iOS detection). */
  appleNative?: boolean;
}

export function AuthProvider({
  children,
  client = supabase,
  openAuthSession = defaultOpenAuthSession,
  signInWithApple = defaultSignInWithApple,
  linking = defaultLinkingSource,
  appleNative,
}: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Keep the externals in refs so the long-lived subscription callback and the
  // stable methods never re-bind to a changing value.
  const clientRef = useRef(client);
  clientRef.current = client;
  const openAuthSessionRef = useRef(openAuthSession);
  openAuthSessionRef.current = openAuthSession;
  const signInWithAppleRef = useRef(signInWithApple);
  signInWithAppleRef.current = signInWithApple;

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  const useAppleNative = appleNative ?? Platform.OS === 'ios';

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

  // Codes we've already exchanged, so a code delivered by BOTH the auth-browser
  // return AND the deep-link listener is exchanged exactly once (a second exchange
  // of a consumed one-time code fails with "invalid flow state").
  const exchangedCodesRef = useRef<Set<string>>(new Set());

  // Exchange a returned deep link (`lumaloop://auth/callback?code=…`) for a
  // session. Extracts the BARE `code` — supabase-js `exchangeCodeForSession`
  // expects the code, NOT the URL; passing the URL yields "invalid flow state".
  // Deduped (one-time codes) and never throws; returns the error so the OAuth
  // caller can surface it while the deep-link listener ignores it.
  const exchangeAuthCode = useCallback(
    async (url: string | null): Promise<{ error: string | null }> => {
      const match = url ? /[?&]code=([^&]+)/.exec(url) : null;
      const code = match ? decodeURIComponent(match[1]) : null;
      if (!code) return { error: null }; // not an auth callback — nothing to do.
      if (exchangedCodesRef.current.has(code)) return { error: null }; // already done.
      exchangedCodesRef.current.add(code);
      try {
        const { error } =
          await clientRef.current.auth.exchangeCodeForSession(code);
        return { error: error?.message ?? null };
      } catch (err) {
        // Best-effort: a bad/expired code leaves the user signed out; the guard
        // keeps them on the login screen. No crash.
        return {
          error:
            err instanceof Error
              ? err.message
              : 'Sign-in could not be completed.',
        };
      }
    },
    [],
  );

  // On mount: read the existing session, load its profile, subscribe to all future
  // auth changes, and wire the deep-link handlers (cold-start initial URL + warm
  // incoming URLs) so a magic-link/OAuth return completes the code exchange.
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
      // Cold start from a magic-link tap: complete any pending code exchange.
      const initialUrl = await linking.getInitialURL();
      if (!active) return;
      await exchangeAuthCode(initialUrl);
    })();

    const { data: sub } = clientRef.current.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null);
        void loadProfileFor(nextSession?.user?.id ?? null);
      },
    );

    // Warm start: app already running when the deep link arrives.
    const linkSub = linking.addEventListener((url) => {
      void exchangeAuthCode(url);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, [loadProfileFor, exchangeAuthCode, linking]);

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      // iOS Apple → the native Sign in with Apple sheet (App Store requirement).
      if (provider === 'apple' && useAppleNative) {
        try {
          const { identityToken, nonce } = await signInWithAppleRef.current();
          if (!identityToken) return { error: 'Apple sign-in was cancelled.' };
          const { error } = await clientRef.current.auth.signInWithIdToken({
            provider: 'apple',
            token: identityToken,
            nonce,
          });
          return { error: error?.message ?? null };
        } catch (err) {
          return {
            error:
              err instanceof Error ? err.message : 'Apple sign-in failed.',
          };
        }
      }

      // Everything else → system auth browser + PKCE code exchange.
      const { data, error } = await clientRef.current.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: AUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not start sign-in.' };

      const returnedUrl = await openAuthSessionRef.current(
        data.url,
        AUTH_REDIRECT_URL,
      );
      if (!returnedUrl) return { error: null }; // dismissed — no error banner.
      // Exchange the BARE code (deduped) — not the URL — for the session.
      return exchangeAuthCode(returnedUrl);
    },
    [useAppleNative, exchangeAuthCode],
  );

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await clientRef.current.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_REDIRECT_URL },
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
 * standalone (tests / isolation). Production gates the feed behind
 * {@link RequireAuth}, which lives under the provider, so a real feed always sees a
 * user.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
