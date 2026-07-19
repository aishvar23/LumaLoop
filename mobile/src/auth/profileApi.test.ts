/**
 * Tests for the mobile account data helpers (accounts pivot — mirrors web
 * `src/auth/profileApi.test.ts`). All against the hand-written fake AuthClient.
 */
import {
  createFakeAuthClient,
  makeProfile,
} from './testFakes';
import {
  createProfile,
  fetchGamePlays,
  fetchProfile,
  insertGamePlay,
} from './profileApi';
import type { GamePlay, GamePlayInsert } from '../core/auth/types';

const sampleInsert: GamePlayInsert = {
  user_id: 'u',
  card_id: 'c',
  template_type: 'spot_it',
  category: 'visual_attention',
  is_correct: true,
  points: 100,
  elapsed_ms: 1200,
};

describe('fetchProfile', () => {
  it('returns the profile row when present', async () => {
    const profile = makeProfile({ handle: 'abc' });
    const { client } = createFakeAuthClient({ profile });
    const { profile: row, error } = await fetchProfile(client, 'user-1');
    expect(error).toBeNull();
    expect(row?.handle).toBe('abc');
  });

  it('returns null (not an error) when no profile exists yet', async () => {
    const { client } = createFakeAuthClient({ profile: null });
    const { profile, error } = await fetchProfile(client, 'user-1');
    expect(profile).toBeNull();
    expect(error).toBeNull();
  });

  it('surfaces a real load error', async () => {
    const { client } = createFakeAuthClient({ profileError: 'boom' });
    const { profile, error } = await fetchProfile(client, 'user-1');
    expect(profile).toBeNull();
    expect(error).toBe('boom');
  });
});

describe('createProfile', () => {
  it('inserts the row and returns the created profile', async () => {
    const auth = createFakeAuthClient();
    const { profile, error, handleTaken } = await createProfile(auth.client, {
      id: 'user-1',
      handle: 'newbie',
      display_name: 'New Bie',
      avatar_url: null,
    });
    expect(error).toBeNull();
    expect(handleTaken).toBe(false);
    expect(profile?.handle).toBe('newbie');
    expect(auth.profileInserts).toHaveLength(1);
  });

  it('maps a unique violation to a friendly handleTaken error', async () => {
    const { client } = createFakeAuthClient({ insertProfileErrorCode: '23505' });
    const { profile, error, handleTaken } = await createProfile(client, {
      id: 'user-1',
      handle: 'taken',
      display_name: 'Dup',
      avatar_url: null,
    });
    expect(profile).toBeNull();
    expect(handleTaken).toBe(true);
    expect(error).toMatch(/already taken/i);
  });
});

describe('fetchGamePlays', () => {
  it('returns the play rows', async () => {
    const plays: GamePlay[] = [
      {
        id: 'p1',
        user_id: 'u',
        card_id: 'c',
        template_type: 'spot_it',
        category: 'visual_attention',
        is_correct: true,
        points: 50,
        elapsed_ms: 900,
        played_at: '2026-01-01T00:00:00Z',
      },
    ];
    const { client } = createFakeAuthClient({ plays });
    const { plays: rows, error } = await fetchGamePlays(client, 'u');
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
  });
});

describe('insertGamePlay', () => {
  it('records the row and reports ok', async () => {
    const auth = createFakeAuthClient();
    const { ok } = await insertGamePlay(auth.client, sampleInsert);
    expect(ok).toBe(true);
    expect(auth.gamePlayInserts).toEqual([sampleInsert]);
  });

  it('never throws — returns ok:false when the client throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('offline');
      },
    } as never;
    await expect(insertGamePlay(throwing, sampleInsert)).resolves.toEqual({
      ok: false,
    });
  });
});
