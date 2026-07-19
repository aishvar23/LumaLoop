import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import UserProfilePage from './UserProfilePage';
import { AuthProvider } from '../auth/AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from '../auth/testFakes';
import type { Profile } from '../auth/types';

function renderUser(userId: string, profile: Profile | null) {
  const auth = createFakeAuthClient({ session: makeSession(), profile });
  render(
    <AuthProvider client={auth.client}>
      <MemoryRouter initialEntries={[`/u/${userId}`]}>
        <Routes>
          <Route path="/u/:userId" element={<UserProfilePage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('UserProfilePage', () => {
  it("renders another user's header, counts, public stats and a follow button", async () => {
    renderUser(
      'u2',
      makeProfile({ id: 'u2', handle: 'gridwise', display_name: 'Grid Wise', bio: 'hello there' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Grid Wise' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('@gridwise')).toBeInTheDocument();
    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.getByTestId('followers-count')).toBeInTheDocument();
    expect(screen.getByTestId('following-count')).toBeInTheDocument();
    // Public game stats are shown (viewer ≠ u2 → the follow button renders).
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
    expect(screen.getByTestId('follow-button')).toBeInTheDocument();
  });

  it('shows "User not found" when the profile cannot be loaded', async () => {
    renderUser('ghost', null);
    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
  });
});
