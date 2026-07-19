import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import PeopleSearchPage from './PeopleSearchPage';
import { AuthProvider } from '../auth/AuthProvider';
import { createFakeAuthClient, makeProfile, makeSession } from '../auth/testFakes';
import type { ProfileLite } from './userDiscoveryApi';

const RESULTS: ProfileLite[] = [
  { id: 'u2', handle: 'gridwise', displayName: 'Grid Wise', avatarUrl: null, bio: null },
];

function renderPage(search: typeof import('./userDiscoveryApi').searchProfiles) {
  const auth = createFakeAuthClient({ session: makeSession(), profile: makeProfile() });
  render(
    <AuthProvider client={auth.client}>
      <MemoryRouter>
        <PeopleSearchPage search={search} debounceMs={0} />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('PeopleSearchPage', () => {
  it('searches as you type and lists results with a profile link + follow', async () => {
    const search = vi.fn(async () => RESULTS);
    renderPage(search);
    fireEvent.change(screen.getByTestId('people-search-input'), {
      target: { value: 'gr' },
    });
    expect(await screen.findByText('@gridwise')).toBeInTheDocument();
    expect(search).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /grid wise/i })).toHaveAttribute(
      'href',
      '/u/u2',
    );
    expect(screen.getByTestId('follow-button')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const search = vi.fn(async () => []);
    renderPage(search);
    fireEvent.change(screen.getByTestId('people-search-input'), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText(/no one found/i)).toBeInTheDocument();
  });
});
