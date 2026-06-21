/**
 * Login screen for React Native (accounts pivot — mobile port of web
 * `src/auth/LoginScreen.tsx`).
 *
 * The gate before the feed for signed-out users (see {@link RequireAuth}): a
 * TikTok/IG-style "sign in to start playing" surface with OAuth buttons (Google /
 * Apple / Facebook) and an email magic-link fallback. On-brand with the token
 * system. Unlike the web version (which navigates away), native OAuth opens the
 * system auth browser and resolves inline — so the buttons stay disabled while the
 * sheet is up and re-enable when it returns.
 *
 * POSITIONING GUARDRAIL (Design §7): copy stays about playing games — no IQ /
 * brain-training / ability claims.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAuth } from './AuthProvider';
import type { OAuthProvider } from './authClient';
import { authStyles as s } from './authStyles';

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
    setSent(false);
    setBusy(true);
    const { error: err } = await signInWithProvider(provider);
    // On success the session arrives via the AuthProvider subscription and the
    // guard advances; on cancel/error we re-enable the buttons.
    if (err) setError(err);
    setBusy(false);
  }

  async function handleEmail() {
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
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.brand}>LumaLoop</Text>
        <Text style={s.tagline}>
          Sign in to scroll the feed and play. Your profile tracks the games you
          play.
        </Text>

        <View style={s.providers}>
          {PROVIDERS.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              testID={`login-provider-${p.id}`}
              disabled={busy}
              onPress={() => void handleProvider(p.id)}
              style={({ pressed }) => [
                s.providerBtn,
                pressed && s.providerBtnPressed,
                busy && s.primaryBtnDisabled,
              ]}
            >
              <Text style={s.providerBtnText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.note}>
          Social sign-in needs each provider enabled in the Supabase project
          first.
        </Text>

        <Text style={s.divider}>or</Text>

        <View style={s.field}>
          <Text style={s.label}>Email a sign-in link</Text>
          <TextInput
            testID="login-email"
            style={s.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor="#71717f"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <Pressable
            accessibilityRole="button"
            testID="login-send-link"
            disabled={busy}
            onPress={() => void handleEmail()}
            style={({ pressed }) => [
              s.primaryBtn,
              pressed && s.primaryBtnPressed,
              busy && s.primaryBtnDisabled,
            ]}
          >
            <Text style={s.primaryBtnText}>
              {busy ? 'Sending…' : 'Send magic link'}
            </Text>
          </Pressable>
        </View>

        {sent && (
          <Text style={s.success} accessibilityRole="alert">
            Check your email for a link to sign in.
          </Text>
        )}
        {error && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
