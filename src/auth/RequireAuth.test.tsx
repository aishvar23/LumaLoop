import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from './AuthProvider';
import RequireAuth from './RequireAuth';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
  type FakeAuthOptions,
} from './testFakes';

function renderGuard(options: FakeAuthOptions) {
  const auth = createFakeAuthClient(options);
  render(
    // MemoryRouter: the screens may render links; the guard itself does not.
    <MemoryRouter>
      <AuthProvider client={auth.client}>
        <RequireAuth>
          <div>FEED CONTENT</div>
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>,
  );
  return auth;
}

describe('RequireAuth (three gate states)', () => {
  it('signed out → shows the login screen, never the feed', async () => {
    renderGuard({ session: null, profile: null });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'LumaLoop' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('FEED CONTENT')).not.toBeInTheDocument();
  });

  it('signed in WITHOUT a profile → shows profile creation, never the feed', async () => {
    renderGuard({ session: makeSession(), profile: null });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Create your profile' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('FEED CONTENT')).not.toBeInTheDocument();
  });

  it('signed in WITH a profile → renders the feed (children)', async () => {
    renderGuard({ session: makeSession(), profile: makeProfile() });
    await waitFor(() =>
      expect(screen.getByText('FEED CONTENT')).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'LumaLoop' }),
    ).not.toBeInTheDocument();
  });
});
