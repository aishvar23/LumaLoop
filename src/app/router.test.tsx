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
  it('renders the session placeholder at `/`, keeping the disclaimer', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
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
    // It is not the session or deep-link surface.
    expect(
      screen.queryByRole('heading', { name: 'LumaLoop' }),
    ).not.toBeInTheDocument();
  });
});
