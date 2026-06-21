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
  type EvidenceTier,
  type LiquidCard,
  type MemorySequenceCard,
  type RuleFlipCard,
  type SpotItCard,
  type TemplateType,
  type TinyLogicCard,
  type WhatChangedCard,
} from './types';

/** Inclusive lower bound for any template's `config.timeLimitMs` (5 seconds). */
export const MIN_TIME_LIMIT_MS = 5000;
/** Inclusive upper bound for any template's `config.timeLimitMs` (30 seconds). */
export const MAX_TIME_LIMIT_MS = 30000;

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

/** Inclusive bounds for a memory_sequence's reproduction length (Tech #137). */
export const MIN_SEQUENCE_LENGTH = 3;
export const MAX_SEQUENCE_LENGTH = 6;

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

  // Per-template time limit between 5s and 30s inclusive. The finiteness guard
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
