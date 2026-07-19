/**
 * Profile creation screen (accounts pivot).
 *
 * Shown by {@link RequireAuth} for an authenticated user who has no `profiles`
 * row yet — the one-time "set up your profile" step before the feed, framed
 * TikTok/IG-style (pick a handle + display name). Validates the handle client-
 * side against the same `^[a-z0-9_]{3,20}$` rule the DB enforces, inserts the row
 * (id = the auth user's id), surfaces a uniqueness error from the DB, then asks
 * the AuthProvider to re-read the profile so the guard advances into the feed.
 *
 * POSITIONING GUARDRAIL (Design §7): copy is about your creator-style profile,
 * never ability/IQ/trait claims.
 */
import { useState, type FormEvent } from 'react';

import Button from '../ui/Button';
import { useAuth } from './AuthProvider';
import { createProfile } from './profileApi';
import { supabase } from './supabaseClient';
import type { AuthClient } from './authClient';
import { HANDLE_PATTERN } from './types';
import './AuthScreens.css';

/** Client-side validation mirroring the DB constraints. Returns an error or null. */
export function validateProfileInput(handle: string, displayName: string): string | null {
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Handle must be 3–20 chars: lowercase letters, numbers, or underscore.';
  }
  const name = displayName.trim();
  if (name.length < 1 || name.length > 40) {
    return 'Display name must be 1–40 characters.';
  }
  return null;
}

export interface ProfileCreationScreenProps {
  /** Test seam: the Supabase client. Defaults to the real browser client. */
  client?: AuthClient;
}

export default function ProfileCreationScreen({
  client = supabase,
}: ProfileCreationScreenProps) {
  const { user, refreshProfile, signOut } = useAuth();
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!user) {
      setError('You must be signed in.');
      return;
    }
    const normalizedHandle = handle.trim().toLowerCase();
    const validationError = validateProfileInput(normalizedHandle, displayName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    const { error: err } = await createProfile(client, {
      id: user.id,
      handle: normalizedHandle,
      display_name: displayName.trim(),
      avatar_url: avatarUrl.trim() || null,
    });
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    // Profile created — re-read it so RequireAuth advances into the feed.
    await refreshProfile();
    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-brand">Create your profile</h1>
        <p className="auth-tagline">
          Pick a handle and name. This is how you show up across Witzy.
        </p>

        <form onSubmit={handleSubmit} className="auth-providers">
          <div className="auth-field">
            <label className="auth-label" htmlFor="profile-handle">
              Handle
            </label>
            <input
              id="profile-handle"
              className="auth-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="your_handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              disabled={busy}
            />
            <p className="auth-hint">
              3–20 characters: lowercase letters, numbers, underscore.
            </p>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="profile-name">
              Display name
            </label>
            <input
              id="profile-name"
              className="auth-input"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="profile-avatar">
              Avatar URL (optional)
            </label>
            <input
              id="profile-avatar"
              className="auth-input"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              disabled={busy}
            />
          </div>

          <Button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Creating…' : 'Start playing'}
          </Button>
        </form>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {/* Escape hatch: a stale/expired session can land here with no way out.
            Signing out clears it so the player can sign in fresh. */}
        <button
          type="button"
          className="auth-signout-link"
          onClick={() => void signOut()}
        >
          Wrong account? Sign out
        </button>
      </div>
    </div>
  );
}
