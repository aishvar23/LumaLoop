
import {
  activityCaption,
  buildActivityFeed,
  type RawActivityRow,
} from './activityFeed';

function row(over: Partial<RawActivityRow> & Pick<RawActivityRow, 'id' | 'createdAt'>): RawActivityRow {
  return {
    kind: 'comment',
    userId: 'u1',
    handle: 'gridwise',
    displayName: 'Grid Wise',
    avatarUrl: null,
    cardId: 'spot_it-1',
    ...over,
  };
}

describe('buildActivityFeed', () => {
  it('sorts newest-first, dedupes by id, and resolves a game title', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-06-01T00:00:00Z' }),
      row({ id: 'b', createdAt: '2026-06-03T00:00:00Z', kind: 'like', cardId: 'tiny_logic-1' }),
      row({ id: 'a', createdAt: '2026-06-01T00:00:00Z' }), // dup id
    ];
    const feed = buildActivityFeed(rows, {
      resolveTitle: (id) => (id.startsWith('spot') ? 'Spot it' : 'Tiny logic'),
    });
    expect(feed.map((f) => f.id)).toEqual(['b', 'a']);
    expect(feed[0].gameTitle).toBe('Tiny logic');
    expect(feed[1].monogram).toBe('G');
  });

  it('excludes the viewer’s own activity', () => {
    const rows = [
      row({ id: 'mine', userId: 'me', createdAt: '2026-06-02T00:00:00Z' }),
      row({ id: 'theirs', userId: 'them', createdAt: '2026-06-01T00:00:00Z' }),
    ];
    const feed = buildActivityFeed(rows, { excludeUserId: 'me' });
    expect(feed.map((f) => f.id)).toEqual(['theirs']);
  });

  it('drops rows missing a card or timestamp and honors the limit', () => {
    const rows = [
      row({ id: 'ok', createdAt: '2026-06-03T00:00:00Z' }),
      row({ id: 'no-card', cardId: '', createdAt: '2026-06-02T00:00:00Z' }),
      row({ id: 'no-time', createdAt: '' }),
      row({ id: 'ok2', createdAt: '2026-06-01T00:00:00Z' }),
    ];
    expect(buildActivityFeed(rows, { limit: 1 }).map((f) => f.id)).toEqual(['ok']);
    expect(buildActivityFeed(rows, { limit: 0 }).map((f) => f.id)).toEqual(['ok', 'ok2']);
  });
});

describe('activityCaption', () => {
  it('reads like a social update', () => {
    const [item] = buildActivityFeed([row({ id: 'a', createdAt: '2026-06-01T00:00:00Z' })], {
      resolveTitle: () => 'Spot it',
    });
    expect(activityCaption(item)).toBe('@gridwise commented on Spot it');
    const [like] = buildActivityFeed(
      [row({ id: 'b', kind: 'like', handle: 'mara', createdAt: '2026-06-01T00:00:00Z' })],
      { resolveTitle: () => 'Tiny logic' },
    );
    expect(activityCaption(like)).toBe('@mara liked Tiny logic');
  });
});
