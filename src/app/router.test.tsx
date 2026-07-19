import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './router';
import { buildCardDeepLink } from './routes';
import { catalog } from '../cards/catalog';
import { AuthProvider } from '../auth/AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from '../auth/testFakes';

/**
 * The route table gates `/` (Home landing), `/feed` (the feed) and `/you` behind
 * {@link AuthProvider} + RequireAuth (accounts pivot). Tests mount AppRoutes under
 * an AuthProvider with an injected FAKE Supabase client so we can drive the gate
 * state (signed-in WITH a profile → the gated surface renders). Public routes
 * (`/c/:cardId`, not-found) are unaffected by auth.
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
  it('renders the Home landing at `/` for a signed-in user with a profile', async () => {
    renderAt('/');
    // `/` is the Home landing (accounts pivot), gated behind auth.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /hi player one/i }),
      ).toBeInTheDocument(),
    );
    // It is NOT the feed — that lives at `/feed` now.
    expect(
      screen.queryByRole('heading', { name: 'Game feed' }),
    ).not.toBeInTheDocument();
    // Home routes into the feed via a "Play now" link.
    expect(
      screen.getByRole('link', { name: /play now/i }),
    ).toHaveAttribute('href', '/feed');
  });

  it('renders the endless feed at `/feed` for a signed-in user with a profile', async () => {
    renderAt('/feed');
    // `/feed` is the feed surface (#107), gated behind auth, named by a hidden heading.
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
        screen.getByRole('heading', { name: 'Witzy' }),
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

  it('renders the public challenge arrival surface for a known cardId', () => {
    // `/c/:cardId` is the PUBLIC, playable challenge surface (engagement §4.6) —
    // a real catalog card resolves to its banner with no auth gate involved.
    renderAt(buildCardDeepLink(catalog[0].cardId));
    expect(screen.getByTestId('challenge-banner')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Take on this challenge' }),
    ).toBeInTheDocument();
  });

  it('shows the "not available" panel for an unknown cardId', () => {
    renderAt('/c/does-not-exist');
    expect(
      screen.getByRole('heading', { name: /this challenge isn’t available/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('challenge-banner')).not.toBeInTheDocument();
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

  it('routes "Back to home" through a client-side link to `/`', () => {
    renderAt('/totally/unknown');
    const back = screen.getByRole('link', { name: 'Back to home' });
    expect(back).toHaveAttribute('href', '/');
  });
});
