import { catalog } from './catalog';
import { templateCategoryMap, type TemplateType } from './types';
import {
  ALLOWED_EVIDENCE_TIERS,
  MAX_SPOT_IT_COLUMNS,
  validateCatalog,
} from './validation';

const VISUALLY_CONFUSABLE_SPOT_IT_PAIRS = [
  ['l', 'I'],
  ['I', 'l'],
  ['1', 'l'],
  ['l', '1'],
  ['1', 'I'],
  ['I', '1'],
  ['|', 'I'],
  ['I', '|'],
  ['|', 'l'],
  ['l', '|'],
] as const;

function isVisuallyConfusableSpotItPair(
  baseElement: string,
  anomalyElement: string,
) {
  return VISUALLY_CONFUSABLE_SPOT_IT_PAIRS.some(
    ([base, anomaly]) =>
      baseElement === base && anomalyElement === anomaly,
  );
}

/**
 * Catalog authoring guarantees (Technical Design §11, Azure DevOps #56). These
 * assert against the real authored `catalog`, not synthetic fixtures: a broken
 * or non-compliant card must fail this suite before it can reach a session.
 *
 * Ported from web `src/cards/catalog.test.ts`; vitest's `expect(value, message)`
 * second-argument form is unsupported by jest's typed `expect`, so the inline
 * failure messages were dropped — the assertions themselves are unchanged.
 */
describe('authored card catalog', () => {
  it('passes startup validation with zero errors', () => {
    const result = validateCatalog(catalog);
    // Surface the offending rules/cards in the failure message if any slip in.
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('contains 20-200 cards total', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(20);
    expect(catalog.length).toBeLessThanOrEqual(200);
  });

  it('has at least 5 cards for every template', () => {
    const templates: TemplateType[] = [
      'spot_it',
      'what_changed',
      'rule_flip',
      'tiny_logic',
      'memory_sequence',
      'pattern_chain',
      'step_logic',
      'code_break',
      'prism_path',
      'signal_set',
      'circuit_flow',
      'word_unscramble',
      'quick_math',
      'color_word',
      'n_back',
      'odd_one_out',
      'schulte_order',
    ];
    for (const template of templates) {
      const count = catalog.filter(
        (card) => card.templateType === template,
      ).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it('has a strong hard-tier ceiling for the difficulty ramp', () => {
    const templates: TemplateType[] = [
      'what_changed',
      'rule_flip',
      'tiny_logic',
      'memory_sequence',
      'pattern_chain',
      'step_logic',
      'code_break',
      'prism_path',
      'signal_set',
      'circuit_flow',
      'word_unscramble',
      'quick_math',
      'color_word',
      'n_back',
      'odd_one_out',
      'schulte_order',
    ];
    const hardCount = catalog.filter(
      (card) => card.difficulty === 'hard',
    ).length;
    expect(hardCount).toBeGreaterThanOrEqual(15);
    for (const template of templates) {
      const hardForTemplate = catalog.filter(
        (card) => card.templateType === template && card.difficulty === 'hard',
      ).length;
      expect(hardForTemplate).toBeGreaterThanOrEqual(1);
    }
  });

  it('has unique cardIds', () => {
    const ids = catalog.map((card) => card.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses every difficulty value at least once', () => {
    const difficulties = new Set(catalog.map((card) => card.difficulty));
    expect(difficulties).toEqual(
      new Set([
        'extremely_easy',
        'easy',
        'medium',
        'hard',
        'extremely_hard',
      ]),
    );
  });

  it('mixes difficulty within each non-entry template', () => {
    const templates: TemplateType[] = [
      'what_changed',
      'rule_flip',
      'tiny_logic',
      'memory_sequence',
      'pattern_chain',
      'step_logic',
      'code_break',
      'prism_path',
      'signal_set',
      'circuit_flow',
      'word_unscramble',
      'quick_math',
      'color_word',
      'n_back',
      'odd_one_out',
      'schulte_order',
    ];
    for (const template of templates) {
      const perTemplate = new Set(
        catalog
          .filter((card) => card.templateType === template)
          .map((card) => card.difficulty),
      );
      expect(perTemplate.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('maps every card category to its template in templateCategoryMap', () => {
    for (const card of catalog) {
      expect(templateCategoryMap[card.templateType]).toContain(card.category);
    }
  });

  it('restricts evidenceTier to the two prototype-allowed tiers', () => {
    for (const card of catalog) {
      expect(ALLOWED_EVIDENCE_TIERS).toContain(card.evidenceTier);
    }
  });

  it('keeps every config.timeLimitMs within [5000, 120000] ms', () => {
    for (const card of catalog) {
      expect(card.config.timeLimitMs).toBeGreaterThanOrEqual(5000);
      expect(card.config.timeLimitMs).toBeLessThanOrEqual(120000);
    }
  });

  it('gives every card a non-empty prompt and explanation', () => {
    for (const card of catalog) {
      expect(card.prompt.trim().length).toBeGreaterThan(0);
      expect(card.explanation.title.trim().length).toBeGreaterThan(0);
      expect(card.explanation.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not reveal the Fibonacci rule before patternchain-003 is solved', () => {
    const card = catalog.find(
      (candidate) => candidate.cardId === 'patternchain-003',
    );
    expect(card?.prompt.toLowerCase()).not.toContain('fibonacci');
    expect(card?.prompt.toLowerCase()).not.toContain('sum of the two');
    expect(card?.explanation.body.toLowerCase()).toContain('two before');
  });

  it('keeps every sequence prompt neutral until the card is solved', () => {
    const neutralPrompts = new Set([
      'Work out the sequence, then pick the next number.',
      'Work out the sequence, then pick what comes next.',
      'Work out the sequence, then pick the next two numbers.',
      'Work out the sequence, then pick the next two symbols.',
      'Work out the sequence, then pick the next two letters.',
      'Work out the sequence, then pick the next three numbers.',
      'Work out the sequence, then pick the next three items.',
      'Work out the sequence, then pick the next four items.',
      'Work out the sequence, then pick the next five numbers.',
    ]);
    const sequenceCards = catalog.filter((card) =>
      ['sequence-continuation', 'sequence-extrapolation'].includes(
        card.puzzleDna.mechanic,
      ),
    );

    for (const card of sequenceCards) {
      expect(neutralPrompts).toContain(card.prompt);
      expect(card.explanation.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps the clockwise arrow pattern chain in the easy tier', () => {
    const card = catalog.find(
      (candidate) => candidate.cardId === 'patternchain-006',
    );
    expect(card?.templateType).toBe('pattern_chain');
    expect(card?.difficulty).toBe('easy');
    expect(card?.estimatedSeconds).toBe(16);
    expect(card?.prompt).toBe(
      'Work out the sequence, then pick the next four items.',
    );
    expect(card?.config.timeLimitMs).toBe(16000);
  });

  it('keeps the letter-plus-doubling pattern chain in the medium tier', () => {
    const card = catalog.find(
      (candidate) => candidate.cardId === 'patternchain-005',
    );
    expect(card?.templateType).toBe('pattern_chain');
    expect(card?.difficulty).toBe('medium');
    expect(card?.estimatedSeconds).toBe(28);
    expect(card?.prompt).toBe(
      'Work out the sequence, then pick the next three items.',
    );
    expect(card?.config.timeLimitMs).toBe(28000);
  });

  it('keeps the five-slot code_break card in the extremely hard two-minute tier', () => {
    const card = catalog.find(
      (candidate) => candidate.cardId === 'codebreak-005',
    );
    expect(card?.templateType).toBe('code_break');
    if (card?.templateType !== 'code_break') {
      throw new Error('expected codebreak-005 to be code_break');
    }
    expect(card.difficulty).toBe('extremely_hard');
    expect(card.estimatedSeconds).toBe(120);
    expect(card.config.codeLength).toBe(5);
    expect(card.config.palette).toHaveLength(6);
    expect(card.config.maxGuesses).toBe(6);
    expect(card.config.timeLimitMs).toBe(120000);
  });

  it('keeps the nine-tile endpoint circuit in the extremely hard two-minute tier', () => {
    const card = catalog.find(
      (candidate) => candidate.cardId === 'circuitflow-003',
    );
    expect(card?.templateType).toBe('circuit_flow');
    if (card?.templateType !== 'circuit_flow') {
      throw new Error('expected circuitflow-003 to be circuit_flow');
    }
    expect(card.difficulty).toBe('extremely_hard');
    expect(card.estimatedSeconds).toBe(120);
    expect(card.config.rows).toBe(3);
    expect(card.config.columns).toBe(3);
    expect(card.config.sourceTileId).toBe('a');
    expect(card.config.tiles.find((tile) => tile.id === 'i')?.connections).toEqual([
      'left',
    ]);
    expect(card.config.timeLimitMs).toBe(120000);
  });

  it('keeps every spot_it prompt neutral and answer-free', () => {
    const spotIt = catalog.filter((card) => card.templateType === 'spot_it');
    for (const card of spotIt) {
      expect(card.prompt).toBe('Find the odd one out.');
      expect(card.explanation.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps spot_it anomalies distinct in glyph, not color alone', () => {
    const spotIt = catalog.filter((card) => card.templateType === 'spot_it');
    for (const card of spotIt) {
      if (card.templateType !== 'spot_it') continue;
      expect(card.config.baseElement).not.toBe(card.config.anomalyElement);
    }
  });

  it('keeps spot_it anomalies visually distinguishable in the app font', () => {
    const spotIt = catalog.filter((card) => card.templateType === 'spot_it');
    for (const card of spotIt) {
      if (card.templateType !== 'spot_it') continue;
      expect(
        isVisuallyConfusableSpotItPair(
          card.config.baseElement,
          card.config.anomalyElement,
        ),
      ).toBe(false);
    }
  });

  it('keeps every spot_it board within the mobile-safe width', () => {
    const spotIt = catalog.filter((card) => card.templateType === 'spot_it');
    for (const card of spotIt) {
      if (card.templateType !== 'spot_it') continue;
      expect(card.config.columns).toBeLessThanOrEqual(MAX_SPOT_IT_COLUMNS);
    }
  });

  it('classifies every spot_it odd-one-out card as extremely easy eight-second play', () => {
    const spotIt = catalog.filter((card) => card.templateType === 'spot_it');
    expect(spotIt.length).toBeGreaterThan(0);
    for (const card of spotIt) {
      expect(card.difficulty).toBe('extremely_easy');
      expect(card.estimatedSeconds).toBe(8);
      expect(card.config.timeLimitMs).toBe(8000);
    }
  });

  it('keeps newly appeared what_changed symbol cards in the easy tier', () => {
    const cards = catalog.filter(
      (candidate) =>
        candidate.templateType === 'what_changed' &&
        candidate.prompt.includes('newly appeared'),
    );
    expect(cards.map((card) => card.cardId).sort()).toEqual([
      'whatchanged-003',
      'whatchanged-006',
      'whatchanged-010',
    ]);
    for (const card of cards) {
      if (card.templateType !== 'what_changed') {
        throw new Error(`expected ${card.cardId} to be what_changed`);
      }
      expect(card.difficulty).toBe('easy');
      expect(card.estimatedSeconds).toBe(14);
      expect(card.config.previewMs).toBe(3000);
      expect(card.config.timeLimitMs).toBe(12000);
    }
  });
});
