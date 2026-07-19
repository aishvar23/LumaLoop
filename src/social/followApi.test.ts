import { describe, expect, it } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import {
  fetchFollowCounts,
  fetchFollowing,
  followUser,
  isFollowing,
  unfollowUser,
} from './followApi';

interface Calls {
  from: string[];
  eq: unknown[][];
  upsert: { row: unknown; opts: unknown }[];
  deletes: number;
}

/** Queue-based chainable fake: each awaited chain consumes the next result. */
function fakeClient(results: unknown[]) {
  const calls: Calls = { from: [], eq: [], upsert: [], deletes: 0 };
  let i = 0;
  const next = () => results[Math.min(i++, results.length - 1)];
  function chain() {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (...a: unknown[]) => {
      calls.eq.push(a);
      return c;
    };
    c.in = () => c;
    c.order = () => c;
    c.limit = () => Promise.resolve(next());
    c.maybeSingle = () => Promise.resolve(next());
    c.upsert = (row: unknown, opts: unknown) => {
      calls.upsert.push({ row, opts });
      return Promise.resolve(next());
    };
    c.delete = () => {
      calls.deletes += 1;
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => resolve(next());
    return c;
  }
  const client = {
    from: (t: string) => {
      calls.from.push(t);
      return chain();
    },
  } as unknown as AuthClient;
  return { client, calls };
}

describe('followUser / unfollowUser', () => {
  it('upserts a follow edge for the follower', async () => {
    const { client, calls } = fakeClient([{ error: null }]);
    const res = await followUser(client, { followerId: 'me', followeeId: 'them' });
    expect(res.ok).toBe(true);
    expect(calls.from).toContain('follows');
    expect(calls.upsert[0].row).toEqual({ follower_id: 'me', followee_id: 'them' });
  });

  it('no-ops on a self-follow or empty input', async () => {
    const { client, calls } = fakeClient([{ error: null }]);
    expect((await followUser(client, { followerId: 'me', followeeId: 'me' })).ok).toBe(false);
    expect((await followUser(client, { followerId: null, followeeId: 'x' })).ok).toBe(false);
    expect(calls.upsert).toHaveLength(0);
  });

  it('deletes the follow edge on unfollow', async () => {
    const { client, calls } = fakeClient([{ error: null }]);
    expect((await unfollowUser(client, { followerId: 'me', followeeId: 'them' })).ok).toBe(true);
    expect(calls.deletes).toBe(1);
    expect(calls.eq).toEqual([
      ['follower_id', 'me'],
      ['followee_id', 'them'],
    ]);
  });
});

describe('fetchFollowing / isFollowing', () => {
  it('returns the set of followed ids', async () => {
    const { client } = fakeClient([
      { data: [{ followee_id: 'a' }, { followee_id: 'b' }], error: null },
    ]);
    const set = await fetchFollowing(client, 'me');
    expect([...set].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty set on error', async () => {
    const { client } = fakeClient([{ data: null, error: { message: 'x' } }]);
    expect((await fetchFollowing(client, 'me')).size).toBe(0);
  });

  it('reports whether the viewer follows a user', async () => {
    const yes = fakeClient([{ data: [{ followee_id: 'them' }], error: null }]);
    expect(await isFollowing(yes.client, 'me', 'them')).toBe(true);
    const no = fakeClient([{ data: [], error: null }]);
    expect(await isFollowing(no.client, 'me', 'them')).toBe(false);
  });
});

describe('fetchFollowCounts', () => {
  it('returns follower + following counts', async () => {
    const { client } = fakeClient([
      { count: 3, error: null },
      { count: 5, error: null },
    ]);
    expect(await fetchFollowCounts(client, 'me')).toEqual({ followers: 3, following: 5 });
  });

  it('zeroes on a null user', async () => {
    const { client } = fakeClient([]);
    expect(await fetchFollowCounts(client, null)).toEqual({ followers: 0, following: 0 });
  });
});
