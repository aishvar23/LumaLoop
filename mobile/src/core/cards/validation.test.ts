import {
  ALLOWED_EVIDENCE_TIERS,
  MAX_TIME_LIMIT_MS,
  MIN_TIME_LIMIT_MS,
  ValidationRule,
  assertValidCatalog,
  validateCatalog,
} from './validation';
import {
  templateCategoryMap,
  type ChallengeCategory,
  type LiquidCard,
  type MemorySequenceCard,
  type PatternChainCard,
  type PuzzleDna,
  type RuleFlipCard,
  type SpotItCard,
  type TemplateType,
  type TinyLogicCard,
  type WhatChangedCard,
} from './types';

// ---------------------------------------------------------------------------
// Sample card factories. Each returns a fully valid card for its template;
// individual tests clone-and-break exactly one field to exercise one rule.
// ---------------------------------------------------------------------------

const dna = (mechanic: string): PuzzleDna => ({
  mechanic,
  inputMode: 'tap',
  measuredSignals: ['accuracy'],
});

function validSpotIt(): SpotItCard {
  return {
    cardId: 'spot-1',
    creatorHandle: 'lumaloop',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Tap the element that is different.',
    puzzleDna: dna('find-the-odd-one-out'),
    explanation: {
      title: 'Visual scanning',
      body: 'The anomaly sits in the lower-right region of the grid.',
    },
    config: {
      rows: 4,
      columns: 4,
      baseElement: '●',
      anomalyElement: '◆',
      anomalyRow: 2,
      anomalyColumn: 3,
      timeLimitMs: 15000,
    },
  };
}

function validWhatChanged(): WhatChangedCard {
  return {
    cardId: 'what-1',
    creatorHandle: 'lumaloop',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 25,
    prompt: 'What changed in the pattern?',
    puzzleDna: dna('recall-the-difference'),
    explanation: {
      title: 'Working memory',
      body: 'The second tile shifted from blue to green.',
    },
    config: {
      previewMs: 1500,
      timeLimitMs: 20000,
      beforePattern: ['blue', 'blue', 'red'],
      afterPattern: ['blue', 'green', 'red'],
      options: [
        { id: 'a', label: 'Tile 1' },
        { id: 'b', label: 'Tile 2' },
        { id: 'c', label: 'Tile 3' },
      ],
      correctOptionId: 'b',
    },
  };
}

function validRuleFlip(): RuleFlipCard {
  return {
    cardId: 'rule-1',
    creatorHandle: 'lumaloop',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'hard',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 30,
    prompt: 'Follow the rule — it may change.',
    puzzleDna: dna('rule-switch'),
    explanation: {
      title: 'Cognitive flexibility',
      body: 'After the third stimulus the matching rule inverts.',
    },
    config: {
      timeLimitMs: 25000,
      stimulusDurationMs: 1200,
      interStimulusGapMs: 300,
      initialRuleLabel: 'Tap warm colors',
      flippedRuleLabel: 'Tap cool colors',
      flipAtStimulusIndex: 3,
      stimuli: [
        { id: 's1', label: 'red', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: 'orange', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's3', label: 'blue', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's4', label: 'green', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  };
}

function validTinyLogic(): TinyLogicCard {
  return {
    cardId: 'logic-1',
    creatorHandle: 'lumaloop',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 25,
    prompt: 'Which number comes next?',
    puzzleDna: dna('sequence-completion'),
    explanation: {
      title: 'Logical reasoning',
      body: 'The sequence increases by three each step.',
    },
    config: {
      stem: '2, 5, 8, ?',
      options: [
        { id: 'a', label: '10' },
        { id: 'b', label: '11' },
        { id: 'c', label: '12' },
      ],
      correctOptionId: 'b',
      timeLimitMs: 18000,
    },
  };
}

function validMemorySequence(): MemorySequenceCard {
  return {
    cardId: 'memseq-1',
    creatorHandle: 'lumaloop',
    templateType: 'memory_sequence',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Watch the tiles flash, then tap them in order.',
    puzzleDna: dna('sequence-recall'),
    explanation: {
      title: 'Working memory',
      body: 'Reproduce the flashed order of tiles.',
    },
    config: {
      rows: 3,
      columns: 3,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
      ],
      flashMs: 500,
      gapMs: 250,
      timeLimitMs: 12000,
    },
  };
}

function validPatternChain(): PatternChainCard {
  return {
    cardId: 'chain-1',
    creatorHandle: 'lumaloop',
    templateType: 'pattern_chain',
    category: 'pattern_recognition',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Continue the sequence by picking the next item, then the next.',
    puzzleDna: dna('sequence-continuation'),
    explanation: {
      title: 'Pattern recognition',
      body: 'The sequence climbs by two each step.',
    },
    config: {
      sequence: ['2', '4', '6'],
      steps: [
        {
          options: [
            { id: 'a', label: '7' },
            { id: 'b', label: '8' },
          ],
          correctOptionId: 'b',
        },
        {
          options: [
            { id: 'a', label: '9' },
            { id: 'b', label: '10' },
          ],
          correctOptionId: 'b',
        },
      ],
      timeLimitMs: 14000,
    },
  };
}

function validCatalog(): LiquidCard[] {
  return [
    validSpotIt(),
    validWhatChanged(),
    validRuleFlip(),
    validTinyLogic(),
    validMemorySequence(),
    validPatternChain(),
  ];
}

/** Was a given rule reported for any card in the result? */
function hasRule(
  errors: ReturnType<typeof validateCatalog>['errors'],
  rule: string,
): boolean {
  return errors.some((error) => error.rule === rule);
}

describe('validateCatalog', () => {
  it('passes a fully valid sample catalog with zero errors', () => {
    const result = validateCatalog(validCatalog());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an empty catalog (nothing to violate)', () => {
    expect(validateCatalog([])).toEqual({ valid: true, errors: [] });
  });

  it('rejects a duplicate cardId', () => {
    const dup = validSpotIt();
    dup.cardId = 'logic-1'; // collide with the tiny_logic card
    const result = validateCatalog([...validCatalog(), dup]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.UNIQUE_CARD_ID)).toBe(true);
    const dupErrors = result.errors.filter(
      (error) => error.rule === ValidationRule.UNIQUE_CARD_ID,
    );
    expect(dupErrors).toHaveLength(1);
    expect(dupErrors[0]?.cardId).toBe('logic-1');
  });

  it('rejects an unsupported templateType', () => {
    const broken = {
      ...validSpotIt(),
      templateType: 'mystery_game',
    } as unknown as LiquidCard;
    const result = validateCatalog([broken]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.SUPPORTED_TEMPLATE_TYPE)).toBe(
      true,
    );
  });

  it('rejects a category that is invalid for the template', () => {
    const card = validSpotIt();
    // logical_reasoning is valid for tiny_logic, never for spot_it.
    card.category = 'logical_reasoning';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(
      hasRule(result.errors, ValidationRule.VALID_CATEGORY_FOR_TEMPLATE),
    ).toBe(true);
  });

  it('rejects an empty prompt', () => {
    const card = validWhatChanged();
    card.prompt = '   ';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.NON_EMPTY_PROMPT)).toBe(true);
  });

  it('rejects a time limit below the lower bound', () => {
    const card = validTinyLogic();
    card.config.timeLimitMs = MIN_TIME_LIMIT_MS - 1;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.TIME_LIMIT_RANGE)).toBe(true);
  });

  it('rejects a time limit above the upper bound', () => {
    const card = validTinyLogic();
    card.config.timeLimitMs = MAX_TIME_LIMIT_MS + 1;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.TIME_LIMIT_RANGE)).toBe(true);
  });

  it('rejects a NaN time limit (finiteness guard, not just range)', () => {
    const card = validTinyLogic();
    card.config.timeLimitMs = Number.NaN;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.TIME_LIMIT_RANGE)).toBe(true);
  });

  it('rejects an Infinity time limit', () => {
    const card = validTinyLogic();
    card.config.timeLimitMs = Number.POSITIVE_INFINITY;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.TIME_LIMIT_RANGE)).toBe(true);
  });

  it('accepts time limits exactly on the inclusive bounds', () => {
    const low = validTinyLogic();
    low.config.timeLimitMs = MIN_TIME_LIMIT_MS;
    const high = validSpotIt();
    high.config.timeLimitMs = MAX_TIME_LIMIT_MS;
    expect(validateCatalog([low, high]).valid).toBe(true);
  });

  it('rejects a spot_it anomaly outside the grid bounds', () => {
    const card = validSpotIt();
    card.config.anomalyRow = card.config.rows; // one past the last row
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a spot_it grid with non-positive dimensions', () => {
    const card = validSpotIt();
    card.config.rows = 0;
    card.config.columns = -1;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a spot_it anomalyColumn outside the grid bounds', () => {
    const card = validSpotIt();
    card.config.anomalyColumn = card.config.columns; // one past the last column
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a what_changed correctOptionId not among options', () => {
    const card = validWhatChanged();
    card.config.correctOptionId = 'does-not-exist';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a rule_flip with no stimuli', () => {
    const card = validRuleFlip();
    card.config.stimuli = [];
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a rule_flip with an out-of-range flipAtStimulusIndex', () => {
    const card = validRuleFlip();
    card.config.flipAtStimulusIndex = card.config.stimuli.length;
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a tiny_logic correctOptionId not among options', () => {
    const card = validTinyLogic();
    card.config.correctOptionId = 'zzz';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('accepts a valid memory_sequence card', () => {
    const result = validateCatalog([validMemorySequence()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a memory_sequence with an empty sequence', () => {
    const card = validMemorySequence();
    card.config = { ...card.config, sequence: [] };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a memory_sequence coordinate outside the grid bounds', () => {
    const card = validMemorySequence();
    card.config = {
      ...card.config,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 9 }, // column 9 is outside a 3-column grid
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a memory_sequence whose length is outside [3, 6]', () => {
    const card = validMemorySequence();
    // Two tiles is below the minimum span of three.
    card.config = {
      ...card.config,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('accepts a valid pattern_chain card', () => {
    const result = validateCatalog([validPatternChain()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a pattern_chain with an empty visible sequence', () => {
    const card = validPatternChain();
    card.config = { ...card.config, sequence: [] };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a pattern_chain with fewer than two steps', () => {
    const card = validPatternChain();
    card.config = {
      ...card.config,
      steps: [card.config.steps[0]],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a pattern_chain step whose correctOptionId is not among its options', () => {
    const card = validPatternChain();
    card.config = {
      ...card.config,
      steps: [
        { ...card.config.steps[0], correctOptionId: 'does-not-exist' },
        card.config.steps[1],
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a pattern_chain step with duplicate option ids', () => {
    const card = validPatternChain();
    card.config = {
      ...card.config,
      steps: [
        {
          options: [
            { id: 'dup', label: '7' },
            { id: 'dup', label: '8' },
          ],
          correctOptionId: 'dup',
        },
        card.config.steps[1],
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a missing explanation', () => {
    const card = validSpotIt();
    card.explanation = { title: '', body: '' };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.EXPLANATION_PRESENT)).toBe(
      true,
    );
  });

  it('returns an error (does not throw) for a card missing prompt', () => {
    const drifted = validSpotIt() as unknown as Record<string, unknown>;
    delete drifted.prompt;
    const card = drifted as unknown as LiquidCard;
    let result!: ReturnType<typeof validateCatalog>;
    expect(() => {
      result = validateCatalog([card]);
    }).not.toThrow();
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.NON_EMPTY_PROMPT)).toBe(true);
  });

  it('returns an error (does not throw) for a card missing explanation', () => {
    const drifted = validSpotIt() as unknown as Record<string, unknown>;
    delete drifted.explanation;
    const card = drifted as unknown as LiquidCard;
    let result!: ReturnType<typeof validateCatalog>;
    expect(() => {
      result = validateCatalog([card]);
    }).not.toThrow();
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.EXPLANATION_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a disallowed evidence tier (benchmark_probe)', () => {
    const card = validSpotIt();
    card.evidenceTier = 'benchmark_probe';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.EVIDENCE_TIER)).toBe(true);
  });

  it('rejects the other disallowed evidence tier (telemetry_calibrated)', () => {
    const card = validSpotIt();
    card.evidenceTier = 'telemetry_calibrated';
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.EVIDENCE_TIER)).toBe(true);
  });

  it('only allows entertainment_only and mechanic_mapped tiers', () => {
    expect([...ALLOWED_EVIDENCE_TIERS].sort()).toEqual(
      ['entertainment_only', 'mechanic_mapped'].sort(),
    );
  });

  it('collects multiple independent errors across the catalog', () => {
    const a = validSpotIt();
    a.prompt = '';
    const b = validTinyLogic();
    b.evidenceTier = 'benchmark_probe';
    const result = validateCatalog([a, b]);
    expect(hasRule(result.errors, ValidationRule.NON_EMPTY_PROMPT)).toBe(true);
    expect(hasRule(result.errors, ValidationRule.EVIDENCE_TIER)).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// templateCategoryMap <-> VALID_CATEGORY_FOR_TEMPLATE consistency (§17 item 7).
//
// types.test.ts pins the MAP's shape and catalog.test.ts proves the authored
// catalog respects it, but nothing proved the validation RULE and the map agree
// across the full (template x category) cross-product — the existing
// validateCatalog suite only spot-checks a single invalid pairing. These tests
// close that loop: every category the map declares valid for a template must be
// ACCEPTED by validation, and every category it does NOT list must be REJECTED
// with the VALID_CATEGORY_FOR_TEMPLATE rule. A drift between the map and the
// validator (in either direction) now fails here.
// ---------------------------------------------------------------------------

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'spot_it',
  'what_changed',
  'rule_flip',
  'tiny_logic',
  'memory_sequence',
  'pattern_chain',
];

const ALL_CATEGORIES: ChallengeCategory[] = [
  'visual_attention',
  'working_memory',
  'logical_reasoning',
  'cognitive_flexibility',
  'pattern_recognition',
  'processing_speed',
];

/** A valid-card factory per template, so only `category` varies under test. */
const validCardFor: Record<TemplateType, () => LiquidCard> = {
  spot_it: validSpotIt,
  what_changed: validWhatChanged,
  rule_flip: validRuleFlip,
  tiny_logic: validTinyLogic,
  memory_sequence: validMemorySequence,
  pattern_chain: validPatternChain,
};

describe('templateCategoryMap <-> validation consistency', () => {
  for (const templateType of ALL_TEMPLATE_TYPES) {
    for (const category of ALL_CATEGORIES) {
      const allowed = templateCategoryMap[templateType].includes(category);

      it(`${allowed ? 'accepts' : 'rejects'} ${templateType} + ${category}`, () => {
        const card = validCardFor[templateType]();
        card.category = category;
        const result = validateCatalog([card]);
        const flaggedCategory = hasRule(
          result.errors,
          ValidationRule.VALID_CATEGORY_FOR_TEMPLATE,
        );

        if (allowed) {
          // An allowed pairing must not trip the category rule — and since the
          // rest of the card is valid, the whole catalog must validate.
          expect(flaggedCategory).toBe(false);
          expect(result.valid).toBe(true);
        } else {
          // A pairing the map does not list must be rejected by the rule.
          expect(flaggedCategory).toBe(true);
        }
      });
    }
  }

  it("declares only categories present in this suite's ALL_CATEGORIES list", () => {
    // The map's value type already guarantees `ChallengeCategory` at compile
    // time, so this is NOT a type check. It is a drift-guard on the hand-
    // maintained `ALL_CATEGORIES` list that builds the negative-pairing
    // cross-product below: if the map referenced a category missing from that
    // list, the negative coverage would silently skip it. Keeps the list honest.
    for (const templateType of ALL_TEMPLATE_TYPES) {
      for (const category of templateCategoryMap[templateType]) {
        expect(ALL_CATEGORIES).toContain(category);
      }
    }
  });
});

describe('assertValidCatalog', () => {
  it('returns the catalog unchanged when valid', () => {
    const catalog = validCatalog();
    expect(assertValidCatalog(catalog)).toBe(catalog);
  });

  it('throws an aggregated error listing every failure when invalid', () => {
    const card = validSpotIt();
    card.prompt = '';
    card.evidenceTier = 'benchmark_probe';
    expect(() => assertValidCatalog([card])).toThrow(/Invalid card catalog/);
    try {
      assertValidCatalog([card]);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(ValidationRule.NON_EMPTY_PROMPT);
      expect(message).toContain(ValidationRule.EVIDENCE_TIER);
    }
  });
});
