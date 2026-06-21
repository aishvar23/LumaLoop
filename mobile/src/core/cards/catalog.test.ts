import { catalog } from './catalog';
import { templateCategoryMap, type TemplateType } from './types';
import { ALLOWED_EVIDENCE_TIERS, validateCatalog } from './validation';

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

  it('contains 20-40 cards total', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(20);
    expect(catalog.length).toBeLessThanOrEqual(40);
  });

  it('has at least 5 cards for every template', () => {
    const templates: TemplateType[] = [
      'spot_it',
      'what_changed',
      'rule_flip',
      'tiny_logic',
    ];
    for (const template of templates) {
      const count = catalog.filter(
        (card) => card.templateType === template,
      ).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it('has unique cardIds', () => {
    const ids = catalog.map((card) => card.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses every difficulty value at least once', () => {
    const difficulties = new Set(catalog.map((card) => card.difficulty));
    expect(difficulties).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('mixes difficulty within each template', () => {
    const templates: TemplateType[] = [
      'spot_it',
      'what_changed',
      'rule_flip',
      'tiny_logic',
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

  it('keeps every config.timeLimitMs within [5000, 30000] ms', () => {
    for (const card of catalog) {
      expect(card.config.timeLimitMs).toBeGreaterThanOrEqual(5000);
      expect(card.config.timeLimitMs).toBeLessThanOrEqual(30000);
    }
  });

  it('gives every card a non-empty prompt and explanation', () => {
    for (const card of catalog) {
      expect(card.prompt.trim().length).toBeGreaterThan(0);
      expect(card.explanation.title.trim().length).toBeGreaterThan(0);
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
});
