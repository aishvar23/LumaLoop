import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './router';
import { buildCardDeepLink } from './routes';
import { AuthProvider } from '../auth/AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from '../auth/testFakes';

/**
 * The route table now gates `/` (and `/you`) behind {@link AuthProvider} +
 * RequireAuth (accounts pivot). Tests mount AppRoutes under an AuthProvider with
 * an injected FAKE Supabase client so we can drive the gate state (signed-in WITH
 * a profile → the feed renders). Public routes (`/c/:cardId`, not-found) are
 * unaffected by auth.
 */
function renderAt(
  path: string,
  auth = createFakeAuthClient({ session: makeSession(), profile: makeProfile() }),
) {
  return render(
    <AuthProvider client={auth.client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppRoutes', () => {
  it('renders the endless feed at `/` for a signed-in user with a profile', async () => {
    renderAt('/');
    // `/` is the feed surface (#107), gated behind auth, named by a hidden heading.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Game feed' }),
      ).toBeInTheDocument(),
    );
    // The §21.8 non-assessment notice is preserved as a first-run gate.
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
  });

  it('shows the login screen at `/` when signed out', async () => {
    const auth = createFakeAuthClient({ session: null, profile: null });
    renderAt('/', auth);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'LumaLoop' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Game feed' }),
    ).not.toBeInTheDocument();
  });

  it('shows profile creation when signed in without a profile', async () => {
    const auth = createFakeAuthClient({ session: makeSession(), profile: null });
    renderAt('/', auth);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Create your profile' }),
      ).toBeInTheDocument(),
    );
  });

  it('no longer serves the standalone `/feed` preview route (folded into `/`)', async () => {
    renderAt('/feed');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeInTheDocument(),
    );
  });

  it('renders the deep-link placeholder and exposes the decoded cardId', () => {
    renderAt('/c/card-42');
    expect(
      screen.getByRole('heading', { name: 'Shared card' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('deep-link-card-id')).toHaveTextContent('card-42');
  });

  it('decodes an encoded cardId param from a built deep link', () => {
    const cardId = 'a/b?c#d';
    renderAt(buildCardDeepLink(cardId));
    expect(screen.getByTestId('deep-link-card-id')).toHaveTextContent(cardId);
  });

  it('renders the not-found placeholder for an unknown path', () => {
    renderAt('/totally/unknown');
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Game feed' }),
    ).not.toBeInTheDocument();
  });

  it('routes "Back to the feed" through a client-side link to `/`', () => {
    renderAt('/totally/unknown');
    const back = screen.getByRole('link', { name: 'Back to the feed' });
    expect(back).toHaveAttribute('href', '/');
  });
});
