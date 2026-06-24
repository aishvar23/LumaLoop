import type { LiquidCard } from '../cards/types';
import type { UserGameScore } from '../auth/types';
import { buildYourGames, categoryLabel } from './yourGames';

const score = (over: Partial<UserGameScore> = {}): UserGameScore => ({
  user_id: 'u',
  card_id: 'spotit-001',
  template_type: 'spot_it',
  category: 'visual_attention',
  times_played: 1,
  best_points: 10,
  last_points: 10,
  ever_correct: true,
  last_is_correct: true,
  last_played_at: '2026-06-21T00:00:00Z',
  ...over,
});

/** A fake catalog card carrying only the fields the shaper reads. */
function fakeCard(
  cardId: string,
  title: string,
  prompt: string,
  category = 'visual_attention',
): LiquidCard {
  return {
    cardId,
    category,
    prompt,
    explanation: { title, body: '' },
  } as unknown as LiquidCard;
}

describe('categoryLabel', () => {
  it('title-cases a snake_case id', () => {
    expect(categoryLabel('visual_attention')).toBe('Visual attention');
    expect(categoryLabel('working_memory')).toBe('Working memory');
  });
  it('handles empty/blank', () => {
    expect(categoryLabel('')).toBe('Other');
  });
});

describe('buildYourGames', () => {
  const cards = new Map<string, LiquidCard>([
    ['c1', fakeCard('c1', 'Odd shape out', 'Tap the odd one.', 'visual_attention')],
    ['c2', fakeCard('c2', '', 'Remember the order.', 'working_memory')],
  ]);
  const getCardById = (id: string) => cards.get(id);

  it('joins the friendly title + category and carries the scores', () => {
    const rows = buildYourGames([score({ card_id: 'c1', best_points: 30 })], getCardById);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cardId: 'c1',
      title: 'Odd shape out',
      categoryLabel: 'Visual attention',
      bestPoints: 30,
    });
  });

  it('falls back to the prompt when there is no explanation title', () => {
    const rows = buildYourGames([score({ card_id: 'c2' })], getCardById);
    expect(rows[0].title).toBe('Remember the order.');
    expect(rows[0].categoryLabel).toBe('Working memory');
  });

  it('falls back to the cardId + the view category when the card is unknown', () => {
    const rows = buildYourGames(
      [score({ card_id: 'ghost', category: 'pattern_recognition' })],
      getCardById,
    );
    expect(rows[0].title).toBe('ghost');
    expect(rows[0].categoryLabel).toBe('Pattern recognition');
  });

  it('sorts by most recent play first by default', () => {
    const rows = buildYourGames(
      [
        score({ card_id: 'c1', last_played_at: '2026-06-20T00:00:00Z' }),
        score({ card_id: 'c2', last_played_at: '2026-06-22T00:00:00Z' }),
      ],
      getCardById,
    );
    expect(rows.map((r) => r.cardId)).toEqual(['c2', 'c1']);
  });

  it('sorts by best score first when asked', () => {
    const rows = buildYourGames(
      [
        score({ card_id: 'c1', best_points: 5 }),
        score({ card_id: 'c2', best_points: 50 }),
      ],
      getCardById,
      'best',
    );
    expect(rows.map((r) => r.cardId)).toEqual(['c2', 'c1']);
  });

  it('is stable (ties break on cardId)', () => {
    const rows = buildYourGames(
      [
        score({ card_id: 'c2', best_points: 10, last_played_at: '2026-06-21T00:00:00Z' }),
        score({ card_id: 'c1', best_points: 10, last_played_at: '2026-06-21T00:00:00Z' }),
      ],
      getCardById,
      'best',
    );
    expect(rows.map((r) => r.cardId)).toEqual(['c1', 'c2']);
  });
});
