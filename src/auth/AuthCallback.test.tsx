import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AuthCallback from './AuthCallback';
import { createFakeAuthClient } from './testFakes';

function renderCallback(href: string, auth = createFakeAuthClient()) {
  render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route
          path="/auth/callback"
          element={<AuthCallback client={auth.client} href={href} />}
        />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return auth;
}

describe('AuthCallback', () => {
  it('exchanges the PKCE code then redirects to /', async () => {
    const auth = renderCallback(
      'https://app.example.com/auth/callback?code=abc123',
    );
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(auth.calls.exchangeCodeForSession).toHaveLength(1);
  });

  it('redirects to / even with no code in the URL (detectSessionInUrl path)', async () => {
    const auth = renderCallback('https://app.example.com/auth/callback');
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(auth.calls.exchangeCodeForSession).toHaveLength(0);
  });
});
