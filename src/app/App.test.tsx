import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

/**
 * App now gates `/` behind auth (accounts pivot). With the default (placeholder)
 * Supabase client there is no session, so the gate resolves to the LOGIN screen
 * rather than the feed — the feed only shows once a user signs in AND has a
 * profile (covered by the RequireAuth guard tests with an injected fake client).
 * App wiring is verified here; full gated flows live in RequireAuth.test.tsx.
 */
describe('App', () => {
  it('gates `/` behind sign-in: shows the login screen when signed out', async () => {
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'LumaLoop' }),
      ).toBeInTheDocument(),
    );
    // Sign-in affordances are present; the feed is NOT shown to a signed-out user.
    expect(
      screen.getByRole('button', { name: /Continue with Google/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Game feed' }),
    ).not.toBeInTheDocument();
  });
});
