/**
 * Tests for the mobile status story viewer (RN counterpart of web
 * `src/social/StatusViewer.test.tsx`). Auto-advance disabled for determinism.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import StatusViewer from './StatusViewer';
import type { ShareItem, UserStatus } from './statusFeed';
import type { LiquidCard } from '../core/cards/types';
import type { RendererRegistry } from '../feed/rendererRegistry';

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

  it('renders a faded preview of the actual game screen when the card resolves', () => {
    const card = {
      cardId: 'a-card',
      templateType: 'spot_it',
      category: 'visual_attention',
      config: { timeLimitMs: 1000 },
    } as unknown as LiquidCard;
    const Stub = () => <Text testID="stub-game">game screen</Text>;
    const registry = { spot_it: Stub } as unknown as RendererRegistry;
    renderViewer({
      getCardById: (id) => (id === 'a-card' ? card : undefined),
      registry,
    });
    // The preview is decorative (hidden from accessibility) → opt in to find it.
    expect(screen.getByTestId('status-preview', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('stub-game', { includeHiddenElements: true })).toBeTruthy();
  });

  it('omits the preview when the card cannot be resolved', () => {
    renderViewer({ getCardById: () => undefined });
    expect(screen.queryByTestId('status-preview')).toBeNull();
    expect(screen.getByText('Spot it')).toBeTruthy();
  });
});
