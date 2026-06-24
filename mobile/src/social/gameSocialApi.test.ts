import type { AuthClient } from '../auth/authClient';
import {
  addComment,
  deleteComment,
  fetchGameSocial,
  toggleLike,
} from './gameSocialApi';

/**
 * A scriptable Supabase fake. Each table maps to a function returning the result
 * for whatever terminal the call chain reaches. The builder is chainable
 * (select/eq/order/limit return it) and thenable (await resolves to the scripted
 * result); terminal `.single()` resolves likewise. We record the calls so tests
 * can assert the shape of the request (count/head, filters, ordering).
 */
type Scripted = { data?: unknown; error?: unknown; count?: number };

interface Recorded {
  table: string;
  select?: { columns: string; options?: { count?: string; head?: boolean } };
  eqs: Array<[string, unknown]>;
  order?: [string, { ascending?: boolean }];
  insert?: unknown;
  upsert?: { values: unknown; options?: unknown };
  deleteCalled?: boolean;
}

function makeClient(
  scripts: Record<string, (rec: Recorded) => Scripted>,
): { client: AuthClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client = {
    from(table: string) {
      const rec: Recorded = { table, eqs: [] };
      calls.push(rec);
      const result = () => scripts[table]?.(rec) ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: (columns: string, options?: { count?: string; head?: boolean }) => {
          rec.select = { columns, options };
          return builder;
        },
        eq: (column: string, value: unknown) => {
          rec.eqs.push([column, value]);
          return builder;
        },
        order: (column: string, options: { ascending?: boolean }) => {
          rec.order = [column, options];
          return builder;
        },
        limit: () => builder,
        insert: (values: unknown) => {
          rec.insert = values;
          return builder;
        },
        upsert: (values: unknown, options?: unknown) => {
          rec.upsert = { values, options };
          return builder;
        },
        delete: () => {
          rec.deleteCalled = true;
          return builder;
        },
        single: () => Promise.resolve(result()),
        then: (resolve: (r: Scripted) => unknown) => resolve(result()),
      });
      return builder;
    },
  } as unknown as AuthClient;
  return { client, calls };
}

describe('fetchGameSocial', () => {
  it('returns empty social for an empty cardId (no query)', async () => {
    const { client } = makeClient({});
    const res = await fetchGameSocial(client, '', 'u1');
    expect(res).toEqual({ likeCount: 0, viewerLiked: false, comments: [] });
  });

  it('aggregates like count (head COUNT), viewerLiked, and shaped comments', async () => {
    const { client, calls } = makeClient({
      game_likes: (rec) => {
        // The COUNT query uses head:true; the viewerLiked lookup filters user_id.
        if (rec.select?.options?.head) return { count: 7, error: null };
        return { data: [{ user_id: 'u1' }], error: null };
      },
      game_comments: () => ({
        data: [
          {
            id: 'c1',
            body: 'nice one',
            created_at: '2026-06-21T10:00:00.000Z',
            user_id: 'u1',
            profiles: { handle: 'ash', display_name: 'Ash' },
          },
          {
            id: 'c2',
            body: 'fun',
            created_at: '2026-06-21T09:00:00.000Z',
            user_id: 'u2',
            profiles: { handle: 'bea', display_name: 'Bea' },
          },
        ],
        error: null,
      }),
    });

    const res = await fetchGameSocial(client, 'card-1', 'u1');

    expect(res.likeCount).toBe(7);
    expect(res.viewerLiked).toBe(true);
    expect(res.comments).toHaveLength(2);
    expect(res.comments[0]).toEqual({
      id: 'c1',
      body: 'nice one',
      createdAt: '2026-06-21T10:00:00.000Z',
      authorHandle: 'ash',
      authorDisplayName: 'Ash',
      isOwn: true,
    });
    expect(res.comments[1].isOwn).toBe(false);

    // The count query was head-only; comments ordered newest-first.
    const countCall = calls.find(
      (c) => c.table === 'game_likes' && c.select?.options?.head,
    );
    expect(countCall?.select?.options?.count).toBe('exact');
    const commentsCall = calls.find((c) => c.table === 'game_comments');
    expect(commentsCall?.order).toEqual(['created_at', { ascending: false }]);
  });

  it('viewerLiked is false when signed out (no like lookup query)', async () => {
    const { client } = makeClient({
      game_likes: (rec) =>
        rec.select?.options?.head ? { count: 3, error: null } : { data: [], error: null },
      game_comments: () => ({ data: [], error: null }),
    });
    const res = await fetchGameSocial(client, 'card-1', null);
    expect(res.likeCount).toBe(3);
    expect(res.viewerLiked).toBe(false);
  });

  it('handles an embedded profile returned as an array', async () => {
    const { client } = makeClient({
      game_likes: (rec) =>
        rec.select?.options?.head ? { count: 0, error: null } : { data: [], error: null },
      game_comments: () => ({
        data: [
          {
            id: 'c1',
            body: 'hi',
            created_at: '2026-06-21T10:00:00.000Z',
            user_id: 'u2',
            profiles: [{ handle: 'bea', display_name: 'Bea' }],
          },
        ],
        error: null,
      }),
    });
    const res = await fetchGameSocial(client, 'card-1', 'u1');
    expect(res.comments[0].authorHandle).toBe('bea');
  });

  it('drops malformed comment rows and tolerates null profile', async () => {
    const { client } = makeClient({
      game_likes: (rec) =>
        rec.select?.options?.head ? { count: 0, error: null } : { data: [], error: null },
      game_comments: () => ({
        data: [
          { id: 'c1', body: 'ok', created_at: '2026-06-21T10:00:00.000Z', user_id: 'u3', profiles: null },
          { id: 'c2', body: '', created_at: 'x', user_id: 'u3' }, // empty body → dropped
          null,
          {},
        ],
        error: null,
      }),
    });
    const res = await fetchGameSocial(client, 'card-1', 'u1');
    expect(res.comments).toHaveLength(1);
    expect(res.comments[0].authorHandle).toBeNull();
    expect(res.comments[0].authorDisplayName).toBeNull();
  });

  it('degrades to empty social when the client throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('network');
      },
    } as unknown as AuthClient;
    const res = await fetchGameSocial(throwing, 'card-1', 'u1');
    expect(res).toEqual({ likeCount: 0, viewerLiked: false, comments: [] });
  });

  it('partial failure (comments error) still returns likes', async () => {
    const { client } = makeClient({
      game_likes: (rec) =>
        rec.select?.options?.head ? { count: 4, error: null } : { data: [{ user_id: 'u1' }], error: null },
      game_comments: () => ({ data: null, error: { message: 'boom' } }),
    });
    const res = await fetchGameSocial(client, 'card-1', 'u1');
    expect(res.likeCount).toBe(4);
    expect(res.viewerLiked).toBe(true);
    expect(res.comments).toEqual([]);
  });
});

describe('toggleLike', () => {
  it('upserts the like row when liking', async () => {
    const { client, calls } = makeClient({ game_likes: () => ({ error: null }) });
    const ok = await toggleLike(client, 'card-1', 'u1', true);
    expect(ok).toBe(true);
    const call = calls.find((c) => c.table === 'game_likes');
    expect(call?.upsert?.values).toEqual({ user_id: 'u1', card_id: 'card-1' });
  });

  it('deletes the like row when unliking', async () => {
    const { client, calls } = makeClient({ game_likes: () => ({ error: null }) });
    const ok = await toggleLike(client, 'card-1', 'u1', false);
    expect(ok).toBe(true);
    const call = calls.find((c) => c.table === 'game_likes');
    expect(call?.deleteCalled).toBe(true);
    expect(call?.eqs).toContainEqual(['user_id', 'u1']);
    expect(call?.eqs).toContainEqual(['card_id', 'card-1']);
  });

  it('returns false (no-op) when signed out', async () => {
    const fromSpy = jest.fn();
    const client = { from: fromSpy } as unknown as AuthClient;
    expect(await toggleLike(client, 'card-1', null, true)).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('returns false on a write error', async () => {
    const { client } = makeClient({ game_likes: () => ({ error: { message: 'rls' } }) });
    expect(await toggleLike(client, 'card-1', 'u1', true)).toBe(false);
  });

  it('never throws when the client throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('boom');
      },
    } as unknown as AuthClient;
    expect(await toggleLike(throwing, 'card-1', 'u1', true)).toBe(false);
  });
});

describe('addComment', () => {
  it('rejects an empty body before any network call', async () => {
    const fromSpy = jest.fn();
    const client = { from: fromSpy } as unknown as AuthClient;
    const res = await addComment(client, 'card-1', 'u1', '   ');
    expect(res.comment).toBeNull();
    expect(res.error).toBeTruthy();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('rejects an over-cap body before any network call', async () => {
    const fromSpy = jest.fn();
    const client = { from: fromSpy } as unknown as AuthClient;
    const res = await addComment(client, 'card-1', 'u1', 'a'.repeat(281));
    expect(res.comment).toBeNull();
    expect(res.error).toBeTruthy();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    const fromSpy = jest.fn();
    const client = { from: fromSpy } as unknown as AuthClient;
    const res = await addComment(client, 'card-1', null, 'hello');
    expect(res.comment).toBeNull();
    expect(res.error).toBeTruthy();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('inserts the trimmed body and returns the shaped comment (isOwn)', async () => {
    const { client, calls } = makeClient({
      game_comments: () => ({
        data: {
          id: 'c9',
          body: 'great game',
          created_at: '2026-06-21T11:00:00.000Z',
          user_id: 'u1',
          profiles: { handle: 'ash', display_name: 'Ash' },
        },
        error: null,
      }),
    });
    const res = await addComment(client, 'card-1', 'u1', '  great game  ');
    expect(res.error).toBeNull();
    expect(res.comment).toEqual({
      id: 'c9',
      body: 'great game',
      createdAt: '2026-06-21T11:00:00.000Z',
      authorHandle: 'ash',
      authorDisplayName: 'Ash',
      isOwn: true,
    });
    const call = calls.find((c) => c.table === 'game_comments');
    expect(call?.insert).toEqual({ user_id: 'u1', card_id: 'card-1', body: 'great game' });
  });

  it('returns a friendly error on an insert failure', async () => {
    const { client } = makeClient({
      game_comments: () => ({ data: null, error: { message: 'rls' } }),
    });
    const res = await addComment(client, 'card-1', 'u1', 'hello');
    expect(res.comment).toBeNull();
    expect(res.error).toBeTruthy();
  });
});

describe('deleteComment', () => {
  it('deletes the own comment row', async () => {
    const { client, calls } = makeClient({ game_comments: () => ({ error: null }) });
    const ok = await deleteComment(client, 'c1', 'u1');
    expect(ok).toBe(true);
    const call = calls.find((c) => c.table === 'game_comments');
    expect(call?.deleteCalled).toBe(true);
    expect(call?.eqs).toContainEqual(['id', 'c1']);
    expect(call?.eqs).toContainEqual(['user_id', 'u1']);
  });

  it('no-ops when signed out', async () => {
    const fromSpy = jest.fn();
    const client = { from: fromSpy } as unknown as AuthClient;
    expect(await deleteComment(client, 'c1', null)).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
