import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import HomePage from './HomePage';
import { AuthProvider } from '../auth/AuthProvider';
import {
  createFakeAuthClient,
  makeProfile,
  makeSession,
} from '../auth/testFakes';
import type { FeaturedGame } from '../cards/featured';
import type { UserStatus } from '../social/statusFeed';
import type { GamePlay } from '../auth/types';

const FEATURED: FeaturedGame[] = [
  {
    templateType: 'spot_it',
    label: 'Spot it',
    category: 'visual_attention',
    difficulty: 'easy',
    estimatedSeconds: 20,
    cardId: 'spot_it-1',
    mechanic: 'anomaly',
  },
  {
    templateType: 'tiny_logic',
    label: 'Tiny logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    estimatedSeconds: 30,
    cardId: 'tiny_logic-1',
    mechanic: 'deduction',
  },
];

const STATUSES: UserStatus[] = [
  {
    userId: 'u9',
    handle: 'gridwise',
    displayName: 'Grid Wise',
    avatarUrl: null,
    monogram: 'G',
    isOwn: false,
    latestAt: '2026-06-03T00:00:00Z',
    items: [
      {
        id: 's1',
        cardId: 'spot_it-1',
        gameTitle: 'Spot it',
        outcome: 'correct',
        outcomeLabel: 'solved',
        points: 120,
        createdAt: '2026-06-03T00:00:00Z',
      },
    ],
  },
];

function renderHome(plays: GamePlay[] = [], statuses?: UserStatus[]) {
  const auth = createFakeAuthClient({
    session: makeSession(),
    profile: makeProfile(),
    plays,
  });
  render(
    <AuthProvider client={auth.client}>
      <MemoryRouter>
        <HomePage featuredGames={FEATURED} statuses={statuses} />
      </MemoryRouter>
    </AuthProvider>,
  );
  return auth;
}

describe('HomePage', () => {
  it('greets the signed-in user and routes "Start playing" into the feed', async () => {
    renderHome();
    expect(
      await screen.findByRole('heading', { name: /welcome back, player one/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start playing/i })).toHaveAttribute(
      'href',
      '/feed',
    );
    // A link to the user's profile is present (fills the prior nav gap).
    expect(screen.getByRole('link', { name: /open your profile/i })).toHaveAttribute(
      'href',
      '/you',
    );
  });

  it('renders the stats snapshot from game plays', async () => {
    renderHome();
    // Empty history → 0 games played, shown once stats resolve.
    await waitFor(() =>
      expect(screen.getByText('Games played')).toBeInTheDocument(),
    );
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Best streak')).toBeInTheDocument();
    expect(screen.getByText('Total points')).toBeInTheDocument();
  });

  it('shows the featured game tiles, each entering the feed', async () => {
    renderHome();
    const spotIt = await screen.findByRole('link', { name: /spot it/i });
    expect(spotIt).toHaveAttribute('href', '/feed');
    expect(screen.getByRole('link', { name: /tiny logic/i })).toHaveAttribute(
      'href',
      '/feed',
    );
  });

  it('shows a Recent activity rail of per-user status bubbles and opens the viewer', async () => {
    renderHome([], STATUSES);
    await screen.findByRole('heading', { name: /welcome back/i });
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
    const bubble = screen.getByTestId('home-status-u9');
    expect(bubble).toHaveTextContent('@gridwise');
    // Tapping a bubble opens the WhatsApp-style status viewer.
    expect(screen.queryByTestId('status-viewer')).not.toBeInTheDocument();
    fireEvent.click(bubble);
    const viewer = screen.getByTestId('status-viewer');
    expect(viewer).toBeInTheDocument();
    expect(within(viewer).getByText('Spot it')).toBeInTheDocument();
  });

  it('omits the Recent activity rail when there are no shares', async () => {
    renderHome([], []);
    await screen.findByRole('heading', { name: /welcome back/i });
    expect(
      screen.queryByRole('heading', { name: /recent activity/i }),
    ).not.toBeInTheDocument();
  });

  it('reveals a "coming soon" notice when the greyed Upload puzzle button is clicked', async () => {
    renderHome();
    await screen.findByRole('heading', { name: /welcome back/i });
    const upload = screen.getByRole('button', { name: /upload puzzle/i });
    // It is a button (not a link) and marked unavailable to assistive tech.
    expect(upload).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    fireEvent.click(upload);
    expect(
      screen.getByText(/uploading your own puzzles is coming soon/i),
    ).toBeInTheDocument();
  });
});
