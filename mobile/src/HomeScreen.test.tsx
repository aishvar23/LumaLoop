/**
 * Tests for the mobile Home / Discover landing screen (accounts pivot — RN
 * counterpart of web `src/profile/HomePage.test.tsx`). The Supabase client is an
 * injected fake; navigation callbacks are spies. No native modules / real backend.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from './HomeScreen';
import { AuthProvider } from './auth/AuthProvider';
import { createFakeAuthClient, makeProfile, makeSession } from './auth/testFakes';
import type { FeaturedGame } from './core/cards/featured';
import type { UserStatus } from './social/statusFeed';

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

function renderHome(statuses?: UserStatus[]) {
  const onStart = jest.fn();
  const onOpenProfile = jest.fn();
  const auth = createFakeAuthClient({
    session: makeSession(),
    profile: makeProfile(),
    plays: [],
  });
  render(
    <AuthProvider client={auth.client}>
      <HomeScreen
        onStart={onStart}
        onOpenProfile={onOpenProfile}
        featuredGames={FEATURED}
        statuses={statuses}
      />
    </AuthProvider>,
  );
  return { onStart, onOpenProfile };
}

describe('HomeScreen', () => {
  it('greets the signed-in user and starts the feed from the CTA', async () => {
    const { onStart } = renderHome();
    await waitFor(() =>
      expect(screen.getByText(/welcome back, player one/i)).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('home-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the profile from the avatar button', async () => {
    const { onOpenProfile } = renderHome();
    await waitFor(() => expect(screen.getByTestId('home-open-profile')).toBeTruthy());
    fireEvent.press(screen.getByTestId('home-open-profile'));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('enters the feed when a featured tile is tapped', async () => {
    const { onStart } = renderHome();
    await waitFor(() => expect(screen.getByTestId('home-tile-spot_it')).toBeTruthy());
    fireEvent.press(screen.getByTestId('home-tile-spot_it'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a Recent activity rail of status bubbles and opens the viewer', async () => {
    const { onStart } = renderHome(STATUSES);
    const bubble = await screen.findByTestId('home-status-u9');
    expect(screen.queryByTestId('status-viewer')).toBeNull();
    fireEvent.press(bubble);
    expect(screen.getByTestId('status-viewer')).toBeTruthy();
    // Play from the viewer enters the feed.
    fireEvent.press(screen.getByTestId('status-play'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('reveals a "coming soon" notice when the greyed Upload puzzle button is tapped', async () => {
    renderHome();
    const upload = await screen.findByTestId('home-upload');
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    fireEvent.press(upload);
    expect(screen.getByText(/uploading your own puzzles is coming soon/i)).toBeTruthy();
  });
});
