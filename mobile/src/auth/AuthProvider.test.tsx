/**
 * Tests for the mobile auth context (accounts pivot — RN counterpart of web
 * `src/auth/AuthProvider.test.tsx`). Every external is injected: the Supabase
 * client (fake), the system-browser open, the Apple sheet, and the deep-link
 * source. No native modules, no real backend, no real OAuth.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  AUTH_REDIRECT_URL,
  AuthProvider,
  useAuth,
} from './AuthProvider';
import {
  createFakeAuthClient,
  createFakeLinking,
  makeProfile,
  makeSession,
} from './testFakes';

/** A tiny probe that surfaces the context + buttons to drive the methods. */
function Probe() {
  const {
    user,
    profile,
    loading,
    signInWithProvider,
    signInWithEmail,
    signOut,
  } = useAuth();
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="user">{user?.id ?? 'none'}</Text>
      <Text testID="profile">{profile?.handle ?? 'none'}</Text>
      <Pressable testID="google" onPress={() => void signInWithProvider('google')}>
        <Text>google</Text>
      </Pressable>
      <Pressable testID="apple" onPress={() => void signInWithProvider('apple')}>
        <Text>apple</Text>
      </Pressable>
      <Pressable testID="email" onPress={() => void signInWithEmail('a@b.com')}>
        <Text>email</Text>
      </Pressable>
      <Pressable testID="signout" onPress={() => void signOut()}>
        <Text>signout</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider', () => {
  it('resolves the existing session + profile on mount', async () => {
    const auth = createFakeAuthClient({
      session: makeSession(),
      profile: makeProfile({ handle: 'hello' }),
    });
    render(
      <AuthProvider client={auth.client} linking={createFakeLinking()}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    expect(screen.getByTestId('user').props.children).toBe('user-1');
    expect(screen.getByTestId('profile').props.children).toBe('hello');
  });

  it('magic link calls signInWithOtp with the lumaloop:// redirect', async () => {
    const auth = createFakeAuthClient({ session: null });
    render(
      <AuthProvider client={auth.client} linking={createFakeLinking()}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('email'));
      await Promise.resolve();
    });
    expect(auth.calls.signInWithOtp).toHaveLength(1);
    expect(auth.calls.signInWithOtp[0]).toMatchObject({
      email: 'a@b.com',
      options: { emailRedirectTo: AUTH_REDIRECT_URL },
    });
  });

  it('OAuth (Google): gets the authorize URL, opens the browser, exchanges the returned code', async () => {
    const auth = createFakeAuthClient({
      session: null,
      oauthUrl: 'https://provider/authorize?x=1',
    });
    const returnedUrl = `${AUTH_REDIRECT_URL}?code=abc123`;
    const openAuthSession = jest.fn(async () => returnedUrl);
    render(
      <AuthProvider
        client={auth.client}
        linking={createFakeLinking()}
        openAuthSession={openAuthSession}
      >
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('google'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.calls.signInWithOAuth).toHaveLength(1);
    expect(auth.calls.signInWithOAuth[0]).toMatchObject({
      provider: 'google',
      options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
    });
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://provider/authorize?x=1',
      AUTH_REDIRECT_URL,
    );
    // The BARE code is exchanged, not the URL (supabase-js expects the code).
    expect(auth.calls.exchangeCodeForSession).toContain('abc123');
    expect(auth.calls.exchangeCodeForSession).not.toContain(returnedUrl);
  });

  it('OAuth dismissed (no returned URL) → no error, no exchange', async () => {
    const auth = createFakeAuthClient({ session: null });
    const openAuthSession = jest.fn(async () => null);
    render(
      <AuthProvider
        client={auth.client}
        linking={createFakeLinking()}
        openAuthSession={openAuthSession}
      >
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('google'));
      await Promise.resolve();
    });
    expect(auth.calls.exchangeCodeForSession).toHaveLength(0);
  });

  it('Apple on iOS uses the native sheet → signInWithIdToken (no browser)', async () => {
    const auth = createFakeAuthClient({ session: null });
    const openAuthSession = jest.fn(async () => null);
    const signInWithApple = jest.fn(async () => ({ identityToken: 'tok-1' }));
    render(
      <AuthProvider
        client={auth.client}
        linking={createFakeLinking()}
        appleNative
        openAuthSession={openAuthSession}
        signInWithApple={signInWithApple}
      >
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('apple'));
      await Promise.resolve();
    });
    expect(signInWithApple).toHaveBeenCalled();
    expect(openAuthSession).not.toHaveBeenCalled();
    expect(auth.calls.signInWithIdToken).toHaveLength(1);
    expect(auth.calls.signInWithIdToken[0]).toMatchObject({
      provider: 'apple',
      token: 'tok-1',
    });
  });

  it('exchanges a cold-start deep link (initial URL with a code)', async () => {
    const auth = createFakeAuthClient({ session: null });
    const linking = createFakeLinking(`${AUTH_REDIRECT_URL}?code=cold`);
    render(
      <AuthProvider client={auth.client} linking={linking}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(auth.calls.exchangeCodeForSession).toContain('cold'),
    );
  });

  it('exchanges a warm deep link (incoming URL event with a code)', async () => {
    const auth = createFakeAuthClient({ session: null });
    const linking = createFakeLinking();
    render(
      <AuthProvider client={auth.client} linking={linking}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      linking.emit(`${AUTH_REDIRECT_URL}?code=warm`);
      await Promise.resolve();
    });
    expect(auth.calls.exchangeCodeForSession).toContain('warm');
  });

  it('exchanges a one-time code only once even if delivered twice (dedupe)', async () => {
    const auth = createFakeAuthClient({ session: null });
    const linking = createFakeLinking();
    render(
      <AuthProvider client={auth.client} linking={linking}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    await act(async () => {
      linking.emit(`${AUTH_REDIRECT_URL}?code=dup`);
      linking.emit(`${AUTH_REDIRECT_URL}?code=dup`);
      await Promise.resolve();
    });
    expect(
      auth.calls.exchangeCodeForSession.filter((c) => c === 'dup'),
    ).toHaveLength(1);
  });

  it('signOut clears the session and profile', async () => {
    const auth = createFakeAuthClient({
      session: makeSession(),
      profile: makeProfile(),
    });
    render(
      <AuthProvider client={auth.client} linking={createFakeLinking()}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user').props.children).toBe('user-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('signout'));
      await Promise.resolve();
    });
    expect(auth.calls.signOut).toBe(1);
    expect(screen.getByTestId('user').props.children).toBe('none');
    expect(screen.getByTestId('profile').props.children).toBe('none');
  });
});
