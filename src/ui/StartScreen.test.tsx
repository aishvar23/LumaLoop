import { fireEvent, render, screen } from '@testing-library/react';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('renders the brand heading and both session-mode choices', () => {
    render(<StartScreen />);

    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
    // Both documented choices are present as accessible controls (Design §8.1).
    expect(
      screen.getByRole('button', { name: /1-minute rescue/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /3-minute reset/i }),
    ).toBeInTheDocument();
  });

  it('shows the required anonymous-data, non-assessment notice (§21.8)', () => {
    render(<StartScreen />);

    expect(
      screen.getByText(/anonymous interaction events/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
  });

  it('spells out each choice limit in text, not colour alone', () => {
    render(<StartScreen />);

    // The card-count limit is written into every choice's accessible name.
    expect(
      screen.getByRole('button', { name: /up to 3 cards/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /up to 7 cards/i }),
    ).toBeInTheDocument();
  });

  it('calls onStart with one_minute_rescue when that choice is picked', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: /1-minute rescue/i }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('one_minute_rescue');
  });

  it('calls onStart with three_minute_reset when that choice is picked', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: /3-minute reset/i }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('three_minute_reset');
  });

  it('renders standalone without an onStart prop (no-op default)', () => {
    render(<StartScreen />);

    // Clicking a choice without a handler must not throw.
    fireEvent.click(screen.getByRole('button', { name: /3-minute reset/i }));
    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
  });
});
