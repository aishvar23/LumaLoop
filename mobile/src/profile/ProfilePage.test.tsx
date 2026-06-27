/**
 * Tests for the mobile profile screen's paged "Your games" list (accounts pivot).
 * The list is rendered a page at a time with a "Show more" control, not all at
 * once. Injected fake client; no native modules / real backend.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ProfilePage from './ProfilePage';
import { AuthProvider } from '../auth/AuthProvider';
import { createFakeAuthClient, makeProfile, makeSession } from '../auth/testFakes';
import type { UserGameScore } from '../core/auth/types';
import type { LiquidCard } from '../core/cards/types';

const score = (over: Partial<UserGameScore> = {}): UserGameScore => ({
  user_id: 'user-1',
  card_id: 'spotit-001',
  template_type: 'spot_it',
  category: 'visual_attention',
  times_played: 3,
  best_points: 42,
  last_points: 18,
  ever_correct: true,
  last_is_correct: false,
  last_played_at: '2026-06-21T00:00:00Z',
  ...over,
});

// Unresolved cards fall back to titling by cardId, so every row renders.
const noCard = (): LiquidCard | undefined => undefined;

function renderProfile(gameScores: UserGameScore[]) {
  const auth = createFakeAuthClient({
    session: makeSession(),
    profile: makeProfile(),
    gameScores,
  });
  render(
    <AuthProvider client={auth.client}>
      <ProfilePage getCardById={noCard} />
    </AuthProvider>,
  );
}

describe('ProfilePage — paged Your games', () => {
  it('shows the first page and reveals the rest via "Show more"', async () => {
    // 8 games, newest (g-1) → oldest (g-8). Page size 6 → 2 start hidden.
    const many = Array.from({ length: 8 }, (_, i) =>
      score({ card_id: `g-${i + 1}`, last_played_at: `2026-06-${30 - i}T00:00:00Z` }),
    );
    renderProfile(many);

    await waitFor(() => expect(screen.getByText('g-1')).toBeTruthy());
    expect(screen.queryByText('g-7')).toBeNull();
    const more = screen.getByTestId('your-games-show-more');
    fireEvent.press(more);
    expect(screen.getByText('g-7')).toBeTruthy();
    expect(screen.getByText('g-8')).toBeTruthy();
    expect(screen.queryByTestId('your-games-show-more')).toBeNull();
  });

  it('shows no "Show more" control when a single page suffices', async () => {
    renderProfile([score({ card_id: 'only-1' })]);
    await waitFor(() => expect(screen.getByText('only-1')).toBeTruthy());
    expect(screen.queryByTestId('your-games-show-more')).toBeNull();
  });
});
