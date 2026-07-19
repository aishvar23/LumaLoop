import { describe, expect, it } from 'vitest';

import {
  groupSharesByUser,
  outcomeLabel,
  shareSummary,
  type RawShareRow,
} from './statusFeed';

function row(over: Partial<RawShareRow> & Pick<RawShareRow, 'id' | 'createdAt'>): RawShareRow {
  return {
    userId: 'u1',
    handle: 'gridwise',
    displayName: 'Grid Wise',
    avatarUrl: null,
    cardId: 'spot_it-1',
    outcome: 'correct',
    points: 120,
    ...over,
  };
}

describe('outcomeLabel / shareSummary', () => {
  it('maps outcomes to words', () => {
    expect(outcomeLabel('correct')).toBe('solved');
    expect(outcomeLabel('incorrect')).toBe('played');
    expect(outcomeLabel('timeout')).toBe('timed out');
  });

  it('summarizes a shared game with points', () => {
    const [status] = groupSharesByUser([row({ id: 'a', createdAt: '2026-06-01T00:00:00Z' })], {
      resolveTitle: () => 'Spot it',
    });
    expect(shareSummary(status.items[0])).toBe('Spot it · solved +120');
  });
});

describe('groupSharesByUser', () => {
  it('groups per user with items newest-first and resolves titles', () => {
    const rows = [
      row({ id: 'a', userId: 'u1', createdAt: '2026-06-01T00:00:00Z' }),
      row({ id: 'b', userId: 'u1', createdAt: '2026-06-03T00:00:00Z', cardId: 'tiny_logic-1' }),
      row({ id: 'c', userId: 'u2', createdAt: '2026-06-02T00:00:00Z' }),
    ];
    const statuses = groupSharesByUser(rows, {
      resolveTitle: (id) => (id.startsWith('spot') ? 'Spot it' : 'Tiny logic'),
    });
    // u1 is newest (b at 06-03) → first; its items newest-first (b then a).
    expect(statuses.map((s) => s.userId)).toEqual(['u1', 'u2']);
    expect(statuses[0].items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(statuses[0].items[0].gameTitle).toBe('Tiny logic');
    expect(statuses[0].latestAt).toBe('2026-06-03T00:00:00Z');
    expect(statuses[0].monogram).toBe('G');
  });

  it('sorts the viewer’s own status first (IG "your story")', () => {
    const rows = [
      row({ id: 'a', userId: 'them', createdAt: '2026-06-05T00:00:00Z' }),
      row({ id: 'b', userId: 'me', createdAt: '2026-06-01T00:00:00Z' }),
    ];
    const statuses = groupSharesByUser(rows, { viewerId: 'me' });
    expect(statuses.map((s) => s.userId)).toEqual(['me', 'them']);
    expect(statuses[0].isOwn).toBe(true);
  });

  it('drops rows missing a user/card/timestamp and dedupes by id', () => {
    const rows = [
      row({ id: 'ok', createdAt: '2026-06-03T00:00:00Z' }),
      row({ id: 'no-user', userId: null, createdAt: '2026-06-02T00:00:00Z' }),
      row({ id: 'no-card', cardId: '', createdAt: '2026-06-02T00:00:00Z' }),
      row({ id: 'ok', createdAt: '2026-06-03T00:00:00Z' }), // dup
    ];
    const statuses = groupSharesByUser(rows);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].items).toHaveLength(1);
  });
});
