/**
 * Tests for the mobile other-user profile screen (RN counterpart of web
 * `src/social/UserProfilePage.test.tsx`). Injected fake client.
 */
import { render, screen } from '@testing-library/react-native';

import UserProfileScreen from './UserProfileScreen';
import { AuthProvider } from './auth/AuthProvider';
import { createFakeAuthClient, makeProfile, makeSession } from './auth/testFakes';
import type { Profile } from './core/auth/types';

function renderUser(userId: string, profile: Profile | null) {
  const auth = createFakeAuthClient({ session: makeSession(), profile });
  render(
    <AuthProvider client={auth.client}>
      <UserProfileScreen userId={userId} onBack={jest.fn()} onStart={jest.fn()} />
    </AuthProvider>,
  );
}

describe('UserProfileScreen (mobile)', () => {
  it("renders another user's header, counts, public stats and a follow button", async () => {
    renderUser(
      'u2',
      makeProfile({ id: 'u2', handle: 'gridwise', display_name: 'Grid Wise', bio: 'hello there' }),
    );
    expect(await screen.findByText('Grid Wise', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('@gridwise')).toBeTruthy();
    expect(screen.getByText('hello there')).toBeTruthy();
    expect(screen.getByTestId('followers-count')).toBeTruthy();
    expect(screen.getByText('Accuracy')).toBeTruthy();
    expect(screen.getByTestId('follow-button')).toBeTruthy();
  });

  it('shows "User not found" when the profile cannot be loaded', async () => {
    renderUser('ghost', null);
    expect(await screen.findByText(/user not found/i, undefined, { timeout: 3000 })).toBeTruthy();
  });
});
