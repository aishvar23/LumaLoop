/**
 * Tests for the mobile people-search screen (RN counterpart of web
 * `src/social/PeopleSearchPage.test.tsx`). Injected fake client + search seam.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import PeopleSearchScreen from './PeopleSearchScreen';
import { AuthProvider } from './auth/AuthProvider';
import { createFakeAuthClient, makeProfile, makeSession } from './auth/testFakes';
import type { ProfileLite } from './social/userDiscoveryApi';

const RESULTS: ProfileLite[] = [
  { id: 'u2', handle: 'gridwise', displayName: 'Grid Wise', avatarUrl: null, bio: null },
];

function renderScreen(
  search: typeof import('./social/userDiscoveryApi').searchProfiles,
  onOpenUser = jest.fn(),
) {
  const auth = createFakeAuthClient({ session: makeSession(), profile: makeProfile() });
  render(
    <AuthProvider client={auth.client}>
      <PeopleSearchScreen
        onBack={jest.fn()}
        onOpenUser={onOpenUser}
        search={search}
        debounceMs={0}
      />
    </AuthProvider>,
  );
  return { onOpenUser };
}

describe('PeopleSearchScreen (mobile)', () => {
  it('searches as you type, lists results, and opens a result', async () => {
    const search = jest.fn(async () => RESULTS);
    const { onOpenUser } = renderScreen(search);
    fireEvent.changeText(screen.getByTestId('people-search-input'), 'gr');
    expect(await screen.findByText('@gridwise')).toBeTruthy();
    fireEvent.press(screen.getByTestId('people-row-u2'));
    expect(onOpenUser).toHaveBeenCalledWith('u2');
  });

  it('shows an empty state when nothing matches', async () => {
    const search = jest.fn(async () => []);
    renderScreen(search);
    fireEvent.changeText(screen.getByTestId('people-search-input'), 'zzz');
    expect(await screen.findByText(/no one found/i)).toBeTruthy();
  });
});
