import {
  ALLOWED_EVIDENCE_TIERS,
  MAX_TIME_LIMIT_MS,
  MIN_TIME_LIMIT_MS,
  ValidationRule,
  assertValidCatalog,
  validateCatalog,
} from './validation';
import type {
  LiquidCard,
  PuzzleDna,
  RuleFlipCard,
  SpotItCard,
  TinyLogicCard,
  WhatChangedCard,
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

function validCatalog(): LiquidCard[] {
  return [validSpotIt(), validWhatChanged(), validRuleFlip(), validTinyLogic()];
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

  it('rejects a missing explanation', () => {
    const card = validSpotIt();
    card.explanation = { title: '', body: '' };
    const result = validateCatalog([card]);
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
