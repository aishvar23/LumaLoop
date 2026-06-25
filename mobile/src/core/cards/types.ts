// Ported from web `src/cards/types.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
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
  | 'circuit_flow'
  | 'word_unscramble'
  | 'quick_math'
  | 'color_word'
  | 'n_back'
  | 'odd_one_out'
  | 'schulte_order';

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
 * Unscramble a hidden word: the player sees its letters in a scrambled order and
 * picks the correctly-unscrambled word from a multiple-choice list (verbal
 * pattern matching → pattern_recognition).
 *
 * MCQ shape (mirrors tiny_logic): `options` are candidate words and exactly one
 * (`correctOptionId`) is the real unscrambling. `scrambled` is the shuffled
 * letters shown to the player and `answer` is the word those letters spell. The
 * pure {@link evaluateWordUnscramble} is the single source of truth: it confirms
 * a selection is correct ONLY when its option both (a) equals the configured
 * `correctOptionId` and (b) is a genuine letter-for-letter rearrangement of
 * `scrambled` — so a mis-authored answer key cannot pass validation/scoring.
 */
export type WordUnscrambleCard = LiquidCardBase & {
  templateType: 'word_unscramble';
  config: {
    /** The hidden word's letters in a scrambled display order (what the player sees). */
    scrambled: string;
    /** The real word `scrambled` spells — the answer key the evaluator verifies against. */
    answer: string;
    /**
     * Candidate words; exactly one (`correctOptionId`) is `answer`. Distractors
     * are plausible near-words / partial anagrams. Authored ids are stable,
     * unique-within-a-card slugs.
     */
    options: Array<{ id: string; label: string }>;
    /** The id of the option whose label equals `answer`. */
    correctOptionId: string;
    timeLimitMs: number;
  };
};

/** A single arithmetic operator supported by quick_math. */
export type QuickMathOperator = '+' | '-' | '*' | '/';

/**
 * A structured, left-to-right-with-precedence arithmetic expression for
 * quick_math. `operands[0]` is the first number; each later `operand[i]` is
 * combined with the running value via `operators[i-1]`. Standard precedence
 * applies (`*`/`/` before `+`/`-`), so the pure evaluator computes the canonical
 * value rather than the renderer trusting an authored number.
 */
export type QuickMathExpression = {
  /** The numeric operands, in order; length === operators.length + 1, length ≥ 2. */
  operands: ReadonlyArray<number>;
  /** The operators between consecutive operands; length === operands.length - 1. */
  operators: ReadonlyArray<QuickMathOperator>;
};

/**
 * Solve a quick arithmetic problem, answered via multiple choice (numeric
 * options) — a numerical-reasoning mechanic (logical_reasoning).
 *
 * The `expression` is stored STRUCTURALLY (operands + operators), so the pure
 * {@link evaluateQuickMath} computes the canonical value with standard operator
 * precedence and decides correctness — it never trusts an authored answer
 * number. Each option carries a numeric `value`; a selection is correct iff its
 * `value` equals the computed result (and matches `correctOptionId`). `display`
 * is the human-readable equation shown to the player (e.g. `7 × 8 − 4`).
 */
export type QuickMathCard = LiquidCardBase & {
  templateType: 'quick_math';
  config: {
    /** Human-readable equation shown to the player (display only; never parsed). */
    display: string;
    /** The structured expression the evaluator computes. */
    expression: QuickMathExpression;
    /**
     * Numeric answer choices; exactly one (`correctOptionId`) has the `value`
     * equal to the computed result. Distractors are strong near-misses
     * (off-by-one, wrong-precedence). Authored ids are unique-within-a-card slugs.
     */
    options: Array<{ id: string; label: string; value: number }>;
    /** The id of the option whose `value` equals the computed result. */
    correctOptionId: string;
    timeLimitMs: number;
  };
};

/**
 * One trial in a {@link ColorWordCard} stream. A color WORD (`word`, e.g.
 * "RED") is rendered in an `ink` color that is usually MISMATCHED. The player
 * must respond to the INK, not the word — picking the swatch whose `colorId`
 * equals `inkColorId`. `congruent` records whether the word and ink agree (the
 * easy trials) vs disagree (the interfering ones); the evaluator splits accuracy
 * by it. Authored trial ids are stable, unique-within-a-card slugs.
 */
export type ColorWordTrial = {
  /** Stable id for this trial (unique within the card). */
  id: string;
  /** The color word shown as TEXT, e.g. "RED" — what the player must IGNORE. */
  word: string;
  /**
   * The id (into the card's `colors`) of the INK the word is drawn in — the
   * correct response. This is the answer key for the trial.
   */
  inkColorId: string;
  /**
   * True iff the word names the same color as its ink (a congruent trial); false
   * for the interfering, mismatched trials. Pure metadata for accuracy splits —
   * the evaluator recomputes correctness from `inkColorId`, never from this.
   */
  congruent: boolean;
};

/**
 * A selectable color swatch. `id` is referenced by a trial's `inkColorId` and by
 * the player's pick; `label` is the accessible name (e.g. "Red"); `hex` is the
 * swatch fill the renderer paints. Color is never the sole signal — the swatch
 * label carries the meaning (Design §7 accessibility).
 */
export type ColorWordSwatch = {
  id: string;
  label: string;
  hex: string;
};

/**
 * Stroop-style interference: respond to the INK a color word is printed in, not
 * the word itself — a short timed SERIES of trials (cognitive_flexibility).
 *
 * The renderer streams `trials` one at a time. Each trial shows `word` painted in
 * the ink named by `trial.inkColorId`; the player taps the swatch (from `colors`)
 * matching that INK. The pure {@link evaluateColorWord} is the single source of
 * truth: it knows the correct ink per trial and scores accuracy, the
 * congruent/incongruent split, false taps (wrong swatch), and timing. The stream
 * playback gates on `isActive` so a pre-mounted off-screen card never elapses
 * before the user swipes to it; `config.timeLimitMs` bounds the measured stream.
 */
export type ColorWordCard = LiquidCardBase & {
  templateType: 'color_word';
  config: {
    /** The selectable color swatches (the response options). Length 2–6. */
    colors: ReadonlyArray<ColorWordSwatch>;
    /**
     * The ordered Stroop trials. Each names the ink to respond to. Length 4–12;
     * every `inkColorId` must be one of `colors` (enforced by validation).
     */
    trials: ReadonlyArray<ColorWordTrial>;
    /** How long each trial stays on screen, in ms (renderer-owned cadence). */
    trialDurationMs: number;
    /** Blank gap between consecutive trials, in ms. */
    interTrialGapMs: number;
    /** Countdown for the whole measured stream (5–30s; see validation). */
    timeLimitMs: number;
  };
};

/** The kind of item streamed by an {@link NBackCard}. */
export type NBackItemKind = 'letter' | 'shape' | 'position';

/**
 * Present a timed STREAM of items; flag each one that matches the item N steps
 * back — a working-memory mechanic (working_memory).
 *
 * The renderer streams `stream` (display tokens) one at a time at the configured
 * cadence; the player taps MATCH on any item equal to the one `n` positions
 * earlier. The config is FULLY SPECIFYING and self-consistent: `matchIndices`
 * lists exactly the positions `i` where `stream[i] === stream[i - n]` (the answer
 * key), so the pure {@link evaluateNBack} is deterministic. The evaluator is the
 * single source of truth — from the stream + `n` it derives the true match set
 * and scores the player's flags into hits / misses / false-alarms, validation
 * proves `matchIndices` equals the derived set. Playback gates on `isActive`;
 * `config.timeLimitMs` bounds the measured stream.
 */
export type NBackCard = LiquidCardBase & {
  templateType: 'n_back';
  config: {
    /** What the stream items represent (drives the renderer's presentation). */
    itemKind: NBackItemKind;
    /**
     * The ordered stream of display tokens (letters, shape glyphs, or position
     * labels). Length 5–16. Two items "match" iff their tokens are equal.
     */
    stream: ReadonlyArray<string>;
    /** How many steps back a match is measured against (1 or 2). */
    n: number;
    /**
     * The answer key: the sorted, ascending positions `i` (i >= n) where
     * `stream[i] === stream[i - n]`. Validation proves it equals the set the
     * evaluator derives from `stream` + `n`, so a mis-authored key is rejected.
     */
    matchIndices: ReadonlyArray<number>;
    /** How long each item stays on screen, in ms (renderer-owned cadence). */
    itemDurationMs: number;
    /** Blank gap between consecutive items, in ms. */
    interItemGapMs: number;
    /** Countdown for the whole measured stream (5–30s; see validation). */
    timeLimitMs: number;
  };
};

/**
 * One selectable item in an {@link OddOneOutCard}. `id` is referenced by the
 * answer key and the player's pick; `label` is the readable item (a word, short
 * concept, or simple glyph) — meaning is carried by the LABEL, never colour or
 * position alone (Design §7 accessibility). Authored ids are stable,
 * unique-within-a-card slugs.
 */
export type OddOneOutItem = {
  id: string;
  label: string;
};

/**
 * Pick the ONE item that doesn't share a hidden rule the others all follow — a
 * CONCEPTUAL odd-one-out mechanic (pattern_recognition / logical_reasoning).
 *
 * Distinct from `spot_it` (a PERCEPTUAL odd-glyph scan): here every distractor
 * genuinely belongs to a shared category/parity/shape/property, so the odd item
 * is found by REASONING about the rule, not by eyeballing a different glyph. The
 * `explanation.body` states the shared rule. A small set of `items` is shown; the
 * player taps the single one whose id equals `oddItemId`. The pure
 * {@link evaluateOddOneOut} is the single source of truth: a pick is correct iff
 * its id equals `oddItemId` (the renderer never re-derives the check inline). The
 * first committed pick resolves the card (one-move conceptual choice, like
 * tiny_logic), and a wrong pick is the recorded distractor.
 */
export type OddOneOutCard = LiquidCardBase & {
  templateType: 'odd_one_out';
  config: {
    /**
     * The candidate items; exactly one (`oddItemId`) breaks the shared rule and
     * the rest follow it. Length 3–6 (enforced by catalog validation), unique ids.
     */
    items: ReadonlyArray<OddOneOutItem>;
    /** The id of the single item that does NOT belong — the answer key. */
    oddItemId: string;
    timeLimitMs: number;
  };
};

/**
 * One target in a {@link SchulteOrderCard} grid. `id` is stable; `label` is the
 * readable value shown on the cell (a number, or a number/letter for the harder
 * interleaved variants) — the sequence is carried by the LABEL/value, never by
 * colour or position alone (Design §7). `row`/`column` are zero-based positions
 * into the `rows × columns` grid, scattered so the player must visually scan.
 */
export type SchulteTarget = GridCoordinate & {
  id: string;
  label: string;
};

/**
 * Tap a grid of scattered items in the correct ascending/interleaved ORDER as
 * fast as possible — a visual-scan / processing-speed mechanic (processing_speed
 * / visual_attention).
 *
 * The grid shows every `target` at its scattered `row`/`column`. The correct
 * order is the ARRAY ORDER of `targets` (so an interleaved order like 1, A, 2, B
 * is authored simply by ordering the array that way). The renderer is MULTI-TAP
 * and timed (mirroring `memory_sequence`/`spot_it`): it tracks the expected next
 * target and only ADVANCES on a correct in-order tap; a wrong/out-of-order tap is
 * COUNTED as an error but is NON-FATAL (the player keeps hunting for the same
 * next target — like spot_it's false-tap-and-keep-going, so "time to complete"
 * stays meaningful). The card resolves CORRECT once every target has been tapped
 * in order within the time limit, and TIMEOUT on the clock (carrying how far the
 * player got). The pure {@link evaluateSchulteOrder} is the single source of
 * truth for whether a collected tap order completes the sequence and for the
 * error tally — the renderer never re-derives ordering inline.
 */
export type SchulteOrderCard = LiquidCardBase & {
  templateType: 'schulte_order';
  config: {
    /** Grid height (number of rows), positive. */
    rows: number;
    /** Grid width (number of columns), positive. */
    columns: number;
    /**
     * The targets to tap, IN THE CORRECT ORDER. Length 4–16 (enforced by catalog
     * validation); every coordinate must lie inside the grid and be unique, and
     * ids/labels must be unique within the card.
     */
    targets: ReadonlyArray<SchulteTarget>;
    /** Countdown for the whole solve (5–30s; see validation). */
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
  | CircuitFlowCard
  | WordUnscrambleCard
  | QuickMathCard
  | ColorWordCard
  | NBackCard
  | OddOneOutCard
  | SchulteOrderCard;

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
  // word_unscramble is verbal pattern matching: the player recognises which
  // word a scrambled letter-set forms. That is squarely pattern_recognition (no
  // new ChallengeCategory is warranted — Design §7 keeps "verbal reasoning"
  // framing out of user-facing copy).
  word_unscramble: Object.freeze(['pattern_recognition'] as const),
  // quick_math is numerical reasoning: evaluate/complete an arithmetic
  // expression. That maps to logical_reasoning (the same category as the other
  // deductive mechanics) — no new ChallengeCategory is warranted.
  quick_math: Object.freeze(['logical_reasoning'] as const),
  // color_word is Stroop interference: suppress the (automatic) word-reading
  // response and respond to the ink instead — squarely cognitive_flexibility
  // (the same category as rule_flip), with processing_speed for the timed
  // stream. No new ChallengeCategory is warranted.
  color_word: Object.freeze([
    'cognitive_flexibility',
    'processing_speed',
  ] as const),
  // n_back holds the last N items in mind and compares each new item against
  // them — the canonical working_memory task (the same category as
  // memory_sequence). No new ChallengeCategory is warranted.
  n_back: Object.freeze(['working_memory'] as const),
  // odd_one_out is CONCEPTUAL: the player infers the shared rule the set follows
  // and picks the one item that breaks it — squarely pattern_recognition (with
  // logical_reasoning for the rules that are deductive rather than categorical).
  // No new ChallengeCategory is warranted.
  odd_one_out: Object.freeze([
    'pattern_recognition',
    'logical_reasoning',
  ] as const),
  // schulte_order is a timed visual scan: find each next value scattered on the
  // grid and tap them in order, as fast as possible — squarely processing_speed
  // (the same category as spot_it), with visual_attention for the scan. No new
  // ChallengeCategory is warranted.
  schulte_order: Object.freeze([
    'processing_speed',
    'visual_attention',
  ] as const),
}) satisfies Readonly<Record<TemplateType, readonly ChallengeCategory[]>>;
