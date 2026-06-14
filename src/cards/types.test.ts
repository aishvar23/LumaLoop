import {
  templateCategoryMap,
  type ChallengeCategory,
  type LiquidCard,
  type TemplateType,
} from './types';

// Runtime mirrors of the type-level unions. Kept in sync with `types.ts`; the
// exhaustiveness test below proves the `TemplateType` mirror is complete, and
// the category coverage test proves every mapped value is a real category.
const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'spot_it',
  'what_changed',
  'rule_flip',
  'tiny_logic',
];

const ALL_CATEGORIES: ChallengeCategory[] = [
  'visual_attention',
  'working_memory',
  'logical_reasoning',
  'cognitive_flexibility',
  'pattern_recognition',
  'processing_speed',
];

describe('templateCategoryMap', () => {
  it('has an entry for every TemplateType', () => {
    for (const templateType of ALL_TEMPLATE_TYPES) {
      expect(templateCategoryMap[templateType]).toBeDefined();
      expect(Array.isArray(templateCategoryMap[templateType])).toBe(true);
      expect(templateCategoryMap[templateType].length).toBeGreaterThan(0);
    }
  });

  it('does not map any unknown template type', () => {
    expect(Object.keys(templateCategoryMap).sort()).toEqual(
      [...ALL_TEMPLATE_TYPES].sort(),
    );
  });

  it('only maps to valid ChallengeCategory values', () => {
    for (const categories of Object.values(templateCategoryMap)) {
      for (const category of categories) {
        expect(ALL_CATEGORIES).toContain(category);
      }
    }
  });

  it('lists distinct categories within each template entry', () => {
    for (const categories of Object.values(templateCategoryMap)) {
      expect(new Set(categories).size).toBe(categories.length);
    }
  });

  it('matches the Technical Design §11 mapping exactly', () => {
    expect(templateCategoryMap).toEqual({
      spot_it: ['visual_attention', 'processing_speed'],
      what_changed: ['working_memory', 'visual_attention'],
      rule_flip: ['cognitive_flexibility', 'processing_speed'],
      tiny_logic: ['logical_reasoning', 'pattern_recognition'],
    });
  });
});

/**
 * Compile-time proof that `LiquidCard` is a discriminated union: narrowing on
 * `templateType` must expose each member's typed `config`, and the `never`
 * default makes the switch fail to type-check if a new member is added without
 * a case here. This function is also exercised at runtime below.
 */
function categoriesForCard(card: LiquidCard): ChallengeCategory {
  switch (card.templateType) {
    case 'spot_it':
      // Accessing a Spot It-only field proves discrimination.
      void card.config.anomalyRow;
      return 'visual_attention';
    case 'what_changed':
      void card.config.beforePattern;
      return 'working_memory';
    case 'rule_flip':
      void card.config.flipAtStimulusIndex;
      return 'cognitive_flexibility';
    case 'tiny_logic':
      void card.config.stem;
      return 'logical_reasoning';
    default: {
      // If a new TemplateType is added without a case above, `card` is no
      // longer `never` here and this assignment fails to compile.
      const exhaustive: never = card;
      return exhaustive;
    }
  }
}

describe('LiquidCard discriminated union', () => {
  it('narrows to each template config via the templateType discriminant', () => {
    const base = {
      creatorHandle: '@author',
      difficulty: 'easy' as const,
      evidenceTier: 'mechanic_mapped' as const,
      reviewStatus: 'manual_reviewed' as const,
      estimatedSeconds: 10,
      prompt: 'Solve it.',
      puzzleDna: {
        mechanic: 'test',
        inputMode: 'tap' as const,
        measuredSignals: ['accuracy'],
      },
      explanation: { title: 'Why', body: 'Because.' },
    };

    const spotIt: LiquidCard = {
      ...base,
      cardId: 'c1',
      templateType: 'spot_it',
      category: 'visual_attention',
      config: {
        rows: 3,
        columns: 3,
        baseElement: 'a',
        anomalyElement: 'b',
        anomalyRow: 1,
        anomalyColumn: 1,
        timeLimitMs: 8000,
      },
    };
    const tinyLogic: LiquidCard = {
      ...base,
      cardId: 'c2',
      templateType: 'tiny_logic',
      category: 'logical_reasoning',
      config: {
        stem: 'If A then B?',
        options: [
          { id: 'x', label: 'Yes' },
          { id: 'y', label: 'No' },
        ],
        correctOptionId: 'x',
        timeLimitMs: 12000,
      },
    };

    expect(categoriesForCard(spotIt)).toBe('visual_attention');
    expect(categoriesForCard(tinyLogic)).toBe('logical_reasoning');
  });
});
