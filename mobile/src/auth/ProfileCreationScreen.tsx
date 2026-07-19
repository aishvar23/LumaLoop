/**
 * Profile creation screen for React Native (accounts pivot — mobile port of web
 * `src/auth/ProfileCreationScreen.tsx`).
 *
 * Shown by {@link RequireAuth} for an authenticated user who has no `profiles` row
 * yet — the one-time "set up your profile" step before the feed, framed
 * TikTok/IG-style (pick a handle + display name). Validates the handle client-side
 * against the same `^[a-z0-9_]{3,20}$` rule the DB enforces, inserts the row
 * (id = the auth user's id), surfaces a uniqueness error from the DB, then asks the
 * AuthProvider to re-read the profile so the guard advances into the feed.
 *
 * POSITIONING GUARDRAIL (Design §7): copy is about your creator-style profile,
 * never ability/IQ/trait claims.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAuth } from './AuthProvider';
import { createProfile } from './profileApi';
import { supabase } from './supabaseClient';
import type { AuthClient } from './authClient';
import { HANDLE_PATTERN } from '../core/auth/types';
import { authStyles as s } from './authStyles';

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
  /** Test seam: the Supabase client. Defaults to the real native client. */
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

  async function handleSubmit() {
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
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.brand}>Create your profile</Text>
        <Text style={s.tagline}>
          Pick a handle and name. This is how you show up across Witzy.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>Handle</Text>
          <TextInput
            testID="profile-handle"
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your_handle"
            placeholderTextColor="#71717f"
            value={handle}
            onChangeText={setHandle}
            editable={!busy}
          />
          <Text style={s.hint}>
            3–20 characters: lowercase letters, numbers, underscore.
          </Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Display name</Text>
          <TextInput
            testID="profile-name"
            style={s.input}
            placeholder="Your name"
            placeholderTextColor="#71717f"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!busy}
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Avatar URL (optional)</Text>
          <TextInput
            testID="profile-avatar"
            style={s.input}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…"
            placeholderTextColor="#71717f"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            editable={!busy}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          testID="profile-submit"
          disabled={busy}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [
            s.primaryBtn,
            pressed && s.primaryBtnPressed,
            busy && s.primaryBtnDisabled,
          ]}
        >
          <Text style={s.primaryBtnText}>
            {busy ? 'Creating…' : 'Start playing'}
          </Text>
        </Pressable>

        {error && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        {/* Escape hatch: a stale/expired session can land here with no way out.
            Signing out clears it so the player can sign in fresh. */}
        <Pressable
          accessibilityRole="button"
          testID="profile-signout"
          onPress={() => void signOut()}
          style={s.signOutLink}
        >
          <Text style={s.signOutText}>Wrong account? Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
