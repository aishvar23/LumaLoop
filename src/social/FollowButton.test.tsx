import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

function renderBtn(
  targetUserId: string,
  userId: string | null,
  initialFollowing?: boolean,
) {
  const { client, calls } = fakeClient();
  render(
    <SocialConfigProvider value={{ client, userId }}>
      <FollowButton targetUserId={targetUserId} initialFollowing={initialFollowing} />
    </SocialConfigProvider>,
  );
  return calls;
}

describe('FollowButton', () => {
  it('renders nothing for your own id', () => {
    renderBtn('me', 'me', false);
    expect(screen.queryByTestId('follow-button')).not.toBeInTheDocument();
  });

  it('renders nothing when signed out', () => {
    renderBtn('them', null, false);
    expect(screen.queryByTestId('follow-button')).not.toBeInTheDocument();
  });

  it('follows on click (optimistic) and writes the edge', async () => {
    const calls = renderBtn('them', 'me', false);
    const btn = screen.getByTestId('follow-button');
    expect(btn).toHaveTextContent('Follow');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('Following');
    await waitFor(() =>
      expect(calls.upserts[0]).toEqual({ follower_id: 'me', followee_id: 'them' }),
    );
  });

  it('unfollows when already following', async () => {
    const calls = renderBtn('them', 'me', true);
    const btn = screen.getByTestId('follow-button');
    expect(btn).toHaveTextContent('Following');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('Follow');
    await waitFor(() => expect(calls.deletes).toBe(1));
  });
});
