import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from '../auth/testFakes';
import type { UserGameScore } from '../auth/types';
import type { LiquidCard } from '../cards/types';
import ProfilePage from './ProfilePage';

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

const fakeGetCardById = (id: string): LiquidCard | undefined =>
  id === 'spotit-001'
    ? ({
        cardId: id,
        category: 'visual_attention',
        prompt: 'Tap the odd one.',
        explanation: { title: 'Odd shape out', body: '' },
      } as unknown as LiquidCard)
    : undefined;

function renderProfile(gameScores: UserGameScore[]) {
  const auth = createFakeAuthClient({
    session: makeSession(),
    profile: makeProfile(),
    gameScores,
  });
  render(
    <AuthProvider client={auth.client}>
      <ProfilePage getCardById={fakeGetCardById} />
    </AuthProvider>,
  );
}

describe('ProfilePage — Your games (D3)', () => {
  it('renders a per-game row with friendly title, best, last and play count', async () => {
    renderProfile([score()]);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your games' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Odd shape out')).toBeInTheDocument();
    expect(screen.getByText('Visual attention')).toBeInTheDocument();
    expect(screen.getByText(/Best 42/)).toBeInTheDocument();
    expect(screen.getByText(/Last 18/)).toBeInTheDocument();
    expect(screen.getByText(/3 plays/)).toBeInTheDocument();
  });

  it('omits the Your games section entirely when nothing has been played', async () => {
    renderProfile([]);
    // The aggregate stats still load (Games played stat present).
    await waitFor(() =>
      expect(screen.getByText('Games played')).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Your games' }),
    ).not.toBeInTheDocument();
  });
});
