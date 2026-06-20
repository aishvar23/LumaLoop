import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './router';
import { buildCardDeepLink } from './routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it('renders the endless feed at `/` with the one-time data notice over it', () => {
    renderAt('/');
    // `/` is now the feed surface (#107), named by a visually-hidden heading.
    expect(
      screen.getByRole('heading', { name: 'Game feed' }),
    ).toBeInTheDocument();
    // The §21.8 non-assessment notice is preserved as a first-run gate.
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
    // The retired start-screen mode chooser is gone.
    expect(
      screen.queryByRole('heading', { name: 'Choose a session' }),
    ).not.toBeInTheDocument();
  });

  it('no longer serves the standalone `/feed` preview route (folded into `/`)', () => {
    renderAt('/feed');
    // `/feed` is retired (#107): it falls through to the not-found surface.
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('renders the deep-link placeholder and exposes the decoded cardId', () => {
    renderAt('/c/card-42');
    expect(
      screen.getByRole('heading', { name: 'Shared card' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('deep-link-card-id')).toHaveTextContent(
      'card-42',
    );
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
    // It is not the feed or deep-link surface.
    expect(
      screen.queryByRole('heading', { name: 'Game feed' }),
    ).not.toBeInTheDocument();
  });

  it('routes "Back to the feed" through a client-side link to `/`', () => {
    renderAt('/totally/unknown');
    const back = screen.getByRole('link', { name: 'Back to the feed' });
    // React Router `Link` resolves to the session route and renders an anchor
    // with the in-app href, so navigation stays client-side (no full reload).
    expect(back).toHaveAttribute('href', '/');
  });
});
