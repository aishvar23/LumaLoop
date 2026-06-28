/**
 * Tests for the mobile feed gate (accounts pivot — mirrors web
 * `src/auth/RequireAuth.test.tsx`). Asserts the THREE gate states render the right
 * surface and NEVER leak the feed (children) early. The Supabase client + deep-link
 * source are injected fakes (no native modules, no real backend).
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from './AuthProvider';
import RequireAuth from './RequireAuth';
import {
  createFakeAuthClient,
  createFakeLinking,
  makeProfile,
  makeSession,
  type FakeAuthOptions,
} from './testFakes';

function renderGuard(options: FakeAuthOptions) {
  const auth = createFakeAuthClient(options);
  const linking = createFakeLinking();
  render(
    <AuthProvider client={auth.client} linking={linking} appleNative={false}>
      <RequireAuth>
        <Text>FEED CONTENT</Text>
      </RequireAuth>
    </AuthProvider>,
  );
  return auth;
}

describe('RequireAuth (three gate states)', () => {
  it('signed out → shows the login screen, never the feed', async () => {
    renderGuard({ session: null, profile: null });
    await waitFor(() => expect(screen.getByText('Witzy')).toBeTruthy());
    expect(screen.queryByText('FEED CONTENT')).toBeNull();
  });

  it('signed in WITHOUT a profile → shows profile creation, never the feed', async () => {
    renderGuard({ session: makeSession(), profile: null });
    await waitFor(() =>
      expect(screen.getByText('Create your profile')).toBeTruthy(),
    );
    expect(screen.queryByText('FEED CONTENT')).toBeNull();
  });

  it('signed in WITH a profile → renders the feed (children)', async () => {
    renderGuard({ session: makeSession(), profile: makeProfile() });
    await waitFor(() => expect(screen.getByText('FEED CONTENT')).toBeTruthy());
    expect(screen.queryByText('Witzy')).toBeNull();
  });
});
