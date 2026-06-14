import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the LumaLoop start screen', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
  });

  it('shows the anonymous-data, non-assessment notice', () => {
    render(<App />);
    expect(
      screen.getByText(/not a cognitive, medical, school, or employment/i),
    ).toBeInTheDocument();
  });
});
