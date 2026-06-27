
import type { AuthClient } from '../auth/authClient';
import {
  fetchProfileById,
  fetchPublicStats,
  publicAccuracy,
  searchProfiles,
} from './userDiscoveryApi';

interface Calls {
  from: string[];
  or: unknown[];
}

function fakeClient(results: unknown[]) {
  const calls: Calls = { from: [], or: [] };
  let i = 0;
  const next = () => results[Math.min(i++, results.length - 1)];
  function chain() {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.or = (...a: unknown[]) => {
      calls.or.push(a);
      return c;
    };
    c.eq = () => c;
    c.limit = () => Promise.resolve(next());
    c.maybeSingle = () => Promise.resolve(next());
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

describe('searchProfiles', () => {
  it('shapes results and drops the viewer themselves', async () => {
    const { client, calls } = fakeClient([
      {
        data: [
          { id: 'u2', handle: 'gridwise', display_name: 'Grid Wise', avatar_url: null, bio: 'hi' },
          { id: 'me', handle: 'me', display_name: 'Me', avatar_url: null, bio: null },
        ],
        error: null,
      },
    ]);
    const res = await searchProfiles(client, 'gr', { excludeUserId: 'me' });
    expect(res.map((p) => p.id)).toEqual(['u2']);
    expect(res[0]).toMatchObject({ handle: 'gridwise', displayName: 'Grid Wise', bio: 'hi' });
    expect(String(calls.or[0])).toContain('ilike');
  });

  it('returns [] for an empty/whitespace query without querying', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    expect(await searchProfiles(client, '   ')).toEqual([]);
    expect(calls.from).toHaveLength(0);
  });

  it('sanitises the query so it cannot break the or() filter', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await searchProfiles(client, 'a),b*(');
    // Only handle-safe chars survive ("ab").
    expect(String(calls.or[0])).toContain('*ab*');
  });
});

describe('fetchProfileById', () => {
  it('loads and shapes a single profile', async () => {
    const { client } = fakeClient([
      { data: { id: 'u2', handle: 'gridwise', display_name: 'Grid', avatar_url: null, bio: 'hi' }, error: null },
    ]);
    expect(await fetchProfileById(client, 'u2')).toEqual({
      id: 'u2',
      handle: 'gridwise',
      displayName: 'Grid',
      avatarUrl: null,
      bio: 'hi',
    });
  });

  it('returns null on error / not found', async () => {
    const { client } = fakeClient([{ data: null, error: null }]);
    expect(await fetchProfileById(client, 'nope')).toBeNull();
  });
});

describe('fetchPublicStats / publicAccuracy', () => {
  it('shapes the public aggregate', async () => {
    const { client } = fakeClient([
      { data: { games_played: 75, correct_count: 27, total_points: 1691 }, error: null },
    ]);
    const stats = await fetchPublicStats(client, 'u2');
    expect(stats).toEqual({ gamesPlayed: 75, correctCount: 27, totalPoints: 1691 });
    expect(publicAccuracy(stats)).toBeCloseTo(0.36, 2);
  });

  it('zeroes on error and accuracy is 0 with no games', async () => {
    const { client } = fakeClient([{ data: null, error: { message: 'x' } }]);
    const stats = await fetchPublicStats(client, 'u2');
    expect(stats).toEqual({ gamesPlayed: 0, correctCount: 0, totalPoints: 0 });
    expect(publicAccuracy(stats)).toBe(0);
  });
});
