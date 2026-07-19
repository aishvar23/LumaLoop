/**
 * Tests for the mobile Follow/Unfollow button (RN counterpart of web
 * `src/social/FollowButton.test.tsx`). Injected fake client; no real backend.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AuthClient } from '../auth/authClient';
import FollowButton from './FollowButton';
import { SocialConfigProvider } from './SocialContext';

function fakeClient() {
  const calls = { upserts: [] as unknown[], deletes: 0 };
  const client = {
    from() {
      const c: Record<string, unknown> = {};
      c.upsert = (row: unknown) => {
        calls.upserts.push(row);
        return Promise.resolve({ error: null });
      };
      c.delete = () => {
        calls.deletes += 1;
        return c;
      };
      c.select = () => c;
      c.eq = () => c;
      c.limit = () => Promise.resolve({ data: [], error: null });
      c.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return c;
    },
  } as unknown as AuthClient;
  return { client, calls };
}

function renderBtn(target: string, userId: string | null, initialFollowing?: boolean) {
  const { client, calls } = fakeClient();
  render(
    <SocialConfigProvider value={{ client, userId }}>
      <FollowButton targetUserId={target} initialFollowing={initialFollowing} />
    </SocialConfigProvider>,
  );
  return calls;
}

describe('FollowButton (mobile)', () => {
  it('renders nothing for your own id or when signed out', () => {
    renderBtn('me', 'me', false);
    expect(screen.queryByTestId('follow-button')).toBeNull();
  });

  it('follows on press and writes the edge', async () => {
    const calls = renderBtn('them', 'me', false);
    const btn = screen.getByTestId('follow-button');
    expect(screen.getByText('Follow')).toBeTruthy();
    fireEvent.press(btn);
    expect(screen.getByText('Following')).toBeTruthy();
    await waitFor(() =>
      expect(calls.upserts[0]).toEqual({ follower_id: 'me', followee_id: 'them' }),
    );
  });

  it('unfollows when already following', async () => {
    const calls = renderBtn('them', 'me', true);
    fireEvent.press(screen.getByTestId('follow-button'));
    expect(screen.getByText('Follow')).toBeTruthy();
    await waitFor(() => expect(calls.deletes).toBe(1));
  });
});
