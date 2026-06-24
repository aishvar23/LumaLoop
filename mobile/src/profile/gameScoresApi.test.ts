import type { AuthClient } from '../auth/authClient';
import type { UserGameScore } from '../core/auth/types';
import { fetchGameScores } from './gameScoresApi';

/** A from() that returns a scripted result for the chained select/eq/order query. */
function clientReturning(result: { data: unknown; error: unknown }): AuthClient {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
  });
  return { from: () => builder } as unknown as AuthClient;
}

const row = (over: Partial<UserGameScore> = {}): UserGameScore => ({
  user_id: 'u',
  card_id: 'spotit-001',
  template_type: 'spot_it',
  category: 'visual_attention',
  times_played: 2,
  best_points: 20,
  last_points: 10,
  ever_correct: true,
  last_is_correct: false,
  last_played_at: '2026-06-21T00:00:00Z',
  ...over,
});

describe('fetchGameScores', () => {
  it('returns an empty list (no query) when signed out', async () => {
    const res = await fetchGameScores(
      clientReturning({ data: [row()], error: null }),
      null,
    );
    expect(res.scores).toEqual([]);
    expect(res.error).toBeNull();
  });

  it('returns the score rows on success', async () => {
    const rows = [row(), row({ card_id: 'spotit-002' })];
    const res = await fetchGameScores(
      clientReturning({ data: rows, error: null }),
      'u',
    );
    expect(res.scores).toEqual(rows);
    expect(res.error).toBeNull();
  });

  it('returns empty + error message on a query error', async () => {
    const res = await fetchGameScores(
      clientReturning({ data: null, error: { message: 'boom' } }),
      'u',
    );
    expect(res.scores).toEqual([]);
    expect(res.error).toBe('boom');
  });

  it('never throws when the client throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('network');
      },
    } as unknown as AuthClient;
    const res = await fetchGameScores(throwing, 'u');
    expect(res.scores).toEqual([]);
    expect(res.error).toBeNull();
  });
});
