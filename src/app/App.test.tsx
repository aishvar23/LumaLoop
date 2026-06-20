import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('opens straight into the endless game feed at `/`', () => {
    render(<App />);
    // The feed names its landmark with a visually-hidden heading (#107).
    expect(
      screen.getByRole('heading', { name: 'Game feed' }),
    ).toBeInTheDocument();
    // The retired start-screen mode-choice is gone: no session chooser surface.
    expect(
      screen.queryByRole('heading', { name: 'Choose a session' }),
    ).not.toBeInTheDocument();
  });

  it('shows the one-time anonymous-data, non-assessment notice over the feed', () => {
    render(<App />);
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
  });
});
