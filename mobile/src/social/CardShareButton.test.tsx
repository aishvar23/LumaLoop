/**
 * Tests for the mobile Share-to-status button (RN counterpart of web
 * `src/social/CardShareButton.test.tsx`). Injected fake client; no real backend.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AuthClient } from '../auth/authClient';
import CardShareButton from './CardShareButton';
import { SocialConfigProvider } from './SocialContext';

function fakeClient() {
  const inserts: unknown[] = [];
  const client = {
    from() {
      return {
        insert: (row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as AuthClient;
  return { client, inserts };
}

describe('CardShareButton (mobile)', () => {
  it('renders nothing without a social provider', () => {
    render(<CardShareButton cardId="spot_it-1" outcome="correct" points={120} />);
    expect(screen.queryByTestId('card-share')).toBeNull();
  });

  it('renders nothing when signed out', () => {
    const { client } = fakeClient();
    render(
      <SocialConfigProvider value={{ client, userId: null }}>
        <CardShareButton cardId="spot_it-1" outcome="correct" points={120} />
      </SocialConfigProvider>,
    );
    expect(screen.queryByTestId('card-share')).toBeNull();
  });

  it('shares the game with its outcome + points, then shows a shared state', async () => {
    const { client, inserts } = fakeClient();
    render(
      <SocialConfigProvider value={{ client, userId: 'u1' }}>
        <CardShareButton cardId="spot_it-1" outcome="correct" points={120} />
      </SocialConfigProvider>,
    );
    const btn = screen.getByTestId('card-share');
    fireEvent.press(btn);
    await waitFor(() =>
      expect(screen.getByText(/shared to your status/i)).toBeTruthy(),
    );
    expect(inserts[0]).toEqual({
      user_id: 'u1',
      card_id: 'spot_it-1',
      outcome: 'correct',
      points: 120,
    });
  });
});
