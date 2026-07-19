import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthProvider, useAuth } from './AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from './testFakes';

/** Probe component that surfaces the auth state for assertions. */
function Probe() {
  const { loading, session, profile, signInWithProvider, signInWithEmail, signOut } =
    useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="signed-in">{session ? 'yes' : 'no'}</div>
      <div data-testid="handle">{profile?.handle ?? 'none'}</div>
      <button onClick={() => void signInWithProvider('google')}>google</button>
      <button onClick={() => void signInWithEmail('a@b.com')}>email</button>
      <button onClick={() => void signOut()}>out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('resolves a signed-out state with no profile', async () => {
    const auth = createFakeAuthClient({ session: null, profile: null });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('signed-in')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('handle')).toHaveTextContent('none');
  });

  it('loads the profile for an existing session on mount', async () => {
    const auth = createFakeAuthClient({
      session: makeSession(),
      profile: makeProfile({ handle: 'loaded_user' }),
    });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('handle')).toHaveTextContent('loaded_user'),
    );
    expect(screen.getByTestId('signed-in')).toHaveTextContent('yes');
  });

  it('updates when onAuthStateChange fires a new session', async () => {
    const auth = createFakeAuthClient({ session: null, profile: makeProfile() });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('signed-in')).toHaveTextContent('no'),
    );
    await act(async () => {
      auth.emitAuthState(makeSession());
    });
    await waitFor(() =>
      expect(screen.getByTestId('signed-in')).toHaveTextContent('yes'),
    );
  });

  it('signInWithProvider delegates to signInWithOAuth', async () => {
    const auth = createFakeAuthClient({ session: null });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('google'));
    await act(async () => {
      screen.getByText('google').click();
    });
    expect(auth.calls.signInWithOAuth).toHaveLength(1);
    expect(auth.calls.signInWithOAuth[0]).toMatchObject({ provider: 'google' });
  });

  it('signInWithEmail delegates to signInWithOtp', async () => {
    const auth = createFakeAuthClient({ session: null });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('email'));
    await act(async () => {
      screen.getByText('email').click();
    });
    expect(auth.calls.signInWithOtp).toHaveLength(1);
    expect(auth.calls.signInWithOtp[0]).toMatchObject({ email: 'a@b.com' });
  });

  it('signOut clears the session and calls supabase signOut', async () => {
    const auth = createFakeAuthClient({
      session: makeSession(),
      profile: makeProfile(),
    });
    render(
      <AuthProvider client={auth.client}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('signed-in')).toHaveTextContent('yes'),
    );
    await act(async () => {
      screen.getByText('out').click();
    });
    expect(auth.calls.signOut).toBe(1);
    await waitFor(() =>
      expect(screen.getByTestId('signed-in')).toHaveTextContent('no'),
    );
  });

  it('useAuth throws outside a provider', () => {
    // Silence the React error boundary console noise for the expected throw.
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  });
});
