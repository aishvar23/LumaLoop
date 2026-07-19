import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Wordmark from './Wordmark';

describe('Wordmark', () => {
  it('exposes the accessible name "Witzy" (not the dotless-i glyph)', () => {
    render(<Wordmark />);
    expect(screen.getByLabelText('Witzy')).toBeInTheDocument();
  });

  it('renders the spark accent that dots the "i"', () => {
    render(<Wordmark />);
    expect(screen.getByText('✦')).toBeInTheDocument();
  });

  it('forwards a className for per-surface sizing', () => {
    render(<Wordmark className="home-wordmark" />);
    expect(screen.getByLabelText('Witzy')).toHaveClass('wordmark');
    expect(screen.getByLabelText('Witzy')).toHaveClass('home-wordmark');
  });
});
