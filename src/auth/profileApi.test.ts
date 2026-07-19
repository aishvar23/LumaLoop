import { describe, expect, it, vi } from 'vitest';

import type { AuthClient } from './authClient';
import {
  createProfile,
  fetchGamePlays,
  fetchProfile,
  insertGamePlay,
  PG_UNIQUE_VIOLATION,
} from './profileApi';
import { makeProfile } from './testFakes';

/** Build a from() that returns a scripted result for the chained query. */
function clientReturning(
  result: { data: unknown; error: unknown },
  capture?: (row: unknown) => void,
): AuthClient {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    insert: (row: unknown) => {
      capture?.(row);
      return {
        select: () => ({ single: () => Promise.resolve(result) }),
        // game_plays insert resolves directly (no .select chain)
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
    },
  });
  return { from: () => builder } as unknown as AuthClient;
}

describe('fetchProfile', () => {
  it('returns the row when present', async () => {
    const profile = makeProfile();
    const res = await fetchProfile(
      clientReturning({ data: profile, error: null }),
      'user-1',
    );
    expect(res.profile).toEqual(profile);
    expect(res.error).toBeNull();
  });

  it('returns null profile (not an error) when no row exists', async () => {
    const res = await fetchProfile(
      clientReturning({ data: null, error: null }),
      'user-1',
    );
    expect(res.profile).toBeNull();
    expect(res.error).toBeNull();
  });

  it('surfaces a real load error', async () => {
    const res = await fetchProfile(
      clientReturning({ data: null, error: { message: 'boom' } }),
      'user-1',
    );
    expect(res.profile).toBeNull();
    expect(res.error).toBe('boom');
  });
});

describe('createProfile', () => {
  it('inserts and returns the created profile', async () => {
    const created = makeProfile({ handle: 'newbie' });
    const capture = vi.fn();
    const res = await createProfile(
      clientReturning({ data: created, error: null }, capture),
      {
        id: 'user-1',
        handle: 'newbie',
        display_name: 'Newbie',
        avatar_url: null,
      },
    );
    expect(res.profile).toEqual(created);
    expect(res.handleTaken).toBe(false);
    expect(capture).toHaveBeenCalledWith({
      id: 'user-1',
      handle: 'newbie',
      display_name: 'Newbie',
      avatar_url: null,
    });
  });

  it('maps a unique violation to a friendly handleTaken error', async () => {
    const res = await createProfile(
      clientReturning({
        data: null,
        error: { code: PG_UNIQUE_VIOLATION, message: 'duplicate key' },
      }),
      { id: 'u', handle: 'taken', display_name: 'X', avatar_url: null },
    );
    expect(res.handleTaken).toBe(true);
    expect(res.error).toMatch(/already taken/i);
  });
});

describe('fetchGamePlays', () => {
  it('returns the rows ordered by the query', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const res = await fetchGamePlays(
      clientReturning({ data: rows, error: null }),
      'user-1',
    );
    expect(res.plays).toEqual(rows);
    expect(res.error).toBeNull();
  });
});

describe('insertGamePlay', () => {
  it('returns ok:true on a successful insert', async () => {
    const res = await insertGamePlay(
      clientReturning({ data: null, error: null }),
      {
        user_id: 'u',
        card_id: 'c',
        template_type: 'spot_it',
        category: 'visual_attention',
        is_correct: true,
        points: 10,
        elapsed_ms: 100,
      },
    );
    expect(res.ok).toBe(true);
  });

  it('returns ok:false (never throws) when the insert errors', async () => {
    const res = await insertGamePlay(
      clientReturning({ data: null, error: { message: 'rls' } }),
      {
        user_id: 'u',
        card_id: 'c',
        template_type: 'spot_it',
        category: 'visual_attention',
        is_correct: false,
        points: 0,
        elapsed_ms: null,
      },
    );
    expect(res.ok).toBe(false);
  });

  it('returns ok:false when the client throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('network');
      },
    } as unknown as AuthClient;
    const res = await insertGamePlay(throwing, {
      user_id: 'u',
      card_id: 'c',
      template_type: 'spot_it',
      category: 'visual_attention',
      is_correct: true,
      points: 1,
      elapsed_ms: 1,
    });
    expect(res.ok).toBe(false);
  });
});
