// Ported from web `src/cards/catalog.ts`; source of truth is the web app — keep
// in sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Local card catalog (Technical Design §11).
 *
 * Data-driven authored content only — no engine, renderer, or session logic
 * lives here. Each entry is a fully typed {@link LiquidCard}; adding or editing
 * a puzzle never touches engine code (CLAUDE.md §6).
 *
 * Authoring invariants (enforced by `validateCatalog`, see `./validation`):
 *   - Unique `cardId` (stable kebab slugs).
 *   - `category` is valid for the card's `templateType` (see
 *     `templateCategoryMap`).
 *   - `config.timeLimitMs` ∈ [5000, 30000] ms.
 *   - Template-specific correct answer present and in-bounds.
 *   - Non-empty `prompt` and `explanation` { title, body }.
 *   - `evidenceTier` ∈ { 'entertainment_only', 'mechanic_mapped' }.
 *
 * Accessibility (Design §556–§628): puzzles never depend on color/hue alone.
 * `spot_it` anomalies differ from their base element by SHAPE / GLYPH / LETTER
 * (e.g. circle vs. square, `O` vs. `Q`, `b` vs. `d`) so they remain solvable for
 * color-blind players and render in plain text. Content is tap-friendly and
 * small-viewport-friendly.
 *
 * Positioning (Design §7, CLAUDE.md §7): copy uses modest, performance-based
 * framing — "performance categories," not "traits." No IQ, brain-training,
 * employment, or clinical claims.
 */

import type {
  LiquidCard,
  RuleFlipCard,
  SpotItCard,
  TinyLogicCard,
  WhatChangedCard,
} from './types';

// ---------------------------------------------------------------------------
// spot_it — find the single element whose SHAPE/GLYPH differs (not its color).
// Categories allowed: visual_attention | processing_speed.
// ---------------------------------------------------------------------------

const spotItCards: SpotItCard[] = [
  {
    cardId: 'spotit-001',
    creatorHandle: '@gridwise',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'One symbol is a square instead of a circle. Tap it.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Odd shape out',
      body: 'Every other cell is a round ● — the square ■ in row 2, column 3 is the only one with corners.',
    },
    shareText: 'Found the square hiding among the circles in seconds.',
    config: {
      rows: 3,
      columns: 3,
      baseElement: '●',
      anomalyElement: '■',
      anomalyRow: 1,
      anomalyColumn: 2,
      timeLimitMs: 12000,
    },
  },
  {
    cardId: 'spotit-002',
    creatorHandle: '@lumalabs',
    templateType: 'spot_it',
    category: 'processing_speed',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'A round dot is hiding in a field of stars. Tap it fast.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'accuracy'],
    },
    explanation: {
      title: 'Form beats color',
      body: 'Stars ★ have points; the circle ● in the top row is the only smooth outline. Shape, not shade, gives it away.',
    },
    config: {
      rows: 4,
      columns: 4,
      baseElement: '★',
      anomalyElement: '●',
      anomalyRow: 0,
      anomalyColumn: 3,
      timeLimitMs: 10000,
    },
  },
  {
    cardId: 'spotit-003',
    creatorHandle: '@gridwise',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Every letter is an O — except one Q. Tap the Q.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Spot the tail',
      body: 'A Q is an O with a small tail. Scanning for that extra stroke is faster than reading each letter.',
    },
    config: {
      rows: 5,
      columns: 5,
      baseElement: 'O',
      anomalyElement: 'Q',
      anomalyRow: 3,
      anomalyColumn: 1,
      timeLimitMs: 16000,
    },
  },
  {
    cardId: 'spotit-004',
    creatorHandle: '@patternpilot',
    templateType: 'spot_it',
    category: 'processing_speed',
    difficulty: 'medium',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'A star slipped in among the diamonds. Tap the star.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'accuracy'],
    },
    explanation: {
      title: 'Points vs. edges',
      body: 'Diamonds ◆ have four straight edges; the star ★ in the last column has spikes. The silhouette is the tell.',
    },
    config: {
      rows: 5,
      columns: 5,
      baseElement: '◆',
      anomalyElement: '★',
      anomalyRow: 2,
      anomalyColumn: 4,
      timeLimitMs: 17000,
    },
  },
  {
    cardId: 'spotit-005',
    creatorHandle: '@lumalabs',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'hard',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 24,
    prompt: 'The grid is full of the letter b. One is a d. Tap the d.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Mirror trap',
      body: 'A d is a mirror of b — the bowl sits on the right. Mirror-image targets are slow to find, which is what makes this hard.',
    },
    shareText: 'Picked the lone d out of a wall of b in one look.',
    config: {
      rows: 6,
      columns: 6,
      baseElement: 'b',
      anomalyElement: 'd',
      anomalyRow: 4,
      anomalyColumn: 5,
      timeLimitMs: 22000,
    },
  },
  {
    cardId: 'spotit-006',
    creatorHandle: '@patternpilot',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'hard',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 24,
    prompt: 'A cat is hiding in a litter of dogs. Tap the cat.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Whole-shape scanning',
      body: 'The dog 🐶 and cat 🐱 differ in ear and face shape, not color. The cat sits in the bottom-left corner.',
    },
    config: {
      rows: 6,
      columns: 6,
      baseElement: '🐶',
      anomalyElement: '🐱',
      anomalyRow: 5,
      anomalyColumn: 0,
      timeLimitMs: 23000,
    },
  },
  {
    cardId: 'spotit-007',
    creatorHandle: '@gridwise',
    templateType: 'spot_it',
    category: 'processing_speed',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Spades fill the board — except one club. Tap the club.',
    puzzleDna: {
      mechanic: 'visual-search',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'accuracy'],
    },
    explanation: {
      title: 'Count the lobes',
      body: 'A spade ♠ has a single body and a stem; a club ♣ has three rounded lobes. The club hides in row 2, last column.',
    },
    config: {
      rows: 4,
      columns: 6,
      baseElement: '♠',
      anomalyElement: '♣',
      anomalyRow: 1,
      anomalyColumn: 5,
      timeLimitMs: 16000,
    },
  },
];

// ---------------------------------------------------------------------------
// what_changed — memorize a row, then identify what changed.
// Categories allowed: working_memory | visual_attention.
// ---------------------------------------------------------------------------

const whatChangedCards: WhatChangedCard[] = [
  {
    cardId: 'whatchanged-001',
    creatorHandle: '@memomatrix',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Memorize the row of shapes, then pick the position that changed.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'Hold the last item',
      body: 'Only position 4 changed: the diamond ◆ became a star ★. The first three shapes stayed the same.',
    },
    config: {
      previewMs: 3000,
      timeLimitMs: 12000,
      beforePattern: ['▲', '■', '●', '◆'],
      afterPattern: ['▲', '■', '●', '★'],
      options: [
        { id: 'pos-1', label: 'Position 1' },
        { id: 'pos-2', label: 'Position 2' },
        { id: 'pos-3', label: 'Position 3' },
        { id: 'pos-4', label: 'Position 4' },
      ],
      correctOptionId: 'pos-4',
    },
  },
  {
    cardId: 'whatchanged-002',
    creatorHandle: '@lumalabs',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Watch the letters, then pick the one that is new in the row.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'New letter in',
      body: 'The row started A B C D and became A B X D. X replaced C, so X is the letter that was not there before.',
    },
    config: {
      previewMs: 3000,
      timeLimitMs: 12000,
      beforePattern: ['A', 'B', 'C', 'D'],
      afterPattern: ['A', 'B', 'X', 'D'],
      options: [
        { id: 'opt-a', label: 'A' },
        { id: 'opt-b', label: 'B' },
        { id: 'opt-x', label: 'X' },
        { id: 'opt-d', label: 'D' },
      ],
      correctOptionId: 'opt-x',
    },
  },
  {
    cardId: 'whatchanged-003',
    creatorHandle: '@memomatrix',
    templateType: 'what_changed',
    category: 'visual_attention',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Study the five shapes, then pick the symbol that newly appeared.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'The newcomer',
      body: 'The fourth shape changed from a circle ● to a star ★. The star is the only symbol that was not in the original row.',
    },
    config: {
      previewMs: 3500,
      timeLimitMs: 15000,
      beforePattern: ['●', '▲', '■', '●', '▲'],
      afterPattern: ['●', '▲', '■', '★', '▲'],
      options: [
        { id: 'opt-circle', label: '●' },
        { id: 'opt-triangle', label: '▲' },
        { id: 'opt-square', label: '■' },
        { id: 'opt-star', label: '★' },
      ],
      correctOptionId: 'opt-star',
    },
  },
  {
    cardId: 'whatchanged-004',
    creatorHandle: '@flipstate',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'medium',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Memorize the arrows, then pick the position that flipped direction.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'Track each heading',
      body: 'Position 2 changed from up ↑ to down ↓. Because a down arrow already appears later, the position — not the symbol — is the reliable cue.',
    },
    config: {
      previewMs: 3500,
      timeLimitMs: 15000,
      beforePattern: ['→', '↑', '←', '↓'],
      afterPattern: ['→', '↓', '←', '↓'],
      options: [
        { id: 'pos-1', label: 'Position 1' },
        { id: 'pos-2', label: 'Position 2' },
        { id: 'pos-3', label: 'Position 3' },
        { id: 'pos-4', label: 'Position 4' },
      ],
      correctOptionId: 'pos-2',
    },
  },
  {
    cardId: 'whatchanged-005',
    creatorHandle: '@memomatrix',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'hard',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 22,
    prompt: 'Hold the six digits in mind, then pick the position that changed.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'Longer spans are harder',
      body: 'The sequence 7 3 9 1 5 8 became 7 3 9 4 5 8 — only position 4 changed, from 1 to 4. Six items stretch short-term span, which is what makes this hard.',
    },
    shareText: 'Caught the one digit that changed in a six-number row.',
    config: {
      previewMs: 4000,
      timeLimitMs: 18000,
      beforePattern: ['7', '3', '9', '1', '5', '8'],
      afterPattern: ['7', '3', '9', '4', '5', '8'],
      options: [
        { id: 'pos-3', label: 'Position 3' },
        { id: 'pos-4', label: 'Position 4' },
        { id: 'pos-5', label: 'Position 5' },
        { id: 'pos-6', label: 'Position 6' },
      ],
      correctOptionId: 'pos-4',
    },
  },
  {
    cardId: 'whatchanged-006',
    creatorHandle: '@patternpilot',
    templateType: 'what_changed',
    category: 'visual_attention',
    difficulty: 'hard',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 22,
    prompt: 'Study the six symbols, then pick the one that newly appeared.',
    puzzleDna: {
      mechanic: 'change-detection',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'recall'],
    },
    explanation: {
      title: 'Find the substitute',
      body: 'The fifth symbol changed from a diamond ◆ to a circle ●. The circle is the only shape absent from the original row.',
    },
    config: {
      previewMs: 4000,
      timeLimitMs: 18000,
      beforePattern: ['☀', '★', '☾', '✦', '◆', '▲'],
      afterPattern: ['☀', '★', '☾', '✦', '●', '▲'],
      options: [
        { id: 'opt-moon', label: '☾' },
        { id: 'opt-sparkle', label: '✦' },
        { id: 'opt-diamond', label: '◆' },
        { id: 'opt-circle', label: '●' },
      ],
      correctOptionId: 'opt-circle',
    },
  },
];

// ---------------------------------------------------------------------------
// rule_flip — apply a rule that switches mid-stream. Each stimulus carries its
// intrinsic match flags for the initial and flipped rules.
// Categories allowed: cognitive_flexibility | processing_speed.
// ---------------------------------------------------------------------------

const ruleFlipCards: RuleFlipCard[] = [
  {
    cardId: 'ruleflip-001',
    creatorHandle: '@flipstate',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Tap the circles. When the rule flips, tap the triangles instead.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Switch on cue',
      body: 'Before the flip the target is the circle ●; after it, the triangle ▲. Letting go of the first rule quickly is the whole skill here.',
    },
    config: {
      timeLimitMs: 16000,
      stimulusDurationMs: 1500,
      interStimulusGapMs: 400,
      initialRuleLabel: 'Tap circles ●',
      flippedRuleLabel: 'Tap triangles ▲',
      flipAtStimulusIndex: 3,
      stimuli: [
        { id: 's1', label: '●', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: '▲', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: '■', matchesInitialRule: false, matchesFlippedRule: false },
        { id: 's4', label: '●', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's5', label: '▲', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's6', label: '●', matchesInitialRule: true, matchesFlippedRule: false },
      ],
    },
  },
  {
    cardId: 'ruleflip-002',
    creatorHandle: '@lumalabs',
    templateType: 'rule_flip',
    category: 'processing_speed',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Tap even numbers. After the flip, tap odd numbers.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Parity, then its opposite',
      body: 'Even digits (2, 8, 6, 4) match the first rule; odd digits (5, 3, 7, 1) match after the flip. Speed comes from not second-guessing the new rule.',
    },
    config: {
      timeLimitMs: 18000,
      stimulusDurationMs: 1200,
      interStimulusGapMs: 350,
      initialRuleLabel: 'Tap even numbers',
      flippedRuleLabel: 'Tap odd numbers',
      flipAtStimulusIndex: 4,
      stimuli: [
        { id: 's1', label: '2', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: '5', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: '8', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's4', label: '3', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's5', label: '6', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's6', label: '7', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: '4', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: '1', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  },
  {
    cardId: 'ruleflip-003',
    creatorHandle: '@flipstate',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Tap the vowels. When the rule flips, tap the consonants.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Recategorize on the fly',
      body: 'Vowels A, E, O, U match first; consonants K, M, T, B match after the flip. The challenge is re-sorting the same letters by a new rule.',
    },
    config: {
      timeLimitMs: 19000,
      stimulusDurationMs: 1300,
      interStimulusGapMs: 350,
      initialRuleLabel: 'Tap vowels',
      flippedRuleLabel: 'Tap consonants',
      flipAtStimulusIndex: 4,
      stimuli: [
        { id: 's1', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: 'K', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: 'E', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's4', label: 'M', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's5', label: 'O', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's6', label: 'T', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: 'U', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: 'B', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  },
  {
    cardId: 'ruleflip-004',
    creatorHandle: '@patternpilot',
    templateType: 'rule_flip',
    category: 'processing_speed',
    difficulty: 'medium',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Tap arrows pointing up. After the flip, tap arrows pointing down.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'switch_cost'],
    },
    explanation: {
      title: 'Direction swap',
      body: 'Up arrows ↑ match the first rule; down arrows ↓ match after the flip. Left ← and right → arrows never match, so they stay untapped throughout.',
    },
    config: {
      timeLimitMs: 18000,
      stimulusDurationMs: 1200,
      interStimulusGapMs: 350,
      initialRuleLabel: 'Tap up arrows ↑',
      flippedRuleLabel: 'Tap down arrows ↓',
      flipAtStimulusIndex: 4,
      stimuli: [
        { id: 's1', label: '↑', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: '↓', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: '→', matchesInitialRule: false, matchesFlippedRule: false },
        { id: 's4', label: '↑', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's5', label: '←', matchesInitialRule: false, matchesFlippedRule: false },
        { id: 's6', label: '↓', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: '↑', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: '→', matchesInitialRule: false, matchesFlippedRule: false },
      ],
    },
  },
  {
    cardId: 'ruleflip-005',
    creatorHandle: '@flipstate',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'hard',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 24,
    prompt: 'Tap filled shapes. When the rule flips, tap outline shapes.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Filled vs. outline',
      body: 'Solid shapes ● ■ ▲ match first; their open counterparts ○ □ △ match after the flip. The pairs share a silhouette, so you sort by fill, not form — a tougher switch.',
    },
    shareText: 'Switched from filled to outline shapes without missing a beat.',
    config: {
      timeLimitMs: 22000,
      stimulusDurationMs: 1300,
      interStimulusGapMs: 350,
      initialRuleLabel: 'Tap filled shapes ●■▲',
      flippedRuleLabel: 'Tap outline shapes ○□△',
      flipAtStimulusIndex: 5,
      stimuli: [
        { id: 's1', label: '●', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: '○', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: '■', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's4', label: '△', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's5', label: '●', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's6', label: '□', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: '▲', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: '○', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  },
  {
    cardId: 'ruleflip-006',
    creatorHandle: '@lumalabs',
    templateType: 'rule_flip',
    category: 'processing_speed',
    difficulty: 'hard',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 24,
    prompt: 'Tap uppercase letters. After the flip, tap lowercase letters.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['reaction_time', 'accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Case under speed',
      body: 'Capitals A, C, E, G, I match first; small letters b, d, f, h, j match after the flip. Ten fast items make the late switch easy to fumble.',
    },
    config: {
      timeLimitMs: 23000,
      stimulusDurationMs: 1100,
      interStimulusGapMs: 300,
      initialRuleLabel: 'Tap uppercase letters',
      flippedRuleLabel: 'Tap lowercase letters',
      flipAtStimulusIndex: 5,
      stimuli: [
        { id: 's1', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: 'b', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: 'C', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's4', label: 'd', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's5', label: 'E', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's6', label: 'f', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: 'G', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: 'h', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's9', label: 'I', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's10', label: 'j', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  },
  {
    cardId: 'ruleflip-007',
    creatorHandle: '@patternpilot',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Tap numbers greater than 5. When the rule flips, tap numbers less than 5.',
    puzzleDna: {
      mechanic: 'rule-switching',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'switch_cost'],
    },
    explanation: {
      title: 'Threshold reversal',
      body: 'Numbers above five (7, 8, 6, 9) match first; numbers below five (3, 2, 4, 1) match after the flip. The comparison reverses while the digits keep coming.',
    },
    config: {
      timeLimitMs: 19000,
      stimulusDurationMs: 1300,
      interStimulusGapMs: 350,
      initialRuleLabel: 'Tap numbers > 5',
      flippedRuleLabel: 'Tap numbers < 5',
      flipAtStimulusIndex: 4,
      stimuli: [
        { id: 's1', label: '7', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's2', label: '3', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's3', label: '8', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's4', label: '2', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's5', label: '6', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's6', label: '4', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's7', label: '9', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's8', label: '1', matchesInitialRule: false, matchesFlippedRule: true },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// tiny_logic — a short stem with one correct answer.
// Categories allowed: logical_reasoning | pattern_recognition.
// ---------------------------------------------------------------------------

const tinyLogicCards: TinyLogicCard[] = [
  {
    cardId: 'tinylogic-001',
    creatorHandle: '@logicloom',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 16,
    prompt: 'Read the two facts, then choose what must be true.',
    puzzleDna: {
      mechanic: 'deductive-reasoning',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Direct deduction',
      body: 'All bloops are round, and Kibo is a bloop, so Kibo must be round. Nothing in the facts allows any other conclusion.',
    },
    config: {
      stem: 'All bloops are round. Kibo is a bloop. What must be true?',
      options: [
        { id: 'opt-round', label: 'Kibo is round' },
        { id: 'opt-square', label: 'Kibo is square' },
        { id: 'opt-notbloop', label: 'Kibo is not a bloop' },
        { id: 'opt-unknown', label: 'It cannot be known' },
      ],
      correctOptionId: 'opt-round',
      timeLimitMs: 14000,
    },
  },
  {
    cardId: 'tinylogic-002',
    creatorHandle: '@patternpilot',
    templateType: 'tiny_logic',
    category: 'pattern_recognition',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Find the next number in the sequence.',
    puzzleDna: {
      mechanic: 'sequence-extrapolation',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Count by twos',
      body: 'The sequence rises by 2 each step: 2, 4, 6, 8 — so the next term is 10.',
    },
    config: {
      stem: 'What comes next? 2, 4, 6, 8, ?',
      options: [
        { id: 'opt-9', label: '9' },
        { id: 'opt-10', label: '10' },
        { id: 'opt-11', label: '11' },
        { id: 'opt-12', label: '12' },
      ],
      correctOptionId: 'opt-10',
      timeLimitMs: 12000,
    },
  },
  {
    cardId: 'tinylogic-003',
    creatorHandle: '@patternpilot',
    templateType: 'tiny_logic',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Work out the rule, then pick the next number.',
    puzzleDna: {
      mechanic: 'sequence-extrapolation',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Add the last two',
      body: 'Each term is the sum of the two before it: 2+3 = 5, and 3+5 = 8. So the next term after 1, 1, 2, 3, 5 is 8.',
    },
    config: {
      stem: 'What comes next? 1, 1, 2, 3, 5, ?',
      options: [
        { id: 'opt-6', label: '6' },
        { id: 'opt-7', label: '7' },
        { id: 'opt-8', label: '8' },
        { id: 'opt-9', label: '9' },
      ],
      correctOptionId: 'opt-8',
      timeLimitMs: 16000,
    },
  },
  {
    cardId: 'tinylogic-004',
    creatorHandle: '@logicloom',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Apply the rule to the new fact and choose what follows.',
    puzzleDna: {
      mechanic: 'deductive-reasoning',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Working backward',
      body: 'If rain always makes the ground wet, then dry ground means it did not rain. Denying the result lets you deny the cause.',
    },
    config: {
      stem: 'If it rains, the ground gets wet. The ground is not wet. What follows?',
      options: [
        { id: 'opt-norain', label: 'It did not rain' },
        { id: 'opt-rained', label: 'It rained' },
        { id: 'opt-alwaysdry', label: 'The ground is always dry' },
        { id: 'opt-unknown', label: 'It cannot be known' },
      ],
      correctOptionId: 'opt-norain',
      timeLimitMs: 16000,
    },
  },
  {
    cardId: 'tinylogic-005',
    creatorHandle: '@logicloom',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'hard',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 22,
    prompt: 'Order the runners from the clues, then pick who finished last.',
    puzzleDna: {
      mechanic: 'deductive-reasoning',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Build the order',
      body: 'Ana is ahead of Bo, and Cy is behind Bo, so the finishing order is Ana, then Bo, then Cy. Cy finished last.',
    },
    shareText: 'Sorted the whole race order from two clues.',
    config: {
      stem: 'Ana finished ahead of Bo. Cy finished behind Bo. Who finished last?',
      options: [
        { id: 'opt-ana', label: 'Ana' },
        { id: 'opt-bo', label: 'Bo' },
        { id: 'opt-cy', label: 'Cy' },
        { id: 'opt-unknown', label: 'It cannot be known' },
      ],
      correctOptionId: 'opt-cy',
      timeLimitMs: 20000,
    },
  },
  {
    cardId: 'tinylogic-006',
    creatorHandle: '@patternpilot',
    templateType: 'tiny_logic',
    category: 'pattern_recognition',
    difficulty: 'hard',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 24,
    prompt: 'Find the growing gap, then pick the next number.',
    puzzleDna: {
      mechanic: 'sequence-extrapolation',
      inputMode: 'choice',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: {
      title: 'Gaps that grow',
      body: 'The differences increase by two each step: +4, +6, +8, +10. After 30, the next gap is +12, giving 42.',
    },
    config: {
      stem: 'What comes next? 2, 6, 12, 20, 30, ?',
      options: [
        { id: 'opt-36', label: '36' },
        { id: 'opt-40', label: '40' },
        { id: 'opt-42', label: '42' },
        { id: 'opt-44', label: '44' },
      ],
      correctOptionId: 'opt-42',
      timeLimitMs: 22000,
    },
  },
];

/**
 * The complete authored catalog. Order groups cards by template for
 * readability; session selection / shuffling is the engine's concern, not the
 * catalog's. Declared `readonly` so the authored source-of-truth cannot be
 * mutated at runtime.
 */
export const catalog: readonly LiquidCard[] = [
  ...spotItCards,
  ...whatChangedCards,
  ...ruleFlipCards,
  ...tinyLogicCards,
];

/**
 * O(1) cardId → card index over the authored {@link catalog}, built once. Both
 * the session controller and the feed resolve a cardId to its `LiquidCard`
 * through this single lookup, so neither re-derives the mapping (CLAUDE.md §4 —
 * the engine/feed stay template-agnostic; this is plain data, not engine logic).
 */
const catalogById: ReadonlyMap<string, LiquidCard> = new Map(
  catalog.map((card) => [card.cardId, card]),
);

/**
 * Resolve a `cardId` to its authored {@link LiquidCard}, or `undefined` when the
 * id is not in the catalog. The shared default for the controller's and feed's
 * injectable `getCardById` seam.
 */
export function getCardById(cardId: string): LiquidCard | undefined {
  return catalogById.get(cardId);
}
