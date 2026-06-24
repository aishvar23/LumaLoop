import { describe, expect, it } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import { fetchPlayedCardIds } from './playedCardsApi';

/** A from() that returns a scripted result for the chained select/eq query. */
function clientReturning(result: { data: unknown; error: unknown }): AuthClient {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => Promise.resolve(result),
  });
  return { from: () => builder } as unknown as AuthClient;
}

describe('fetchPlayedCardIds', () => {
  it('returns an empty set (no query) when signed out', async () => {
    const res = await fetchPlayedCardIds(
      clientReturning({ data: [{ card_id: 'x' }], error: null }),
      null,
    );
    expect([...res.cardIds]).toEqual([]);
    expect(res.error).toBeNull();
  });

  it('collects the played cardIds into a Set', async () => {
    const res = await fetchPlayedCardIds(
      clientReturning({
        data: [{ card_id: 'a' }, { card_id: 'b' }, { card_id: 'a' }],
        error: null,
      }),
      'user-1',
    );
    expect(res.cardIds.has('a')).toBe(true);
    expect(res.cardIds.has('b')).toBe(true);
    expect(res.cardIds.size).toBe(2);
    expect(res.error).toBeNull();
  });

  it('returns an empty set + error message on a query error', async () => {
    const res = await fetchPlayedCardIds(
      clientReturning({ data: null, error: { message: 'rls' } }),
      'user-1',
    );
    expect([...res.cardIds]).toEqual([]);
    expect(res.error).toBe('rls');
  });

  it('never throws when the client throws (empty set)', async () => {
    const throwing = {
      from: () => {
        throw new Error('network');
      },
    } as unknown as AuthClient;
    const res = await fetchPlayedCardIds(throwing, 'user-1');
    expect([...res.cardIds]).toEqual([]);
    expect(res.error).toBeNull();
  });

  it('tolerates null data and malformed rows', async () => {
    const res = await fetchPlayedCardIds(
      clientReturning({
        data: [{ card_id: 'ok' }, { card_id: 123 }, {}, null],
        error: null,
      }),
      'user-1',
    );
    expect([...res.cardIds]).toEqual(['ok']);
  });
});
