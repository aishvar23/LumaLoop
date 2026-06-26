/**
 * Tests for the mobile status story viewer (RN counterpart of web
 * `src/social/StatusViewer.test.tsx`). Auto-advance disabled for determinism.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

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
  const onClose = jest.fn();
  const onPlay = jest.fn();
  render(
    <StatusViewer status={status} onClose={onClose} onPlay={onPlay} autoAdvanceMs={0} {...over} />,
  );
  return { onClose, onPlay };
}

describe('StatusViewer (mobile)', () => {
  it('steps forward/back through the user’s shares', () => {
    renderViewer();
    expect(screen.getByText('Spot it')).toBeTruthy();
    fireEvent.press(screen.getByTestId('status-next'));
    expect(screen.getByText('Tiny logic')).toBeTruthy();
    fireEvent.press(screen.getByTestId('status-prev'));
    expect(screen.getByText('Spot it')).toBeTruthy();
  });

  it('plays the current shared game', () => {
    const { onPlay } = renderViewer();
    fireEvent.press(screen.getByTestId('status-play'));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('closes via the close button', () => {
    const { onClose } = renderViewer();
    fireEvent.press(screen.getByTestId('status-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('advancing past the last share closes the viewer', () => {
    const { onClose } = renderViewer();
    fireEvent.press(screen.getByTestId('status-next')); // → b (last)
    fireEvent.press(screen.getByTestId('status-next')); // past last → close
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
