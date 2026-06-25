import { describe, expect, it } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import { fetchRecentActivity } from './activityApi';

type Scripted = Record<string, { data: unknown[] | null; error: unknown }>;

/** A tiny fake client scripting `.select().order().limit()` per table. */
function fakeClient(scripted: Scripted): AuthClient {
  return {
    from(table: string) {
      const result = scripted[table] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(result),
      };
      return builder;
    },
  } as unknown as AuthClient;
}

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  card_id: 'spot_it-1',
  user_id: 'u1',
  created_at: '2026-06-03T00:00:00Z',
  profiles: { handle: 'gridwise', display_name: 'Grid Wise', avatar_url: null },
  ...over,
});

const like = (over: Record<string, unknown> = {}) => ({
  card_id: 'tiny_logic-1',
  user_id: 'u2',
  created_at: '2026-06-04T00:00:00Z',
  profiles: { handle: 'mara', display_name: 'Mara', avatar_url: null },
  ...over,
});

describe('fetchRecentActivity', () => {
  it('merges likes + comments newest-first with resolved titles', async () => {
    const client = fakeClient({
      game_comments: { data: [comment()], error: null },
      game_likes: { data: [like()], error: null },
    });
    const feed = await fetchRecentActivity(client, {
      resolveTitle: (id) => (id.startsWith('spot') ? 'Spot it' : 'Tiny logic'),
    });
    expect(feed.map((f) => f.kind)).toEqual(['like', 'comment']); // like is newer
    expect(feed[0].gameTitle).toBe('Tiny logic');
    expect(feed[1].handle).toBe('gridwise');
  });

  it('synthesizes a stable id for likes (no own id column)', async () => {
    const client = fakeClient({
      game_comments: { data: [], error: null },
      game_likes: { data: [like()], error: null },
    });
    const [item] = await fetchRecentActivity(client);
    expect(item.id).toBe('u2:tiny_logic-1');
  });

  it('excludes the viewer’s own activity', async () => {
    const client = fakeClient({
      game_comments: { data: [comment({ user_id: 'me' })], error: null },
      game_likes: { data: [like({ user_id: 'them' })], error: null },
    });
    const feed = await fetchRecentActivity(client, { excludeUserId: 'me' });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('like');
  });

  it('degrades to an empty rail on error', async () => {
    const client = fakeClient({
      game_comments: { data: null, error: { message: 'boom' } },
      game_likes: { data: null, error: { message: 'boom' } },
    });
    expect(await fetchRecentActivity(client)).toEqual([]);
  });
});
