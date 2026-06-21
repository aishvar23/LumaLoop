/**
 * OAuth / magic-link callback (accounts pivot).
 *
 * The redirect target for the PKCE flow (`/auth/callback`). supabase-js v2 with
 * `detectSessionInUrl: true` (see supabaseClient) automatically completes the
 * code exchange when the client initialises on this URL, firing
 * `onAuthStateChange` so {@link AuthProvider} picks up the session. To be robust
 * we ALSO explicitly call `exchangeCodeForSession` for the `?code=…` param (the
 * PKCE code-exchange API in v2.x) — it is idempotent with the auto-detect, and
 * covers the case where auto-detect is bypassed. Either way, once a session
 * exists we navigate to `/`, where {@link RequireAuth} routes the user on.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { supabase } from './supabaseClient';
import type { AuthClient } from './authClient';
import './AuthScreens.css';

export interface AuthCallbackProps {
  /** Test seam: the Supabase client. Defaults to the real browser client. */
  client?: AuthClient;
  /** Test seam: the current URL. Defaults to the live `window.location.href`. */
  href?: string;
}

export default function AuthCallback({
  client = supabase,
  href,
}: AuthCallbackProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const url = href ?? globalThis.location?.href ?? '';
        const hasCode = url.includes('code=');
        if (hasCode) {
          // PKCE code exchange (idempotent with detectSessionInUrl).
          const { error: err } = await client.auth.exchangeCodeForSession(url);
          if (err && active) {
            setError(err.message);
            return;
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Sign-in failed.');
          return;
        }
      }
      if (active) navigate('/', { replace: true });
    })();

    return () => {
      active = false;
    };
  }, [client, href, navigate]);

  return (
    <div className="auth-screen" aria-busy={!error}>
      {error ? (
        <div className="auth-card">
          <p className="auth-error" role="alert">
            {error}
          </p>
          <p className="auth-note">
            <a href="/">Back to sign in</a>
          </p>
        </div>
      ) : (
        <p className="auth-tagline">Signing you in…</p>
      )}
    </div>
  );
}
