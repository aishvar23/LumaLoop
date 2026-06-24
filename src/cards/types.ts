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
  | 'memory_sequence'
  | 'pattern_chain'
  | 'step_logic'
  | 'code_break'
  | 'prism_path'
  | 'signal_set'
  | 'circuit_flow';

export type Difficulty =
  | 'extremely_easy'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'extremely_hard';

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

/** Cardinal directions used by beam/path-style templates. */
export type GridDirection = 'up' | 'right' | 'down' | 'left';

/** Mirror orientations for prism_path. */
export type PrismMirrorOrientation = 'slash' | 'backslash';

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
     * order. Length 3–8; every coordinate must lie inside the `rows × columns`
     * grid (enforced by catalog validation).
     */
    sequence: ReadonlyArray<GridCoordinate>;
    /** How long each tile stays lit during the WATCH phase, in ms. */
    flashMs: number;
    /** Dark gap between consecutive flashes during the WATCH phase, in ms. */
    gapMs: number;
    /** Countdown for the REPRODUCE phase only (5–120s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * One step in a {@link PatternChainCard}: the choice of the NEXT item to extend
 * the visible `sequence`. `options` are the candidate next items the player
 * chooses among; exactly one (`correctOptionId`) genuinely continues the
 * pattern. Authored option ids are stable, unique-within-a-step slugs.
 */
export type PatternChainStep = {
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
};

/**
 * Continue a visible sequence by picking the next item, then the next — a
 * MULTI-STEP pattern-recognition mechanic (pattern_recognition).
 *
 * The renderer shows the `sequence` (display items the player can see), then
 * presents each step's `options` in order: on every pick it appends the chosen
 * item to the shown sequence and advances to the next step, until all `steps`
 * are answered. The shared `timeLimitMs` covers the whole solve (no preview
 * phase — interaction is enabled at card start, so the controller sets
 * `interactionEnabledAtMs === activeAtMs`). Correctness is an exact ordered
 * match of every step's pick against its `correctOptionId`, decided by the pure
 * `evaluatePatternChain` (the renderer routes its collected picks through it).
 */
export type PatternChainCard = LiquidCardBase & {
  templateType: 'pattern_chain';
  config: {
    /**
     * The visible sequence shown to the player as the pattern to continue —
     * display items (glyphs, numbers, letters). Catalog validation requires it
     * to be non-empty.
     */
    sequence: ReadonlyArray<string>;
    /**
     * The ordered "pick the next item" steps. Each step offers `options` and
     * names the `correctOptionId` that continues the pattern. Length 2–5
     * (enforced by catalog validation); `correctOptionId` must be one of that
     * step's `options`.
     */
    steps: ReadonlyArray<PatternChainStep>;
    /** Countdown for the whole solve (5–120s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * One linked sub-question in a {@link StepLogicCard}: a multiple-choice `stem`
 * with its `options` and the `correctOptionId` that answers it. Steps are ordered
 * and may build on one another — a later `stem` can refer to facts established by
 * the premise or an earlier step. Authored option ids are stable, unique-within-a-
 * step slugs.
 */
export type StepLogicStep = {
  /** The sub-question text shown for this step. */
  stem: string;
  /** The candidate answers for this step; exactly one is `correctOptionId`. */
  options: Array<{ id: string; label: string }>;
  /** The id of the option that correctly answers this step's `stem`. */
  correctOptionId: string;
};

/**
 * Answer a short chain of 2–5 LINKED multiple-choice sub-questions that build on
 * a shared `premise` — a MULTI-STEP logical-reasoning mechanic (logical_reasoning).
 *
 * The renderer shows the `premise` throughout, then presents each step's `stem`
 * and `options` in order: on every pick it reveals the next step, until all
 * `steps` are answered. The shared `timeLimitMs` covers the whole solve (no
 * preview phase — interaction is enabled at card start, so the controller sets
 * `interactionEnabledAtMs === activeAtMs`). Correctness is an exact ordered match
 * of every step's pick against its `correctOptionId`, decided by the pure
 * `evaluateStepLogic` (the renderer routes its collected picks through it). The
 * chain is NON-STRICT: a wrong sub-answer does not end the card early — the player
 * always completes every step (mirroring `pattern_chain`).
 */
export type StepLogicCard = LiquidCardBase & {
  templateType: 'step_logic';
  config: {
    /**
     * The shared premise shown above every sub-question for the whole solve.
     * Catalog validation requires it to be non-empty.
     */
    premise: string;
    /**
     * The ordered linked sub-questions. Each step offers `options` and names the
     * `correctOptionId` that answers its `stem`. Length 2–5 (enforced by catalog
     * validation); `correctOptionId` must be one of that step's `options`.
     */
    steps: ReadonlyArray<StepLogicStep>;
    /** Countdown for the whole solve (5–120s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * Crack a hidden code from per-guess peg feedback — a Mastermind / Bulls-and-Cows
 * style DEDUCTIVE code-breaking mechanic (logical_reasoning).
 *
 * The renderer shows an empty board: the player builds a guess of `codeLength`
 * symbols (each slot cycles/selects from the `palette`), submits it, and gets
 * per-guess peg feedback computed by the pure {@link evaluateCodeBreak}:
 *   - `exact`   — symbols that are the right symbol AND in the right slot;
 *   - `partial` — symbols that are in the code but in the wrong slot.
 * Duplicate symbols are counted WITHOUT double-counting (a guess symbol consumes
 * at most one secret symbol; see the evaluator). The player has `maxGuesses`
 * attempts and `config.timeLimitMs` to deduce the exact `secret`. The card
 * resolves CORRECT the moment a guess equals the secret (all-exact), INCORRECT
 * when the last guess is used without solving, and TIMEOUT on the clock.
 *
 * This is the single biggest step-change in challenge: multi-guess, deductive,
 * with a strong "one more try" loop. Correctness + the peg feedback are owned by
 * the pure evaluator (the single source of truth); the renderer never
 * re-implements peg logic.
 */
export type CodeBreakCard = LiquidCardBase & {
  templateType: 'code_break';
  config: {
    /**
     * The symbols the player can place in each slot — short display glyphs
     * (e.g. emoji or letters). Catalog validation requires length ≥ 2, unique
     * symbols, and that every `secret` symbol is one of these.
     */
    palette: ReadonlyArray<string>;
    /** Number of slots in the code (catalog validation bounds it 3–6). */
    codeLength: number;
    /**
     * The hidden code, length `codeLength`, every symbol drawn from `palette`.
     * This is the answer key — the renderer routes guesses through the pure
     * evaluator rather than ever comparing against this directly.
     */
    secret: ReadonlyArray<string>;
    /** How many guesses the player gets (catalog validation bounds it 4–12). */
    maxGuesses: number;
    /** Countdown for the whole solve (5–120s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * Rotate mirrors to route a light beam from an entry tile to a target tile — a
 * compact, visual planning puzzle (logical_reasoning / pattern_recognition /
 * working_memory).
 *
 * The renderer shows a grid with one beam entry, one target, optional blockers,
 * and tappable mirrors. Each mirror toggles between slash (`/`) and backslash
 * (`\`) orientation. The pure evaluator traces the beam through the current
 * mirror orientations and resolves correct only when the beam reaches the target.
 * This keeps the renderer visual and tactile while the answer logic stays in one
 * React-free source of truth.
 */
export type PrismPathMirror = GridCoordinate & {
  /** Stable id used by the renderer/evaluator to track a mirror's orientation. */
  id: string;
  /** The authored starting orientation shown when the card mounts. */
  initialOrientation: PrismMirrorOrientation;
};

export type PrismPathSolution = {
  /** The mirror id being set for the authored answer key. */
  mirrorId: string;
  /** The final orientation needed for the canonical solution. */
  orientation: PrismMirrorOrientation;
};

export type PrismPathCard = LiquidCardBase & {
  templateType: 'prism_path';
  config: {
    /** Grid height, positive and small enough for a feed card. */
    rows: number;
    /** Grid width, positive and small enough for a feed card. */
    columns: number;
    /** Beam entry tile inside the grid. */
    entry: GridCoordinate;
    /** Direction the beam travels as it enters the entry tile. */
    entryDirection: GridDirection;
    /** Target tile the beam must reach. */
    target: GridCoordinate;
    /** Tappable mirrors. They must have unique ids and in-bounds coordinates. */
    mirrors: ReadonlyArray<PrismPathMirror>;
    /** Static blocked cells that stop the beam. */
    blockers: ReadonlyArray<GridCoordinate>;
    /**
     * Canonical solved orientations. Validation proves this authored solution
     * reaches the target; the renderer accepts any orientation set that reaches
     * the target, so alternate valid paths are not unfairly rejected.
     */
    solution: ReadonlyArray<PrismPathSolution>;
    /** Countdown for the whole solve (5-120s; see validation). */
    timeLimitMs: number;
  };
};

/** Visual attributes used by the original signal_set triad puzzle. */
export type SignalShape = 'circle' | 'triangle' | 'diamond';
export type SignalFill = 'solid' | 'striped' | 'outline';
export type SignalCount = 1 | 2 | 3;

export type SignalTile = {
  id: string;
  shape: SignalShape;
  fill: SignalFill;
  count: SignalCount;
};

/**
 * Select three tiles whose shape, fill, and count are each either all identical
 * or all different. The canonical solution keeps catalog authoring testable,
 * while the evaluator accepts every mathematically valid trio on the board.
 */
export type SignalSetCard = LiquidCardBase & {
  templateType: 'signal_set';
  config: {
    tiles: ReadonlyArray<SignalTile>;
    solutionIds: readonly [string, string, string];
    timeLimitMs: number;
  };
};

export type CircuitRotation = 0 | 1 | 2 | 3;

export type CircuitTile = GridCoordinate & {
  id: string;
  /** Connections when the tile rotation is zero. */
  connections: ReadonlyArray<GridDirection>;
  initialRotation: CircuitRotation;
};

export type CircuitSolution = {
  tileId: string;
  rotation: CircuitRotation;
};

/**
 * Rotate every tile into one leak-free network connected to the source. The
 * renderer owns rotations; the pure evaluator owns graph connectivity.
 */
export type CircuitFlowCard = LiquidCardBase & {
  templateType: 'circuit_flow';
  config: {
    rows: number;
    columns: number;
    sourceTileId: string;
    tiles: ReadonlyArray<CircuitTile>;
    solution: ReadonlyArray<CircuitSolution>;
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
  | MemorySequenceCard
  | PatternChainCard
  | StepLogicCard
  | CodeBreakCard
  | PrismPathCard
  | SignalSetCard
  | CircuitFlowCard;

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
  rule_flip: Object.freeze([
    'cognitive_flexibility',
    'processing_speed',
  ] as const),
  tiny_logic: Object.freeze([
    'logical_reasoning',
    'pattern_recognition',
  ] as const),
  memory_sequence: Object.freeze(['working_memory'] as const),
  pattern_chain: Object.freeze(['pattern_recognition'] as const),
  step_logic: Object.freeze(['logical_reasoning'] as const),
  // code_break is deductive elimination: each peg-feedback row constrains the
  // hypothesis space and the player reasons to the unique code. That is squarely
  // logical_reasoning (the same category as tiny_logic/step_logic) — no new
  // ChallengeCategory is warranted.
  code_break: Object.freeze(['logical_reasoning'] as const),
  // prism_path is visual route planning: the user manipulates mirrors, traces
  // consequences, and checks whether the beam reaches the target.
  prism_path: Object.freeze([
    'logical_reasoning',
    'pattern_recognition',
    'working_memory',
  ] as const),
  signal_set: Object.freeze([
    'pattern_recognition',
    'logical_reasoning',
  ] as const),
  circuit_flow: Object.freeze([
    'logical_reasoning',
    'pattern_recognition',
  ] as const),
}) satisfies Readonly<Record<TemplateType, readonly ChallengeCategory[]>>;
