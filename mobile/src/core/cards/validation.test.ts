// Ported from web `src/cards/validation.test.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
import {
  ALLOWED_EVIDENCE_TIERS,
  MAX_CHAIN_STEPS,
  MAX_CODE_GUESSES,
  MAX_CODE_LENGTH,
  MAX_PRISM_GRID_SIZE,
  MAX_SEQUENCE_LENGTH,
  MAX_SPOT_IT_COLUMNS,
  MAX_STEP_LOGIC_STEPS,
  MAX_TIME_LIMIT_MS,
  MIN_CODE_GUESSES,
  MIN_CODE_LENGTH,
  MIN_PRISM_GRID_SIZE,
  MIN_TIME_LIMIT_MS,
  ValidationRule,
  assertValidCatalog,
  validateCatalog,
} from './validation';
import {
  templateCategoryMap,
  type ChallengeCategory,
  type CodeBreakCard,
  type CircuitFlowCard,
  type ColorWordCard,
  type LiquidCard,
  type MemorySequenceCard,
  type NBackCard,
  type OddOneOutCard,
  type PatternChainCard,
  type PrismPathCard,
  type PuzzleDna,
  type RuleFlipCard,
  type SchulteOrderCard,
  type SignalSetCard,
  type SpotItCard,
  type StepLogicCard,
  type QuickMathCard,
  type TemplateType,
  type TinyLogicCard,
  type WhatChangedCard,
  type WordUnscrambleCard,
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

function validStepLogic(): StepLogicCard {
  return {
    cardId: 'steplogic-1',
    creatorHandle: 'lumaloop',
    templateType: 'step_logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Work through the linked clues one step at a time.',
    puzzleDna: dna('multi-step-deduction'),
    explanation: {
      title: 'Logical reasoning',
      body: 'Each sub-answer feeds the next, so the chain resolves in order.',
    },
    config: {
      premise: 'Mia is taller than Jo. Jo is taller than Sam.',
      steps: [
        {
          stem: 'Who is the tallest?',
          options: [
            { id: 'a', label: 'Mia' },
            { id: 'b', label: 'Jo' },
          ],
          correctOptionId: 'a',
        },
        {
          stem: 'Who is the shortest?',
          options: [
            { id: 'a', label: 'Mia' },
            { id: 'b', label: 'Sam' },
          ],
          correctOptionId: 'b',
        },
      ],
      timeLimitMs: 18000,
    },
  };
}

function validCodeBreak(): CodeBreakCard {
  return {
    cardId: 'codebreak-1',
    creatorHandle: 'lumaloop',
    templateType: 'code_break',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 25,
    prompt: 'Crack the hidden code from the peg feedback.',
    puzzleDna: dna('deductive-code-breaking'),
    explanation: {
      title: 'Deductive code breaking',
      body: 'Each row of pegs narrows the possibilities until one code remains.',
    },
    config: {
      palette: ['🔴', '🟢', '🔵', '🟡'],
      codeLength: 3,
      secret: ['🔴', '🟢', '🔵'],
      maxGuesses: 8,
      timeLimitMs: 25000,
    },
  };
}

function validPrismPath(): PrismPathCard {
  return {
    cardId: 'prismpath-1',
    creatorHandle: 'lumaloop',
    templateType: 'prism_path',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Rotate mirrors to route the beam.',
    puzzleDna: dna('mirror-beam-routing'),
    explanation: {
      title: 'Mirror routing',
      body: 'Each mirror redirects the beam by a right angle until the route reaches the target.',
    },
    config: {
      rows: 4,
      columns: 4,
      entry: { row: 3, column: 0 },
      entryDirection: 'right',
      target: { row: 0, column: 3 },
      mirrors: [
        { id: 'm1', row: 3, column: 2, initialOrientation: 'slash' },
        { id: 'm2', row: 0, column: 2, initialOrientation: 'slash' },
      ],
      blockers: [{ row: 1, column: 1 }],
      solution: [
        { mirrorId: 'm1', orientation: 'slash' },
        { mirrorId: 'm2', orientation: 'slash' },
      ],
      timeLimitMs: 20000,
    },
  };
}

function validSignalSet(): SignalSetCard {
  return {
    cardId: 'signalset-1',
    creatorHandle: '@test',
    templateType: 'signal_set',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Pick a valid trio.',
    puzzleDna: dna('attribute-triad'),
    explanation: { title: 'Triad', body: 'All same or all different.' },
    config: {
      tiles: [
        { id: 'a', shape: 'circle', fill: 'solid', count: 1 },
        { id: 'b', shape: 'triangle', fill: 'striped', count: 2 },
        { id: 'c', shape: 'diamond', fill: 'outline', count: 3 },
        { id: 'd', shape: 'circle', fill: 'outline', count: 2 },
        { id: 'e', shape: 'triangle', fill: 'solid', count: 3 },
        { id: 'f', shape: 'diamond', fill: 'striped', count: 1 },
      ],
      solutionIds: ['a', 'b', 'c'],
      timeLimitMs: 20000,
    },
  };
}

function validCircuitFlow(): CircuitFlowCard {
  return {
    cardId: 'circuit-1',
    creatorHandle: '@test',
    templateType: 'circuit_flow',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Connect every tile.',
    puzzleDna: dna('rotating-network'),
    explanation: { title: 'Circuit', body: 'Every arm meets a neighbor.' },
    config: {
      rows: 2,
      columns: 2,
      sourceTileId: 'a',
      tiles: [
        {
          id: 'a',
          row: 0,
          column: 0,
          connections: ['right', 'down'],
          initialRotation: 1,
        },
        {
          id: 'b',
          row: 0,
          column: 1,
          connections: ['left'],
          initialRotation: 2,
        },
        {
          id: 'c',
          row: 1,
          column: 0,
          connections: ['up', 'right'],
          initialRotation: 3,
        },
        {
          id: 'd',
          row: 1,
          column: 1,
          connections: ['left'],
          initialRotation: 1,
        },
      ],
      solution: [
        { tileId: 'a', rotation: 0 },
        { tileId: 'b', rotation: 0 },
        { tileId: 'c', rotation: 0 },
        { tileId: 'd', rotation: 0 },
      ],
      timeLimitMs: 20000,
    },
  };
}

function validWordUnscramble(): WordUnscrambleCard {
  return {
    cardId: 'unscramble-1',
    creatorHandle: '@test',
    templateType: 'word_unscramble',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Unscramble the word.',
    puzzleDna: dna('word-unscramble'),
    explanation: { title: 'It spells STARE', body: 'The letters spell STARE.' },
    config: {
      scrambled: 'tsrae',
      answer: 'stare',
      options: [
        { id: 'a', label: 'stare' },
        { id: 'b', label: 'store' },
        { id: 'c', label: 'scare' },
      ],
      correctOptionId: 'a',
      timeLimitMs: 15000,
    },
  };
}

function validQuickMath(): QuickMathCard {
  return {
    cardId: 'quickmath-1',
    creatorHandle: '@test',
    templateType: 'quick_math',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Solve the equation.',
    puzzleDna: dna('quick-math'),
    explanation: { title: 'Multiply first', body: '9 × 4 = 36, − 5 = 31.' },
    config: {
      display: '9 × 4 − 5',
      expression: { operands: [9, 4, 5], operators: ['*', '-'] },
      options: [
        { id: 'a', label: '31', value: 31 },
        { id: 'b', label: '41', value: 41 },
        { id: 'c', label: '30', value: 30 },
      ],
      correctOptionId: 'a',
      timeLimitMs: 14000,
    },
  };
}

function validColorWord(): ColorWordCard {
  return {
    cardId: 'colorword-1',
    creatorHandle: '@test',
    templateType: 'color_word',
    category: 'cognitive_flexibility',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Tap the colour the word is printed in.',
    puzzleDna: dna('stroop-interference'),
    explanation: { title: 'Ink over word', body: 'Answer the ink colour.' },
    config: {
      colors: [
        { id: 'red', label: 'Red', hex: '#e5484d' },
        { id: 'blue', label: 'Blue', hex: '#3e63dd' },
        { id: 'green', label: 'Green', hex: '#46a758' },
      ],
      trials: [
        { id: 't0', word: 'RED', inkColorId: 'red', congruent: true },
        { id: 't1', word: 'BLUE', inkColorId: 'green', congruent: false },
        { id: 't2', word: 'GREEN', inkColorId: 'red', congruent: false },
        { id: 't3', word: 'BLUE', inkColorId: 'blue', congruent: true },
      ],
      trialDurationMs: 2000,
      interTrialGapMs: 300,
      timeLimitMs: 16000,
    },
  };
}

function validNBack(): NBackCard {
  return {
    cardId: 'nback-1',
    creatorHandle: '@test',
    templateType: 'n_back',
    category: 'working_memory',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Flag each letter that repeats the one just before it.',
    puzzleDna: dna('n-back'),
    explanation: { title: '1-back', body: 'Match the item one step back.' },
    config: {
      itemKind: 'letter',
      stream: ['A', 'B', 'B', 'C', 'D', 'D', 'E'],
      n: 1,
      matchIndices: [2, 5],
      itemDurationMs: 1600,
      interItemGapMs: 400,
      timeLimitMs: 18000,
    },
  };
}

function validOddOneOut(): OddOneOutCard {
  return {
    cardId: 'oddoneout-1',
    creatorHandle: '@test',
    templateType: 'odd_one_out',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Tap the one that does not belong.',
    puzzleDna: dna('odd-one-out'),
    explanation: { title: 'Shared rule', body: 'Three are even; one is odd.' },
    config: {
      items: [
        { id: 'a', label: '4' },
        { id: 'b', label: '8' },
        { id: 'c', label: '7' },
        { id: 'd', label: '12' },
      ],
      oddItemId: 'c',
      timeLimitMs: 12000,
    },
  };
}

function validSchulteOrder(): SchulteOrderCard {
  return {
    cardId: 'schulte-1',
    creatorHandle: '@test',
    templateType: 'schulte_order',
    category: 'processing_speed',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Tap 1 to 5 in order, as fast as you can.',
    puzzleDna: dna('schulte-scan'),
    explanation: { title: 'Order', body: 'Scan and tap ascending.' },
    config: {
      rows: 3,
      columns: 2,
      targets: [
        { id: 's1', label: '1', row: 2, column: 1 },
        { id: 's2', label: '2', row: 0, column: 0 },
        { id: 's3', label: '3', row: 1, column: 1 },
        { id: 's4', label: '4', row: 2, column: 0 },
        { id: 's5', label: '5', row: 0, column: 1 },
      ],
      timeLimitMs: 20000,
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
    validStepLogic(),
    validCodeBreak(),
    validPrismPath(),
    validSignalSet(),
    validCircuitFlow(),
    validColorWord(),
    validNBack(),
    validOddOneOut(),
    validSchulteOrder(),
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

  it('rejects a signal_set whose canonical trio breaks an attribute rule', () => {
    const card = validSignalSet();
    card.config = { ...card.config, solutionIds: ['a', 'b', 'd'] };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a circuit_flow whose authored solution leaves loose arms', () => {
    const card = validCircuitFlow();
    card.config = {
      ...card.config,
      solution: card.config.solution.map((item) =>
        item.tileId === 'a' ? { ...item, rotation: 1 as const } : item,
      ),
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
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

  it('rejects a spot_it board wider than the mobile-safe column limit', () => {
    const card = validSpotIt();
    card.config.columns = MAX_SPOT_IT_COLUMNS + 1;
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
        { row: card.config.rows, column: 2 }, // one past the last row
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a memory_sequence whose length is below [3, 8]', () => {
    const card = validMemorySequence();
    // Two in-grid coords — valid coordinates, but a length below the minimum.
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

  it('accepts a memory_sequence at the raised max length (8)', () => {
    const card = validMemorySequence();
    // 8 in-grid coords on a 3x3 grid (reuse the diagonal; coordinates may repeat
    // across the watch order — only the per-coord grid bounds are enforced).
    card.config = {
      ...card.config,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
        { row: 0, column: 1 },
        { row: 1, column: 2 },
        { row: 2, column: 0 },
        { row: 0, column: 2 },
        { row: 1, column: 0 },
      ],
    };
    expect(card.config.sequence).toHaveLength(MAX_SEQUENCE_LENGTH);
    expect(validateCatalog([card]).valid).toBe(true);
  });

  it('rejects a memory_sequence above the raised max length (9)', () => {
    const card = validMemorySequence();
    card.config = {
      ...card.config,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
        { row: 0, column: 1 },
        { row: 1, column: 2 },
        { row: 2, column: 0 },
        { row: 0, column: 2 },
        { row: 1, column: 0 },
        { row: 2, column: 1 },
      ],
    };
    expect(card.config.sequence.length).toBeGreaterThan(MAX_SEQUENCE_LENGTH);
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
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

  it('accepts a pattern_chain at the raised max step count (5)', () => {
    const card = validPatternChain();
    const step = card.config.steps[0];
    card.config = {
      ...card.config,
      steps: [step, step, step, step, step],
    };
    expect(card.config.steps).toHaveLength(MAX_CHAIN_STEPS);
    expect(validateCatalog([card]).valid).toBe(true);
  });

  it('rejects a pattern_chain above the raised max step count (6)', () => {
    const card = validPatternChain();
    const step = card.config.steps[0];
    card.config = {
      ...card.config,
      steps: [step, step, step, step, step, step],
    };
    expect(card.config.steps.length).toBeGreaterThan(MAX_CHAIN_STEPS);
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

  it('rejects a step_logic with an empty premise', () => {
    const card = validStepLogic();
    card.config = { ...card.config, premise: '   ' };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a step_logic with fewer than two steps', () => {
    const card = validStepLogic();
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

  it('accepts a step_logic at the raised max step count (5)', () => {
    const card = validStepLogic();
    const step = card.config.steps[0];
    card.config = {
      ...card.config,
      steps: [step, step, step, step, step],
    };
    expect(card.config.steps).toHaveLength(MAX_STEP_LOGIC_STEPS);
    expect(validateCatalog([card]).valid).toBe(true);
  });

  it('rejects a step_logic above the raised max step count (6)', () => {
    const card = validStepLogic();
    const step = card.config.steps[0];
    card.config = {
      ...card.config,
      steps: [step, step, step, step, step, step],
    };
    expect(card.config.steps.length).toBeGreaterThan(MAX_STEP_LOGIC_STEPS);
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a step_logic step with an empty stem', () => {
    const card = validStepLogic();
    card.config = {
      ...card.config,
      steps: [
        { ...card.config.steps[0], stem: '  ' },
        card.config.steps[1],
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a step_logic step whose correctOptionId is not among its options', () => {
    const card = validStepLogic();
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

  it('rejects a step_logic step with duplicate option ids', () => {
    const card = validStepLogic();
    card.config = {
      ...card.config,
      steps: [
        {
          stem: 'Who is the tallest?',
          options: [
            { id: 'dup', label: 'Mia' },
            { id: 'dup', label: 'Jo' },
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

  // ── code_break (#143) ──────────────────────────────────────────────────────

  it('accepts a valid code_break', () => {
    const result = validateCatalog([validCodeBreak()]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a code_break whose secret length does not match codeLength', () => {
    const card = validCodeBreak();
    card.config = { ...card.config, secret: ['🔴', '🟢'] }; // length 2, codeLength 3
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a code_break secret symbol that is not in the palette', () => {
    const card = validCodeBreak();
    card.config = { ...card.config, secret: ['🔴', '🟢', '⚫'] };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a code_break with a duplicate-symbol palette', () => {
    const card = validCodeBreak();
    card.config = {
      ...card.config,
      palette: ['🔴', '🔴', '🔵', '🟡'],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a code_break with too small a palette', () => {
    const card = validCodeBreak();
    card.config = {
      ...card.config,
      palette: ['🔴'],
      codeLength: 1,
      secret: ['🔴'],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a code_break codeLength outside bounds', () => {
    const tooLong = MAX_CODE_LENGTH + 1;
    const palette = Array.from({ length: tooLong }, (_, i) => `s${i}`);
    const card = validCodeBreak();
    card.config = {
      ...card.config,
      palette,
      codeLength: tooLong,
      secret: palette.slice(0, tooLong),
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('accepts a code_break at the min codeLength and max guesses', () => {
    const card = validCodeBreak();
    card.config = {
      ...card.config,
      codeLength: MIN_CODE_LENGTH,
      secret: ['🔴', '🟢', '🔵'],
      maxGuesses: MAX_CODE_GUESSES,
    };
    const result = validateCatalog([card]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a code_break maxGuesses below the minimum', () => {
    const card = validCodeBreak();
    card.config = { ...card.config, maxGuesses: MIN_CODE_GUESSES - 1 };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a code_break with an out-of-range time limit', () => {
    const card = validCodeBreak();
    card.config = { ...card.config, timeLimitMs: MAX_TIME_LIMIT_MS + 1 };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.TIME_LIMIT_RANGE)).toBe(true);
  });

  // ── prism_path ────────────────────────────────────────────────────────────

  it('accepts a valid prism_path', () => {
    const result = validateCatalog([validPrismPath()]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a prism_path grid outside bounds', () => {
    const card = validPrismPath();
    card.config = {
      ...card.config,
      rows: MIN_PRISM_GRID_SIZE - 1,
      columns: MAX_PRISM_GRID_SIZE + 1,
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects prism_path overlapping mirrors and blockers', () => {
    const card = validPrismPath();
    card.config = {
      ...card.config,
      blockers: [{ row: 3, column: 2 }],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a prism_path solution that references an unknown mirror', () => {
    const card = validPrismPath();
    card.config = {
      ...card.config,
      solution: [
        { mirrorId: 'm1', orientation: 'slash' },
        { mirrorId: 'ghost', orientation: 'slash' },
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a prism_path whose authored solution misses the target', () => {
    const card = validPrismPath();
    card.config = {
      ...card.config,
      solution: [
        { mirrorId: 'm1', orientation: 'backslash' },
        { mirrorId: 'm2', orientation: 'backslash' },
      ],
    };
    const result = validateCatalog([card]);
    expect(result.valid).toBe(false);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
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
  step_logic: validStepLogic,
  code_break: validCodeBreak,
  prism_path: validPrismPath,
  signal_set: validSignalSet,
  circuit_flow: validCircuitFlow,
  word_unscramble: validWordUnscramble,
  quick_math: validQuickMath,
  color_word: validColorWord,
  n_back: validNBack,
  odd_one_out: validOddOneOut,
  schulte_order: validSchulteOrder,
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

describe('word_unscramble answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validWordUnscramble()]).valid).toBe(true);
  });

  it('rejects scrambled letters that are not an anagram of the answer', () => {
    const card = validWordUnscramble();
    card.config = { ...card.config, scrambled: 'xxxxx' };
    const result = validateCatalog([card]);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects scrambled letters that already spell the answer', () => {
    const card = validWordUnscramble();
    card.config = { ...card.config, scrambled: 'stare' };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects a correct option whose label is not the answer', () => {
    const card = validWordUnscramble();
    card.config = { ...card.config, correctOptionId: 'b' }; // label "store" != answer
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects a correctOptionId that is not among options', () => {
    const card = validWordUnscramble();
    card.config = { ...card.config, correctOptionId: 'missing' };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});

describe('quick_math answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validQuickMath()]).valid).toBe(true);
  });

  it('rejects a correct option whose value does not equal the computed result', () => {
    const card = validQuickMath();
    // Computed = 31; point correct at the wrong value.
    card.config = { ...card.config, correctOptionId: 'b' };
    const result = validateCatalog([card]);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects an operator/operand length mismatch', () => {
    const card = validQuickMath();
    card.config = {
      ...card.config,
      expression: { operands: [9, 4, 5], operators: ['*'] },
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects two options sharing the computed value (ambiguous answer)', () => {
    const card = validQuickMath();
    card.config = {
      ...card.config,
      options: [
        { id: 'a', label: '31', value: 31 },
        { id: 'b', label: '31', value: 31 },
        { id: 'c', label: '30', value: 30 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});

describe('color_word answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validColorWord()]).valid).toBe(true);
  });

  it('rejects a trial whose inkColorId is not a defined color', () => {
    const card = validColorWord();
    card.config = {
      ...card.config,
      trials: [
        ...card.config.trials.slice(0, 3),
        { id: 't3', word: 'BLUE', inkColorId: 'purple', congruent: false },
      ],
    };
    const result = validateCatalog([card]);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects too few trials', () => {
    const card = validColorWord();
    card.config = { ...card.config, trials: card.config.trials.slice(0, 2) };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects duplicate color ids', () => {
    const card = validColorWord();
    card.config = {
      ...card.config,
      colors: [
        { id: 'red', label: 'Red', hex: '#e5484d' },
        { id: 'red', label: 'Crimson', hex: '#c00' },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects a color swatch missing its label (colour is never the sole signal)', () => {
    const card = validColorWord();
    card.config = {
      ...card.config,
      colors: [
        { id: 'red', label: '', hex: '#e5484d' },
        { id: 'blue', label: 'Blue', hex: '#3e63dd' },
        { id: 'green', label: 'Green', hex: '#46a758' },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});

describe('n_back answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validNBack()]).valid).toBe(true);
  });

  it('accepts a 2-back card with a derived match set', () => {
    const card = validNBack();
    card.config = {
      ...card.config,
      stream: ['F', 'K', 'F', 'M', 'K', 'P', 'M', 'P'],
      n: 2,
      matchIndices: [2, 7],
    };
    expect(validateCatalog([card]).valid).toBe(true);
  });

  it('rejects matchIndices that disagree with the derived match set', () => {
    const card = validNBack();
    // Derived for this stream/n is [2, 5]; claim a wrong set.
    card.config = { ...card.config, matchIndices: [2, 3] };
    const result = validateCatalog([card]);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects a matchIndex inside the first-n window', () => {
    const card = validNBack();
    card.config = { ...card.config, matchIndices: [0, 2, 5] };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects an out-of-range n', () => {
    const card = validNBack();
    card.config = { ...card.config, n: 3, matchIndices: [] };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects a stream shorter than the minimum', () => {
    const card = validNBack();
    card.config = {
      ...card.config,
      stream: ['A', 'A'],
      n: 1,
      matchIndices: [1],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});

describe('odd_one_out answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validOddOneOut()]).valid).toBe(true);
  });

  it('rejects an oddItemId that is not among items', () => {
    const card = validOddOneOut();
    card.config = { ...card.config, oddItemId: 'nope' };
    const result = validateCatalog([card]);
    expect(hasRule(result.errors, ValidationRule.CORRECT_ANSWER_PRESENT)).toBe(
      true,
    );
  });

  it('rejects fewer than the minimum items', () => {
    const card = validOddOneOut();
    card.config = {
      ...card.config,
      items: [
        { id: 'a', label: '4' },
        { id: 'b', label: '8' },
      ],
      oddItemId: 'a',
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects duplicate item ids', () => {
    const card = validOddOneOut();
    card.config = {
      ...card.config,
      items: [
        { id: 'a', label: '4' },
        { id: 'a', label: '8' },
        { id: 'c', label: '7' },
      ],
      oddItemId: 'c',
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects an empty item label', () => {
    const card = validOddOneOut();
    card.config = {
      ...card.config,
      items: [
        { id: 'a', label: '' },
        { id: 'b', label: '8' },
        { id: 'c', label: '7' },
      ],
      oddItemId: 'c',
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});

describe('schulte_order answer validation', () => {
  it('accepts a well-formed card', () => {
    expect(validateCatalog([validSchulteOrder()]).valid).toBe(true);
  });

  it('rejects a target outside grid bounds', () => {
    const card = validSchulteOrder();
    card.config = {
      ...card.config,
      targets: [
        { id: 's1', label: '1', row: 9, column: 0 },
        { id: 's2', label: '2', row: 0, column: 0 },
        { id: 's3', label: '3', row: 1, column: 1 },
        { id: 's4', label: '4', row: 2, column: 0 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects overlapping targets', () => {
    const card = validSchulteOrder();
    card.config = {
      ...card.config,
      targets: [
        { id: 's1', label: '1', row: 0, column: 0 },
        { id: 's2', label: '2', row: 0, column: 0 },
        { id: 's3', label: '3', row: 1, column: 1 },
        { id: 's4', label: '4', row: 2, column: 0 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects duplicate target labels', () => {
    const card = validSchulteOrder();
    card.config = {
      ...card.config,
      targets: [
        { id: 's1', label: '1', row: 0, column: 0 },
        { id: 's2', label: '1', row: 0, column: 1 },
        { id: 's3', label: '3', row: 1, column: 1 },
        { id: 's4', label: '4', row: 2, column: 0 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects fewer than the minimum targets', () => {
    const card = validSchulteOrder();
    card.config = {
      ...card.config,
      targets: [
        { id: 's1', label: '1', row: 0, column: 0 },
        { id: 's2', label: '2', row: 0, column: 1 },
        { id: 's3', label: '3', row: 1, column: 1 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects more targets than grid cells', () => {
    const card = validSchulteOrder();
    card.config = {
      ...card.config,
      rows: 2,
      columns: 2,
      targets: [
        { id: 's1', label: '1', row: 0, column: 0 },
        { id: 's2', label: '2', row: 0, column: 1 },
        { id: 's3', label: '3', row: 1, column: 0 },
        { id: 's4', label: '4', row: 1, column: 1 },
        { id: 's5', label: '5', row: 0, column: 0 },
      ],
    };
    expect(validateCatalog([card]).valid).toBe(false);
  });

  it('rejects a time limit beyond the timed-scan maximum', () => {
    const card = validSchulteOrder();
    card.config = { ...card.config, timeLimitMs: 45000 };
    expect(validateCatalog([card]).valid).toBe(false);
  });
});
