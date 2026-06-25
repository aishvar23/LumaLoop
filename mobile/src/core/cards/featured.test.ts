// Ported from web `src/cards/featured.test.ts`; source of truth is the web app —
// keep in sync (accounts pivot). Byte-faithful: only this header differs. See
// `mobile/src/core/README.md`. (Test harness: Jest globals, not Vitest.)
import { catalog } from './catalog';
import { selectFeaturedGames, templateLabel } from './featured';
import type { LiquidCard } from './types';

/** A tiny fake card with only the fields the helper reads. */
function fakeCard(overrides: Partial<LiquidCard> & Pick<LiquidCard, 'templateType'>): LiquidCard {
  return {
    cardId: `${overrides.templateType}-1`,
    creatorHandle: '@maker',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'unreviewed',
    estimatedSeconds: 30,
    prompt: 'Play',
    puzzleDna: { mechanic: 'demo', inputMode: 'choice', measuredSignals: [] },
    explanation: { title: 't', body: 'b' },
    config: {},
    ...overrides,
  } as LiquidCard;
}

describe('templateLabel', () => {
  it('humanizes a template id', () => {
    expect(templateLabel('spot_it')).toBe('Spot it');
    expect(templateLabel('word_unscramble')).toBe('Word unscramble');
  });
});

describe('selectFeaturedGames', () => {
  it('returns one tile per distinct template, in first-seen order', () => {
    const cards = [
      fakeCard({ templateType: 'spot_it', cardId: 'spot_it-a' }),
      fakeCard({ templateType: 'spot_it', cardId: 'spot_it-b' }),
      fakeCard({ templateType: 'tiny_logic', cardId: 'tiny_logic-a' }),
    ];
    const featured = selectFeaturedGames(6, cards);
    expect(featured.map((f) => f.templateType)).toEqual(['spot_it', 'tiny_logic']);
    // The representative is the FIRST card of that template.
    expect(featured[0].cardId).toBe('spot_it-a');
    expect(featured[0].label).toBe('Spot it');
  });

  it('honors the limit and a non-positive limit means "all"', () => {
    const cards = [
      fakeCard({ templateType: 'spot_it' }),
      fakeCard({ templateType: 'tiny_logic' }),
      fakeCard({ templateType: 'quick_math' }),
    ];
    expect(selectFeaturedGames(2, cards)).toHaveLength(2);
    expect(selectFeaturedGames(0, cards)).toHaveLength(3);
  });

  it('carries the representative card metadata', () => {
    const cards = [
      fakeCard({
        templateType: 'quick_math',
        cardId: 'qm-1',
        category: 'processing_speed',
        difficulty: 'hard',
        estimatedSeconds: 12,
        puzzleDna: { mechanic: 'mental-arithmetic', inputMode: 'choice', measuredSignals: [] },
      }),
    ];
    const [tile] = selectFeaturedGames(6, cards);
    expect(tile).toMatchObject({
      templateType: 'quick_math',
      cardId: 'qm-1',
      category: 'processing_speed',
      difficulty: 'hard',
      estimatedSeconds: 12,
      mechanic: 'mental-arithmetic',
    });
  });

  it('works over the real catalog (no template appears twice, all ids resolve)', () => {
    const featured = selectFeaturedGames(0);
    const templates = featured.map((f) => f.templateType);
    expect(new Set(templates).size).toBe(templates.length);
    const ids = new Set(catalog.map((c) => c.cardId));
    for (const f of featured) expect(ids.has(f.cardId)).toBe(true);
  });
});
