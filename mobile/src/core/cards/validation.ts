// Ported from web `src/cards/validation.ts`; source of truth is the web app —
// keep in sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Startup card-catalog validation (Technical Design §11).
 *
 * The local catalog is authored data, so it must be checked once at startup
 * before any session runs. This module enforces the §11 rules and returns a
 * structured report; it never throws on import and never mutates input.
 *
 * ---------------------------------------------------------------------------
 * Extensibility (CLAUDE.md §6):
 *
 * Per-template "correct answer" checks live in {@link templateAnswerValidators},
 * a `Record<TemplateType, ...>` keyed by `templateType`. Adding a new template
 * means adding one entry here — the compiler forces it because the map is a
 * total `Record` over `TemplateType`. The shared rules (unique id, category,
 * prompt, time limit, explanation, evidence tier) are template-agnostic and
 * stay untouched when a template is added.
 * ---------------------------------------------------------------------------
 */

import {
  templateCategoryMap,
  type CodeBreakCard,
  type CircuitFlowCard,
  type EvidenceTier,
  type LiquidCard,
  type MemorySequenceCard,
  type PatternChainCard,
  type PrismMirrorOrientation,
  type PrismPathCard,
  type RuleFlipCard,
  type SignalSetCard,
  type SpotItCard,
  type StepLogicCard,
  type TemplateType,
  type TinyLogicCard,
  type WhatChangedCard,
} from './types';
import {
  orientationMapFromSolution,
  tracePrismPath,
} from '../templates/prismPath/prismPathEvaluator';
import {
  circuitRotationsFromSolution,
  evaluateCircuitFlow,
} from '../templates/circuitFlow/circuitFlowEvaluator';
import { isValidSignalTrio } from '../templates/signalSet/signalSetEvaluator';

/** Inclusive lower bound for any template's `config.timeLimitMs` (5 seconds). */
export const MIN_TIME_LIMIT_MS = 5000;
/** Inclusive upper bound for any template's `config.timeLimitMs` (120 seconds). */
export const MAX_TIME_LIMIT_MS = 120000;
/**
 * Maximum Spot It columns that preserve the 48 px tap target in the mobile
 * feed card. More visual-search items should be added as rows, not by making
 * the board wider than the viewport.
 */
export const MAX_SPOT_IT_COLUMNS = 6;

/**
 * Evidence tiers permitted in the prototype catalog. `telemetry_calibrated` and
 * `benchmark_probe` exist in the schema for later phases but are rejected here
 * (Technical Design §11).
 */
export const ALLOWED_EVIDENCE_TIERS: readonly EvidenceTier[] = [
  'entertainment_only',
  'mechanic_mapped',
];

/** Stable machine-readable identifiers for each validation rule. */
export const ValidationRule = {
  UNIQUE_CARD_ID: 'unique_card_id',
  SUPPORTED_TEMPLATE_TYPE: 'supported_template_type',
  VALID_CATEGORY_FOR_TEMPLATE: 'valid_category_for_template',
  NON_EMPTY_PROMPT: 'non_empty_prompt',
  TIME_LIMIT_RANGE: 'time_limit_range',
  CORRECT_ANSWER_PRESENT: 'correct_answer_present',
  EXPLANATION_PRESENT: 'explanation_present',
  EVIDENCE_TIER: 'evidence_tier',
} as const;

export type ValidationRuleId =
  (typeof ValidationRule)[keyof typeof ValidationRule];

/** A single rule failure for one card (or catalog-wide if `cardId` is absent). */
export type ValidationError = {
  cardId?: string;
  rule: ValidationRuleId;
  message: string;
};

/** Aggregated result of validating a whole catalog. */
export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/** The concrete card type for a given template discriminant. */
type CardOfTemplate<K extends TemplateType> = Extract<
  LiquidCard,
  { templateType: K }
>;

/**
 * Validates that a card's template-specific correct answer is present and
 * internally consistent. One entry per template; the renderer/evaluator pair is
 * authored separately but relies on these invariants holding.
 *
 * Typed as a mapped type over `TemplateType`, so each entry receives exactly its
 * template's card (no per-entry cast) and the compiler forces a new template to
 * add its validator here (the map would otherwise be incomplete). Dispatch by
 * key goes through {@link validateTemplateAnswer}, which localizes the single
 * cast the TypeScript "correlated union" limitation still requires.
 */
const templateAnswerValidators: {
  [K in TemplateType]: (card: CardOfTemplate<K>) => ValidationError[];
} = {
  spot_it: validateSpotItAnswer,
  what_changed: validateWhatChangedAnswer,
  rule_flip: validateRuleFlipAnswer,
  tiny_logic: validateTinyLogicAnswer,
  memory_sequence: validateMemorySequenceAnswer,
  pattern_chain: validatePatternChainAnswer,
  step_logic: validateStepLogicAnswer,
  code_break: validateCodeBreakAnswer,
  prism_path: validatePrismPathAnswer,
  signal_set: validateSignalSetAnswer,
  circuit_flow: validateCircuitFlowAnswer,
};

/**
 * Dispatches a card to its template's answer validator. TypeScript cannot track
 * the correlation between `card.templateType` and `card.config` across an indexed
 * lookup (the "correlated union" limitation), so one cast is unavoidable here. It
 * is guaranteed sound only because we index with the card's own discriminant, so
 * the looked-up validator is exactly the one written for this card's type.
 */
function validateTemplateAnswer(card: LiquidCard): ValidationError[] {
  const validate = templateAnswerValidators[card.templateType] as (
    card: LiquidCard,
  ) => ValidationError[];
  return validate(card);
}

/** The set of template types backed by a validator — the "supported" set. */
const SUPPORTED_TEMPLATE_TYPES = new Set<string>(
  Object.keys(templateAnswerValidators),
);

function answerError(cardId: string, message: string): ValidationError {
  return { cardId, rule: ValidationRule.CORRECT_ANSWER_PRESENT, message };
}

function validateSpotItAnswer(card: SpotItCard): ValidationError[] {
  const { rows, columns, anomalyRow, anomalyColumn } = card.config;
  const errors: ValidationError[] = [];
  if (rows <= 0 || columns <= 0) {
    errors.push(
      answerError(
        card.cardId,
        `spot_it grid must have positive dimensions, got ${rows}x${columns}`,
      ),
    );
  }
  if (columns > MAX_SPOT_IT_COLUMNS) {
    errors.push(
      answerError(
        card.cardId,
        `spot_it columns ${columns} exceeds the mobile-safe maximum ${MAX_SPOT_IT_COLUMNS}`,
      ),
    );
  }
  if (!Number.isInteger(anomalyRow) || anomalyRow < 0 || anomalyRow >= rows) {
    errors.push(
      answerError(
        card.cardId,
        `spot_it anomalyRow ${anomalyRow} is outside grid bounds [0, ${rows - 1}]`,
      ),
    );
  }
  if (
    !Number.isInteger(anomalyColumn) ||
    anomalyColumn < 0 ||
    anomalyColumn >= columns
  ) {
    errors.push(
      answerError(
        card.cardId,
        `spot_it anomalyColumn ${anomalyColumn} is outside grid bounds [0, ${columns - 1}]`,
      ),
    );
  }
  return errors;
}

function validateWhatChangedAnswer(card: WhatChangedCard): ValidationError[] {
  const { options, correctOptionId } = card.config;
  if (options.length === 0) {
    return [answerError(card.cardId, 'what_changed has no options')];
  }
  if (!options.some((option) => option.id === correctOptionId)) {
    return [
      answerError(
        card.cardId,
        `what_changed correctOptionId "${correctOptionId}" is not among options`,
      ),
    ];
  }
  return [];
}

function validateRuleFlipAnswer(card: RuleFlipCard): ValidationError[] {
  const { stimuli, flipAtStimulusIndex } = card.config;
  if (stimuli.length === 0) {
    return [answerError(card.cardId, 'rule_flip has no stimuli')];
  }
  if (
    !Number.isInteger(flipAtStimulusIndex) ||
    flipAtStimulusIndex < 0 ||
    flipAtStimulusIndex >= stimuli.length
  ) {
    return [
      answerError(
        card.cardId,
        `rule_flip flipAtStimulusIndex ${flipAtStimulusIndex} is outside stimuli bounds [0, ${stimuli.length - 1}]`,
      ),
    ];
  }
  return [];
}

function validateTinyLogicAnswer(card: TinyLogicCard): ValidationError[] {
  const { options, correctOptionId } = card.config;
  if (options.length === 0) {
    return [answerError(card.cardId, 'tiny_logic has no options')];
  }
  if (!options.some((option) => option.id === correctOptionId)) {
    return [
      answerError(
        card.cardId,
        `tiny_logic correctOptionId "${correctOptionId}" is not among options`,
      ),
    ];
  }
  return [];
}

/** Inclusive bounds for a memory_sequence's reproduction length (Tech #137).
 * Upper bound raised 6 -> 8 to allow genuinely hard cards (difficulty ramp). */
export const MIN_SEQUENCE_LENGTH = 3;
export const MAX_SEQUENCE_LENGTH = 8;

function validateMemorySequenceAnswer(
  card: MemorySequenceCard,
): ValidationError[] {
  const { rows, columns, sequence } = card.config;
  const errors: ValidationError[] = [];

  if (rows <= 0 || columns <= 0) {
    errors.push(
      answerError(
        card.cardId,
        `memory_sequence grid must have positive dimensions, got ${rows}x${columns}`,
      ),
    );
  }

  if (sequence.length === 0) {
    errors.push(answerError(card.cardId, 'memory_sequence has an empty sequence'));
    return errors;
  }

  if (
    sequence.length < MIN_SEQUENCE_LENGTH ||
    sequence.length > MAX_SEQUENCE_LENGTH
  ) {
    errors.push(
      answerError(
        card.cardId,
        `memory_sequence length ${sequence.length} is outside [${MIN_SEQUENCE_LENGTH}, ${MAX_SEQUENCE_LENGTH}]`,
      ),
    );
  }

  // Every flashed/reproduced coordinate must lie inside the grid.
  sequence.forEach((coord, index) => {
    if (
      !Number.isInteger(coord.row) ||
      coord.row < 0 ||
      coord.row >= rows ||
      !Number.isInteger(coord.column) ||
      coord.column < 0 ||
      coord.column >= columns
    ) {
      errors.push(
        answerError(
          card.cardId,
          `memory_sequence step ${index} (${coord.row}, ${coord.column}) is outside grid bounds [0, ${rows - 1}] x [0, ${columns - 1}]`,
        ),
      );
    }
  });

  return errors;
}

/** Inclusive bounds for a pattern_chain's number of steps (Tech #138).
 * Upper bound raised 3 -> 5 to allow genuinely hard cards (difficulty ramp). */
export const MIN_CHAIN_STEPS = 2;
export const MAX_CHAIN_STEPS = 5;

function validatePatternChainAnswer(
  card: PatternChainCard,
): ValidationError[] {
  const { sequence, steps } = card.config;
  const errors: ValidationError[] = [];

  if (sequence.length === 0) {
    errors.push(
      answerError(card.cardId, 'pattern_chain has an empty visible sequence'),
    );
  }

  if (steps.length < MIN_CHAIN_STEPS || steps.length > MAX_CHAIN_STEPS) {
    errors.push(
      answerError(
        card.cardId,
        `pattern_chain step count ${steps.length} is outside [${MIN_CHAIN_STEPS}, ${MAX_CHAIN_STEPS}]`,
      ),
    );
  }

  // Every step must offer options and name a correct option that is among them.
  steps.forEach((step, index) => {
    if (step.options.length === 0) {
      errors.push(
        answerError(card.cardId, `pattern_chain step ${index} has no options`),
      );
      return;
    }
    if (!step.options.some((option) => option.id === step.correctOptionId)) {
      errors.push(
        answerError(
          card.cardId,
          `pattern_chain step ${index} correctOptionId "${step.correctOptionId}" is not among its options`,
        ),
      );
    }
    // Option ids must be unique within a step so a pick maps to one option.
    const ids = step.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      errors.push(
        answerError(
          card.cardId,
          `pattern_chain step ${index} has duplicate option ids`,
        ),
      );
    }
  });

  return errors;
}

/** Inclusive bounds for a step_logic's number of linked sub-questions (Tech #139).
 * Upper bound raised 3 -> 5 to allow genuinely hard cards (difficulty ramp). */
export const MIN_STEP_LOGIC_STEPS = 2;
export const MAX_STEP_LOGIC_STEPS = 5;

function validateStepLogicAnswer(card: StepLogicCard): ValidationError[] {
  const { premise, steps } = card.config;
  const errors: ValidationError[] = [];

  if (typeof premise !== 'string' || premise.trim().length === 0) {
    errors.push(answerError(card.cardId, 'step_logic has an empty premise'));
  }

  if (
    steps.length < MIN_STEP_LOGIC_STEPS ||
    steps.length > MAX_STEP_LOGIC_STEPS
  ) {
    errors.push(
      answerError(
        card.cardId,
        `step_logic step count ${steps.length} is outside [${MIN_STEP_LOGIC_STEPS}, ${MAX_STEP_LOGIC_STEPS}]`,
      ),
    );
  }

  // Every step must carry a non-empty stem, offer options, and name a correct
  // option that is among them (with unique ids so a pick maps to one option).
  steps.forEach((step, index) => {
    if (typeof step.stem !== 'string' || step.stem.trim().length === 0) {
      errors.push(
        answerError(card.cardId, `step_logic step ${index} has an empty stem`),
      );
    }
    if (step.options.length === 0) {
      errors.push(
        answerError(card.cardId, `step_logic step ${index} has no options`),
      );
      return;
    }
    if (!step.options.some((option) => option.id === step.correctOptionId)) {
      errors.push(
        answerError(
          card.cardId,
          `step_logic step ${index} correctOptionId "${step.correctOptionId}" is not among its options`,
        ),
      );
    }
    const ids = step.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      errors.push(
        answerError(
          card.cardId,
          `step_logic step ${index} has duplicate option ids`,
        ),
      );
    }
  });

  return errors;
}

/** Inclusive bounds for a code_break's code length, in slots (Tech #143). */
export const MIN_CODE_LENGTH = 3;
export const MAX_CODE_LENGTH = 6;
/** Inclusive lower bound for a code_break's palette size (Tech #143). */
export const MIN_CODE_PALETTE = 2;
/** Inclusive bounds for a code_break's allowed number of guesses (Tech #143). */
export const MIN_CODE_GUESSES = 4;
export const MAX_CODE_GUESSES = 12;

function validateCodeBreakAnswer(card: CodeBreakCard): ValidationError[] {
  const { palette, codeLength, secret, maxGuesses } = card.config;
  const errors: ValidationError[] = [];

  // Palette: a non-trivial set of UNIQUE symbols (duplicates would make the
  // symbol set ambiguous and waste a slot).
  if (!Array.isArray(palette) || palette.length < MIN_CODE_PALETTE) {
    errors.push(
      answerError(
        card.cardId,
        `code_break palette must have at least ${MIN_CODE_PALETTE} symbols, got ${palette?.length ?? 0}`,
      ),
    );
  } else if (new Set(palette).size !== palette.length) {
    errors.push(
      answerError(card.cardId, 'code_break palette has duplicate symbols'),
    );
  }

  // Code length within sensible bounds.
  if (
    !Number.isInteger(codeLength) ||
    codeLength < MIN_CODE_LENGTH ||
    codeLength > MAX_CODE_LENGTH
  ) {
    errors.push(
      answerError(
        card.cardId,
        `code_break codeLength ${codeLength} is outside [${MIN_CODE_LENGTH}, ${MAX_CODE_LENGTH}]`,
      ),
    );
  }

  // Allowed-guesses count within sensible bounds.
  if (
    !Number.isInteger(maxGuesses) ||
    maxGuesses < MIN_CODE_GUESSES ||
    maxGuesses > MAX_CODE_GUESSES
  ) {
    errors.push(
      answerError(
        card.cardId,
        `code_break maxGuesses ${maxGuesses} is outside [${MIN_CODE_GUESSES}, ${MAX_CODE_GUESSES}]`,
      ),
    );
  }

  // The secret (answer key) must be present, match the configured length, and
  // draw every symbol from the palette.
  if (!Array.isArray(secret) || secret.length === 0) {
    errors.push(answerError(card.cardId, 'code_break has an empty secret'));
    return errors;
  }
  if (secret.length !== codeLength) {
    errors.push(
      answerError(
        card.cardId,
        `code_break secret length ${secret.length} does not match codeLength ${codeLength}`,
      ),
    );
  }
  const paletteSet = new Set(palette);
  secret.forEach((symbol, index) => {
    if (!paletteSet.has(symbol)) {
      errors.push(
        answerError(
          card.cardId,
          `code_break secret symbol "${symbol}" at slot ${index} is not in the palette`,
        ),
      );
    }
  });

  return errors;
}

/** Inclusive grid bounds for prism_path (small enough for feed-native play). */
export const MIN_PRISM_GRID_SIZE = 3;
export const MAX_PRISM_GRID_SIZE = 7;
/** Bounds for authored prism_path mirrors. */
export const MIN_PRISM_MIRRORS = 1;
export const MAX_PRISM_MIRRORS = 8;

function isOrientation(value: unknown): value is PrismMirrorOrientation {
  return value === 'slash' || value === 'backslash';
}

function coordKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function validatePrismPathAnswer(card: PrismPathCard): ValidationError[] {
  const {
    rows,
    columns,
    entry,
    target,
    mirrors,
    blockers,
    solution,
  } = card.config;
  const errors: ValidationError[] = [];

  const dimensionsValid =
    Number.isInteger(rows) &&
    Number.isInteger(columns) &&
    rows >= MIN_PRISM_GRID_SIZE &&
    rows <= MAX_PRISM_GRID_SIZE &&
    columns >= MIN_PRISM_GRID_SIZE &&
    columns <= MAX_PRISM_GRID_SIZE;
  if (!dimensionsValid) {
    errors.push(
      answerError(
        card.cardId,
        `prism_path grid ${rows}x${columns} is outside [${MIN_PRISM_GRID_SIZE}, ${MAX_PRISM_GRID_SIZE}]`,
      ),
    );
  }

  const inBounds = (row: number, column: number) =>
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < rows &&
    column >= 0 &&
    column < columns;

  if (!inBounds(entry.row, entry.column)) {
    errors.push(
      answerError(
        card.cardId,
        `prism_path entry (${entry.row}, ${entry.column}) is outside grid bounds`,
      ),
    );
  }
  if (!inBounds(target.row, target.column)) {
    errors.push(
      answerError(
        card.cardId,
        `prism_path target (${target.row}, ${target.column}) is outside grid bounds`,
      ),
    );
  }
  if (
    entry.row === target.row &&
    entry.column === target.column
  ) {
    errors.push(
      answerError(card.cardId, 'prism_path entry and target must differ'),
    );
  }

  if (
    mirrors.length < MIN_PRISM_MIRRORS ||
    mirrors.length > MAX_PRISM_MIRRORS
  ) {
    errors.push(
      answerError(
        card.cardId,
        `prism_path mirror count ${mirrors.length} is outside [${MIN_PRISM_MIRRORS}, ${MAX_PRISM_MIRRORS}]`,
      ),
    );
  }

  const occupied = new Map<string, string>();
  occupied.set(coordKey(entry.row, entry.column), 'entry');
  occupied.set(coordKey(target.row, target.column), 'target');

  const mirrorIds = new Set<string>();
  for (const mirror of mirrors) {
    if (typeof mirror.id !== 'string' || mirror.id.trim().length === 0) {
      errors.push(answerError(card.cardId, 'prism_path mirror has an empty id'));
    } else if (mirrorIds.has(mirror.id)) {
      errors.push(
        answerError(card.cardId, `prism_path duplicate mirror id "${mirror.id}"`),
      );
    }
    mirrorIds.add(mirror.id);

    if (!isOrientation(mirror.initialOrientation)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path mirror "${mirror.id}" has invalid initial orientation`,
        ),
      );
    }
    if (!inBounds(mirror.row, mirror.column)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path mirror "${mirror.id}" (${mirror.row}, ${mirror.column}) is outside grid bounds`,
        ),
      );
    }
    const key = coordKey(mirror.row, mirror.column);
    const existing = occupied.get(key);
    if (existing) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path mirror "${mirror.id}" overlaps ${existing}`,
        ),
      );
    }
    occupied.set(key, `mirror "${mirror.id}"`);
  }

  blockers.forEach((blocker, index) => {
    if (!inBounds(blocker.row, blocker.column)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path blocker ${index} (${blocker.row}, ${blocker.column}) is outside grid bounds`,
        ),
      );
    }
    const key = coordKey(blocker.row, blocker.column);
    const existing = occupied.get(key);
    if (existing) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path blocker ${index} overlaps ${existing}`,
        ),
      );
    }
    occupied.set(key, `blocker ${index}`);
  });

  if (solution.length !== mirrors.length) {
    errors.push(
      answerError(
        card.cardId,
        `prism_path solution must set every mirror once, got ${solution.length} for ${mirrors.length} mirrors`,
      ),
    );
  }

  const solutionIds = new Set<string>();
  for (const item of solution) {
    if (!mirrorIds.has(item.mirrorId)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path solution references unknown mirror "${item.mirrorId}"`,
        ),
      );
    }
    if (solutionIds.has(item.mirrorId)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path solution repeats mirror "${item.mirrorId}"`,
        ),
      );
    }
    solutionIds.add(item.mirrorId);
    if (!isOrientation(item.orientation)) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path solution for "${item.mirrorId}" has invalid orientation`,
        ),
      );
    }
  }

  if (errors.length === 0) {
    const solvedTrace = tracePrismPath(
      card.config,
      orientationMapFromSolution(solution),
    );
    if (!solvedTrace.reachedTarget) {
      errors.push(
        answerError(
          card.cardId,
          `prism_path authored solution does not reach target (exit: ${solvedTrace.exitReason})`,
        ),
      );
    }
  }

  return errors;
}

export const MIN_SIGNAL_TILES = 6;
export const MAX_SIGNAL_TILES = 9;

function validateSignalSetAnswer(card: SignalSetCard): ValidationError[] {
  const { tiles, solutionIds } = card.config;
  const errors: ValidationError[] = [];
  if (tiles.length < MIN_SIGNAL_TILES || tiles.length > MAX_SIGNAL_TILES) {
    errors.push(
      answerError(
        card.cardId,
        `signal_set tile count ${tiles.length} is outside [${MIN_SIGNAL_TILES}, ${MAX_SIGNAL_TILES}]`,
      ),
    );
  }
  const ids = tiles.map((tile) => tile.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => id.trim().length === 0)
  ) {
    errors.push(
      answerError(
        card.cardId,
        'signal_set tile ids must be unique and non-empty',
      ),
    );
  }
  const signatures = tiles.map(
    (tile) => `${tile.shape}:${tile.fill}:${tile.count}`,
  );
  if (new Set(signatures).size !== signatures.length) {
    errors.push(
      answerError(
        card.cardId,
        'signal_set tiles must have unique attribute combinations',
      ),
    );
  }
  if (solutionIds.length !== 3 || new Set(solutionIds).size !== 3) {
    errors.push(
      answerError(
        card.cardId,
        'signal_set solution must contain three unique tile ids',
      ),
    );
    return errors;
  }
  const solutionTiles = solutionIds
    .map((id) => tiles.find((tile) => tile.id === id))
    .filter(
      (tile): tile is SignalSetCard['config']['tiles'][number] =>
        tile !== undefined,
    );
  if (solutionTiles.length !== 3) {
    errors.push(
      answerError(
        card.cardId,
        'signal_set solution references an unknown tile',
      ),
    );
  } else if (!isValidSignalTrio(solutionTiles)) {
    errors.push(
      answerError(
        card.cardId,
        'signal_set authored solution is not a valid trio',
      ),
    );
  }
  return errors;
}

export const MIN_CIRCUIT_GRID_SIZE = 2;
export const MAX_CIRCUIT_GRID_SIZE = 4;

function validateCircuitFlowAnswer(card: CircuitFlowCard): ValidationError[] {
  const { rows, columns, sourceTileId, tiles, solution } = card.config;
  const errors: ValidationError[] = [];
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < MIN_CIRCUIT_GRID_SIZE ||
    rows > MAX_CIRCUIT_GRID_SIZE ||
    columns < MIN_CIRCUIT_GRID_SIZE ||
    columns > MAX_CIRCUIT_GRID_SIZE
  ) {
    errors.push(
      answerError(
        card.cardId,
        `circuit_flow grid ${rows}x${columns} is outside [${MIN_CIRCUIT_GRID_SIZE}, ${MAX_CIRCUIT_GRID_SIZE}]`,
      ),
    );
  }
  if (tiles.length !== rows * columns) {
    errors.push(
      answerError(
        card.cardId,
        `circuit_flow must fill its grid (${rows * columns} tiles expected)`,
      ),
    );
  }
  const ids = tiles.map((tile) => tile.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => id.trim().length === 0)
  ) {
    errors.push(
      answerError(
        card.cardId,
        'circuit_flow tile ids must be unique and non-empty',
      ),
    );
  }
  if (!ids.includes(sourceTileId)) {
    errors.push(
      answerError(
        card.cardId,
        `circuit_flow source "${sourceTileId}" is missing`,
      ),
    );
  }
  const coordinates = new Set<string>();
  const validDirections = new Set(['up', 'right', 'down', 'left']);
  for (const tile of tiles) {
    const key = coordKey(tile.row, tile.column);
    if (
      !Number.isInteger(tile.row) ||
      !Number.isInteger(tile.column) ||
      tile.row < 0 ||
      tile.row >= rows ||
      tile.column < 0 ||
      tile.column >= columns
    ) {
      errors.push(
        answerError(
          card.cardId,
          `circuit_flow tile "${tile.id}" is outside grid bounds`,
        ),
      );
    }
    if (coordinates.has(key)) {
      errors.push(
        answerError(
          card.cardId,
          `circuit_flow has overlapping tiles at ${key}`,
        ),
      );
    }
    coordinates.add(key);
    if (
      tile.connections.length === 0 ||
      new Set(tile.connections).size !== tile.connections.length ||
      tile.connections.some((direction) => !validDirections.has(direction))
    ) {
      errors.push(
        answerError(
          card.cardId,
          `circuit_flow tile "${tile.id}" has invalid connections`,
        ),
      );
    }
    if (
      !Number.isInteger(tile.initialRotation) ||
      tile.initialRotation < 0 ||
      tile.initialRotation > 3
    ) {
      errors.push(
        answerError(
          card.cardId,
          `circuit_flow tile "${tile.id}" has invalid initial rotation`,
        ),
      );
    }
  }
  const solutionIds = solution.map((item) => item.tileId);
  if (
    solution.length !== tiles.length ||
    new Set(solutionIds).size !== solution.length ||
    solution.some(
      (item) =>
        !ids.includes(item.tileId) ||
        !Number.isInteger(item.rotation) ||
        item.rotation < 0 ||
        item.rotation > 3,
    )
  ) {
    errors.push(
      answerError(
        card.cardId,
        'circuit_flow solution must set every tile once with a valid rotation',
      ),
    );
  }
  if (errors.length === 0) {
    const result = evaluateCircuitFlow(
      card.config,
      circuitRotationsFromSolution(solution),
      0,
    );
    if (!result.isCorrect) {
      errors.push(
        answerError(
          card.cardId,
          'circuit_flow authored solution is not fully connected',
        ),
      );
    }
  }
  return errors;
}

/**
 * Validates a single card's template-agnostic rules plus its template-specific
 * correct answer. Catalog-wide rules (unique `cardId`) are checked separately by
 * {@link validateCatalog}.
 */
function validateCard(card: LiquidCard): ValidationError[] {
  const errors: ValidationError[] = [];
  const cardId = card.cardId;

  // Supported templateType. Input is typed `LiquidCard`, but the catalog is
  // authored data that can drift, so this is a real runtime guard. If the
  // template is unknown we cannot run template-specific checks, so return early.
  if (!SUPPORTED_TEMPLATE_TYPES.has(card.templateType)) {
    errors.push({
      cardId,
      rule: ValidationRule.SUPPORTED_TEMPLATE_TYPE,
      message: `unsupported templateType "${card.templateType}"`,
    });
    return errors;
  }

  // Valid category for the template.
  const allowedCategories = templateCategoryMap[card.templateType];
  if (!allowedCategories.includes(card.category)) {
    errors.push({
      cardId,
      rule: ValidationRule.VALID_CATEGORY_FOR_TEMPLATE,
      message: `category "${card.category}" is not valid for template "${card.templateType}" (allowed: ${allowedCategories.join(', ')})`,
    });
  }

  // Non-empty prompt. Authored data can drift, so a missing/non-string prompt
  // is treated as empty rather than allowed to throw on `.trim()`.
  if (typeof card.prompt !== 'string' || card.prompt.trim().length === 0) {
    errors.push({
      cardId,
      rule: ValidationRule.NON_EMPTY_PROMPT,
      message: 'prompt is empty',
    });
  }

  // Per-template time limit between 5s and 120s inclusive. The finiteness guard
  // leads so a NaN/Infinity timeLimitMs is rejected rather than slipping past
  // the range comparisons (both `< MIN` and `> MAX` are false for NaN).
  const timeLimitMs = card.config.timeLimitMs;
  if (
    !Number.isFinite(timeLimitMs) ||
    timeLimitMs < MIN_TIME_LIMIT_MS ||
    timeLimitMs > MAX_TIME_LIMIT_MS
  ) {
    errors.push({
      cardId,
      rule: ValidationRule.TIME_LIMIT_RANGE,
      message: `config.timeLimitMs ${timeLimitMs} is outside [${MIN_TIME_LIMIT_MS}, ${MAX_TIME_LIMIT_MS}] ms`,
    });
  }

  // Explanation present (title + body non-empty). Guard the nested fields for
  // drifted/untyped data so a missing explanation reports an error instead of
  // throwing a TypeError on `.trim()`.
  const explanation = card.explanation;
  if (
    explanation == null ||
    typeof explanation.title !== 'string' ||
    typeof explanation.body !== 'string' ||
    explanation.title.trim().length === 0 ||
    explanation.body.trim().length === 0
  ) {
    errors.push({
      cardId,
      rule: ValidationRule.EXPLANATION_PRESENT,
      message: 'explanation must have a non-empty title and body',
    });
  }

  // Evidence tier restricted to the prototype-allowed tiers.
  if (!ALLOWED_EVIDENCE_TIERS.includes(card.evidenceTier)) {
    errors.push({
      cardId,
      rule: ValidationRule.EVIDENCE_TIER,
      message: `evidenceTier "${card.evidenceTier}" is not allowed in the prototype (allowed: ${ALLOWED_EVIDENCE_TIERS.join(', ')})`,
    });
  }

  // Template-specific correct answer present and consistent.
  errors.push(...validateTemplateAnswer(card));

  return errors;
}

/**
 * Validates an entire catalog against the Technical Design §11 startup rules.
 * Collects every failure (it does not stop at the first) so the report is
 * actionable. Returns `{ valid, errors }`; never throws.
 */
export function validateCatalog(cards: readonly LiquidCard[]): ValidationResult {
  const errors: ValidationError[] = [];

  // Catalog-wide: unique cardId. Report each duplicate occurrence after the
  // first so the offending card is identifiable.
  const seenCardIds = new Set<string>();
  for (const card of cards) {
    if (seenCardIds.has(card.cardId)) {
      errors.push({
        cardId: card.cardId,
        rule: ValidationRule.UNIQUE_CARD_ID,
        message: `duplicate cardId "${card.cardId}"`,
      });
    } else {
      seenCardIds.add(card.cardId);
    }
  }

  // Per-card rules.
  for (const card of cards) {
    errors.push(...validateCard(card));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the catalog and throws an aggregated {@link Error} if it is invalid.
 * Intended for startup: the app calls this once so a malformed catalog fails
 * loudly and early rather than mid-session. Returns the catalog unchanged on
 * success to support `const cards = assertValidCatalog(catalog)` usage.
 */
export function assertValidCatalog<T extends readonly LiquidCard[]>(
  cards: T,
): T {
  const { valid, errors } = validateCatalog(cards);
  if (!valid) {
    const detail = errors
      .map((error) => {
        const subject = error.cardId ? `[${error.cardId}] ` : '';
        return `  - ${subject}${error.rule}: ${error.message}`;
      })
      .join('\n');
    throw new Error(
      `Invalid card catalog: ${errors.length} error(s)\n${detail}`,
    );
  }
  return cards;
}
