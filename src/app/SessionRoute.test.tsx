import { fireEvent, render, screen } from '@testing-library/react';
import SessionRoute from './SessionRoute';

describe('SessionRoute', () => {
  it('starts in the start phase showing the StartScreen choices', () => {
    render(<SessionRoute />);

    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /choose a session/i }),
    ).toBeInTheDocument();
    // The in-progress surface is not shown until a mode is chosen.
    expect(
      screen.queryByRole('heading', { name: /session in progress/i }),
    ).not.toBeInTheDocument();
  });

  it('advances to the in-progress placeholder reflecting the chosen mode', () => {
    render(<SessionRoute />);

    fireEvent.click(screen.getByRole('button', { name: /3-minute reset/i }));

    expect(
      screen.getByRole('heading', { name: /session in progress/i }),
    ).toBeInTheDocument();
    // Reflects the chosen mode + its (MODE_DEFAULTS-derived) card limit.
    expect(screen.getByText(/3-minute reset/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 7 cards/i)).toBeInTheDocument();
    // The start choices are gone — the route swapped phase, not just appended.
    expect(
      screen.queryByRole('heading', { name: /choose a session/i }),
    ).not.toBeInTheDocument();
  });

  it('carries the one_minute_rescue choice into the in-progress placeholder', () => {
    render(<SessionRoute />);

    fireEvent.click(screen.getByRole('button', { name: /1-minute rescue/i }));

    expect(
      screen.getByRole('heading', { name: /session in progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1-minute rescue/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 3 cards/i)).toBeInTheDocument();
  });
});
