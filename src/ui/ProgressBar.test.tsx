/**
 * Tests for {@link ProgressBar} (Azure DevOps #70; Technical Design §8, §14).
 *
 * The bar is presentational: it must reflect the controller's `index` / `total`
 * as an accessible `progressbar` (value attributes) AND as visible text, never
 * by the fill width alone.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('exposes accessible progressbar value attributes for the first card', () => {
    render(<ProgressBar index={0} total={7} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    // Zero cards completed while the first card is in play.
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', 'Card 1 of 7');
  });

  it('advances valuenow and the 1-based label as the index moves', () => {
    render(<ProgressBar index={3} total={7} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuetext', 'Card 4 of 7');
    // The position is spelled out in text, not conveyed by the fill alone.
    expect(screen.getByText('Card 4 of 7')).toBeInTheDocument();
  });

  it('clamps the visible position to the total on the final card', () => {
    // When every card has been advanced past, index === total: the label must
    // not read "Card 8 of 7".
    render(<ProgressBar index={7} total={7} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '7');
    expect(bar).toHaveAttribute('aria-valuetext', 'Card 7 of 7');
  });

  it('handles an empty session window without going out of range', () => {
    render(<ProgressBar index={0} total={0} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemax', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', 'No cards');
  });
});
