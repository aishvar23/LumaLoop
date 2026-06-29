/**
 * Login screen (accounts pivot).
 *
 * The gate before the feed for signed-out users (see {@link RequireAuth}): a
 * TikTok/IG-style "sign in to start playing" surface with OAuth buttons (Google /
 * Apple / Facebook) and an email magic-link fallback. On-brand with the token
 * system. It only KICKS OFF auth — the resulting session arrives asynchronously
 * (OAuth via the /auth/callback redirect; magic link after the user clicks their
 * email), at which point {@link AuthProvider} updates and the guard lets them
 * through.
 *
 * POSITIONING GUARDRAIL (Design §7): copy stays about playing games — no IQ /
 * brain-training / ability claims.
 */
import { useState, type FormEvent } from 'react';

import Button from '../ui/Button';
import Wordmark from '../ui/Wordmark';
import { useAuth } from './AuthProvider';
import type { OAuthProvider } from './authClient';
import './AuthScreens.css';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'facebook', label: 'Continue with Facebook' },
];

export default function LoginScreen() {
  const { signInWithProvider, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleProvider(provider: OAuthProvider) {
    setError(null);
    setBusy(true);
    const { error: err } = await signInWithProvider(provider);
    if (err) {
      setError(err);
      setBusy(false);
    }
    // On success the browser navigates away to the provider — no further UI.
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(false);
    if (!email.trim()) {
      setError('Enter your email to get a sign-in link.');
      return;
    }
    setBusy(true);
    const { error: err } = await signInWithEmail(email.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-brand" aria-label="Witzy">
          <Wordmark />
        </h1>
        <p className="auth-tagline">
          Sign in to scroll the feed and play. Your profile tracks the games you
          play.
        </p>

        <div className="auth-providers">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="auth-provider-btn"
              onClick={() => handleProvider(p.id)}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="auth-note">
          Social sign-in needs each provider enabled in the Supabase project
          first.
        </p>

        <div className="auth-divider">or</div>

        <form className="auth-field" onSubmit={handleEmail}>
          <label className="auth-label" htmlFor="login-email">
            Email a sign-in link
          </label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>

        {sent && (
          <p className="auth-success" role="status">
            Check your email for a link to sign in.
          </p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
