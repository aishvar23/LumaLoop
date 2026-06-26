import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import StatusViewer from './StatusViewer';
import type { ShareItem, UserStatus } from './statusFeed';

const item = (over: Partial<ShareItem> & Pick<ShareItem, 'id' | 'gameTitle'>): ShareItem => ({
  cardId: `${over.id}-card`,
  outcome: 'correct',
  outcomeLabel: 'solved',
  points: 120,
  createdAt: '2026-06-25T12:00:00Z',
  ...over,
});

const status: UserStatus = {
  userId: 'u1',
  handle: 'gridwise',
  displayName: 'Grid Wise',
  avatarUrl: null,
  monogram: 'G',
  isOwn: false,
  latestAt: '2026-06-25T12:00:00Z',
  items: [
    item({ id: 'a', gameTitle: 'Spot it' }),
    item({ id: 'b', gameTitle: 'Tiny logic', outcomeLabel: 'played', points: 0 }),
  ],
};

function renderViewer(over: Partial<React.ComponentProps<typeof StatusViewer>> = {}) {
  const onClose = vi.fn();
  const onPlay = vi.fn();
  render(
    <StatusViewer status={status} onClose={onClose} onPlay={onPlay} autoAdvanceMs={0} {...over} />,
  );
  return { onClose, onPlay };
}

describe('StatusViewer', () => {
  it('shows the first share and steps forward/back through the user’s shares', () => {
    renderViewer();
    expect(screen.getByText('Spot it')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('status-next'));
    expect(screen.getByText('Tiny logic')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('status-prev'));
    expect(screen.getByText('Spot it')).toBeInTheDocument();
  });

  it('plays the current shared game', () => {
    const { onPlay } = renderViewer();
    fireEvent.click(screen.getByTestId('status-play'));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', gameTitle: 'Spot it' }));
  });

  it('closes via the close button and via Escape', () => {
    const { onClose } = renderViewer();
    fireEvent.click(screen.getByTestId('status-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('advancing past the last share closes the viewer', () => {
    const { onClose } = renderViewer();
    fireEvent.click(screen.getByTestId('status-next')); // → item b (last)
    fireEvent.click(screen.getByTestId('status-next')); // past last → close
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the result (outcome + points)', () => {
    renderViewer();
    expect(screen.getByText(/solved · \+120 pts/i)).toBeInTheDocument();
  });
});
