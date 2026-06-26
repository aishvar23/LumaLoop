import { describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import { fetchRecentShares, shareGame } from './gameShareApi';

/** A fake client capturing inserts and scripting `.select().order().limit()`. */
function fakeClient(scripted: { data: unknown[] | null; error: unknown }) {
  const inserts: unknown[] = [];
  const client = {
    from() {
      const builder = {
        insert: (row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(scripted),
      };
      return builder;
    },
  } as unknown as AuthClient;
  return { client, inserts };
}

const shareRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  card_id: 'spot_it-1',
  user_id: 'u1',
  outcome: 'correct',
  points: 120,
  created_at: '2026-06-03T00:00:00Z',
  profiles: { handle: 'gridwise', display_name: 'Grid Wise', avatar_url: null },
  ...over,
});

describe('shareGame', () => {
  it('inserts a share row with outcome + points for the signed-in user', async () => {
    const { client, inserts } = fakeClient({ data: [], error: null });
    const res = await shareGame(client, {
      userId: 'u1',
      cardId: 'spot_it-1',
      outcome: 'correct',
      points: 120,
    });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toEqual({
      user_id: 'u1',
      card_id: 'spot_it-1',
      outcome: 'correct',
      points: 120,
    });
  });

  it('no-ops when signed out', async () => {
    const { client, inserts } = fakeClient({ data: [], error: null });
    const res = await shareGame(client, {
      userId: null,
      cardId: 'spot_it-1',
      outcome: 'correct',
      points: 10,
    });
    expect(res.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe('fetchRecentShares', () => {
  it('shapes rows and flattens the embedded sharer profile', async () => {
    const { client } = fakeClient({ data: [shareRow()], error: null });
    const rows = await fetchRecentShares(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 's1',
      userId: 'u1',
      handle: 'gridwise',
      cardId: 'spot_it-1',
      outcome: 'correct',
      points: 120,
    });
  });

  it('coerces a bad outcome/points defensively', async () => {
    const { client } = fakeClient({
      data: [shareRow({ outcome: 'weird', points: -5 })],
      error: null,
    });
    const [r] = await fetchRecentShares(client);
    expect(r.outcome).toBe('incorrect');
    expect(r.points).toBe(0);
  });

  it('degrades to an empty list on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    expect(await fetchRecentShares(client)).toEqual([]);
  });
});

// Guard: a throwing client never escapes (best-effort contract).
describe('shareGame resilience', () => {
  it('returns ok:false when the client throws', async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error('network');
      }),
    } as unknown as AuthClient;
    expect(await shareGame(client, { userId: 'u', cardId: 'c', outcome: 'correct', points: 1 })).toEqual({
      ok: false,
    });
  });
});
