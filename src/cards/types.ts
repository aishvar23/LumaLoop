/**
 * Card domain model (Technical Design §6, §11).
 *
 * This module defines the typed `LiquidCard` discriminated union and the
 * `templateCategoryMap`. Card content is data-driven: a card is a plain typed
 * object, so authoring new puzzles never touches engine code.
 *
 * ---------------------------------------------------------------------------
 * Adding a new template ("game") — minimal, localized changes (CLAUDE.md §6):
 *
 *   1. Add the template's `templateType` literal to the {@link TemplateType}
 *      union below.
 *   2. Add a discriminated config type that extends {@link LiquidCardBase} with
 *      that `templateType` literal + a typed `config`, then add it to the
 *      {@link LiquidCard} union.
 *   3. Add the template's entry to {@link templateCategoryMap}.
 *   4. Author cards in the catalog and drop in one renderer + one evaluator
 *      implementing the shared template contract (see `src/templates/contract`).
 *
 * No changes to the session engine, telemetry client, or receipt are required:
 * those layers stay template-agnostic and operate on `LiquidCardBase` plus the
 * shared `CardResolution` contract. If a new game cannot be added this way, the
 * abstraction is wrong — fix the abstraction, not the engine.
 * ---------------------------------------------------------------------------
 */

/**
 * Performance categories a card can exercise. These are modest,
 * performance-based labels — never trait, IQ, or clinical claims (Design §7).
 */
export type ChallengeCategory =
  | 'visual_attention'
  | 'working_memory'
  | 'logical_reasoning'
  | 'cognitive_flexibility'
  | 'pattern_recognition'
  | 'processing_speed';

/**
 * How much measurement weight a card carries. The prototype catalog permits
 * only `entertainment_only` and `mechanic_mapped`; both `telemetry_calibrated`
 * and `benchmark_probe` are disallowed in the prototype (Technical Design §11).
 * The higher tiers remain in the union so the schema scales into later phases.
 */
export type EvidenceTier =
  | 'entertainment_only'
  | 'mechanic_mapped'
  | 'telemetry_calibrated'
  | 'benchmark_probe';

/** The discriminant for the {@link LiquidCard} union — one per template. */
export type TemplateType =
  | 'spot_it'
  | 'what_changed'
  | 'rule_flip'
  | 'tiny_logic'
  | 'memory_sequence';

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Descriptive metadata about what a card measures and how it is played.
 * Drives telemetry (`measuredSignals`) and category mapping integrity.
 */
export type PuzzleDna = {
  mechanic: string;
  inputMode: 'tap' | 'drag' | 'choice' | 'sequence';
  measuredSignals: string[];
};

/**
 * Fields shared by every card regardless of template. The session engine,
 * telemetry, and receipt operate on this base + the template discriminant only.
 */
export type LiquidCardBase = {
  cardId: string;
  creatorHandle: string;
  templateType: TemplateType;
  category: ChallengeCategory;
  difficulty: Difficulty;
  evidenceTier: EvidenceTier;
  reviewStatus: 'unreviewed' | 'manual_reviewed';
  estimatedSeconds: number;
  prompt: string;
  puzzleDna: PuzzleDna;
  explanation: {
    title: string;
    body: string;
  };
  shareText?: string;
};

/** Find the anomaly in a grid of repeated elements (visual attention / speed). */
export type SpotItCard = LiquidCardBase & {
  templateType: 'spot_it';
  config: {
    rows: number;
    columns: number;
    baseElement: string;
    anomalyElement: string;
    anomalyRow: number;
    anomalyColumn: number;
    timeLimitMs: number;
  };
};

/** Recall a briefly-shown pattern and pick what changed (working memory). */
export type WhatChangedCard = LiquidCardBase & {
  templateType: 'what_changed';
  config: {
    previewMs: number;
    timeLimitMs: number;
    beforePattern: string[];
    afterPattern: string[];
    options: Array<{ id: string; label: string }>;
    correctOptionId: string;
  };
};

/** Apply a rule that flips mid-stream (cognitive flexibility / speed). */
export type RuleFlipCard = LiquidCardBase & {
  templateType: 'rule_flip';
  config: {
    timeLimitMs: number;
    stimulusDurationMs: number;
    interStimulusGapMs: number;
    initialRuleLabel: string;
    flippedRuleLabel: string;
    flipAtStimulusIndex: number;
    stimuli: Array<{
      id: string;
      label: string;
      matchesInitialRule: boolean;
      matchesFlippedRule: boolean;
    }>;
  };
};

/** Pick the correct answer to a short logic stem (logical reasoning). */
export type TinyLogicCard = LiquidCardBase & {
  templateType: 'tiny_logic';
  config: {
    stem: string;
    options: Array<{ id: string; label: string }>;
    correctOptionId: string;
    timeLimitMs: number;
  };
};

/**
 * A single tile coordinate within a {@link MemorySequenceCard} grid. `row` and
 * `column` are zero-based indices into the `rows × columns` grid.
 */
export type GridCoordinate = { row: number; column: number };

/**
 * Watch a sequence of tiles flash, then reproduce the order by tapping
 * (working memory).
 *
 * The renderer runs two phases it owns itself: a non-interactive WATCH phase
 * where the tiles in `sequence` flash one-by-one (`flashMs` lit, `gapMs`
 * between), then a REPRODUCE phase where the player taps the tiles back in the
 * same order. The shared `timeLimitMs` applies to the REPRODUCE phase only — the
 * watch period must not penalize the player, mirroring `what_changed`'s preview.
 */
export type MemorySequenceCard = LiquidCardBase & {
  templateType: 'memory_sequence';
  config: {
    /** Grid height (number of rows), positive. */
    rows: number;
    /** Grid width (number of columns), positive. */
    columns: number;
    /**
     * The ordered tiles that flash during WATCH — also the correct reproduction
     * order. Length 3–6; every coordinate must lie inside the `rows × columns`
     * grid (enforced by catalog validation).
     */
    sequence: ReadonlyArray<GridCoordinate>;
    /** How long each tile stays lit during the WATCH phase, in ms. */
    flashMs: number;
    /** Dark gap between consecutive flashes during the WATCH phase, in ms. */
    gapMs: number;
    /** Countdown for the REPRODUCE phase only (5–30s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * The discriminated union of every card. Narrow on `templateType` to access a
 * card's typed `config`. Adding a template means adding a member here (step 2).
 */
export type LiquidCard =
  | SpotItCard
  | WhatChangedCard
  | RuleFlipCard
  | TinyLogicCard
  | MemorySequenceCard;

/**
 * The categories each template is allowed to map to (Technical Design §11).
 * Catalog validation uses this to reject cards whose `category` is not valid
 * for their `templateType`. As a `Record<TemplateType, ...>`, the compiler
 * forces a new template (step 1) to add its entry here (step 3).
 *
 * Declared `Readonly<Record<...>>` over `readonly` arrays so this validation
 * source-of-truth cannot be mutated at runtime: neither the record's keys nor
 * any template's category list can be reassigned or pushed to. The `satisfies`
 * clause keeps the literal data checked against the contract while preserving
 * the precise readonly type.
 */
export const templateCategoryMap: Readonly<
  Record<TemplateType, readonly ChallengeCategory[]>
> = Object.freeze({
  spot_it: Object.freeze(['visual_attention', 'processing_speed'] as const),
  what_changed: Object.freeze(['working_memory', 'visual_attention'] as const),
  rule_flip: Object.freeze(['cognitive_flexibility', 'processing_speed'] as const),
  tiny_logic: Object.freeze(['logical_reasoning', 'pattern_recognition'] as const),
  memory_sequence: Object.freeze(['working_memory'] as const),
}) satisfies Readonly<Record<TemplateType, readonly ChallengeCategory[]>>;
