/**
 * Tests for the in-feed exit affordance (Design §8.3, Technical Design §14;
 * Azure DevOps #72).
 *
 * The control must be a CLEAR exit path with a minimal deliberate confirm, and
 * must never read as a skip (there is no skip affordance in the prototype).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ExitControl from './ExitControl';

describe('ExitControl', () => {
  it('shows a clear "End session" control that is not a skip', () => {
    render(<ExitControl onExit={() => {}} />);

    expect(screen.getByTestId('exit-open')).toHaveTextContent(/end session/i);
    // No skip wording anywhere — leaving ends the session, never skips a card.
    expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();
  });

  it('requires a deliberate confirm before leaving', () => {
    const onExit = vi.fn();
    render(<ExitControl onExit={onExit} />);

    // The first tap only opens the confirm — it does not leave yet.
    fireEvent.click(screen.getByTestId('exit-open'));
    expect(screen.getByTestId('exit-confirm')).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();

    // Confirming leaves.
    fireEvent.click(screen.getByTestId('exit-confirm-leave'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirm keeps the session without leaving', () => {
    const onExit = vi.fn();
    render(<ExitControl onExit={onExit} />);

    fireEvent.click(screen.getByTestId('exit-open'));
    fireEvent.click(screen.getByTestId('exit-cancel'));

    // Back to the single clear control; the leave action never fired.
    expect(screen.queryByTestId('exit-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('exit-open')).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});
