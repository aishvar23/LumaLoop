// Ported from web `src/templates/colorWord/colorWordEvaluator.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Color Word (Stroop) answer evaluator (Design §9; Technical Design §7).
 *
 * The Color Word mechanic streams trials: each shows a color WORD printed in a
 * (usually mismatched) ink color, and the player must respond to the INK, not
 * the word. The correct response for a trial is the swatch whose color id equals
 * the trial's `inkColorId`. The template measures cognitive flexibility through
 * accuracy (with a congruent/incongruent split — the interference effect),
 * false taps (wrong swatch picks), omissions, and timing.
 *
 * These functions are PURE and React-free: they read only the answer-key slice
 * of a {@link ColorWordCard} config (its `trials`) plus the player's per-trial
 * responses, so they are trivially unit-testable and reused unchanged by the
 * renderer as its single source of truth for scoring. Exposed as typed functions
 * over the precise config slice — never `Record<string, unknown>`.
 *
 * Accuracy denominator: accuracy is computed over EVERY trial, so a non-response
 * (omission) counts as incorrect — failing to respond is a failure to apply the
 * rule, consistent with "timeout is a resolved incorrect card" (Tech Design §7).
 * Empty trial sets report accuracy 0 (no NaN).
 */

import type { ColorWordCard } from '../../cards/types';

/**
 * A single per-trial response: the swatch color id the player tapped and the
 * reaction time from when that trial became visible. At most one response per
 * trial is meaningful — if duplicates are supplied, the FIRST for a trial index
 * wins (the renderer already enforces this).
 */
export type ColorWordResponse = {
  trialIndex: number;
  /** The color id of the swatch the player tapped. */
  pickedColorId: string;
  responseTimeMs: number;
};

/** Per-trial scoring outcome — the granular basis for every aggregate. */
export type ColorWordTrialOutcome = {
  trialIndex: number;
  trialId: string;
  /** Whether the word and its ink agree (an easy trial) or interfere. */
  congruent: boolean;
  /** The correct response: the ink color id for this trial. */
  expectedColorId: string;
  responded: boolean;
  pickedColorId: string | null;
  responseTimeMs: number | null;
  /** True iff the player's pick equals the ink color id. */
  isCorrect: boolean;
  /** True iff the player responded but picked the WRONG swatch (a false tap). */
  isFalseTap: boolean;
};

/** The full evaluation of a Color Word play-through. */
export type ColorWordEvaluation = {
  outcomes: ColorWordTrialOutcome[];
  totalTrials: number;
  totalCorrect: number;
  overallAccuracy: number;
  congruentTotal: number;
  congruentCorrect: number;
  congruentAccuracy: number;
  incongruentTotal: number;
  incongruentCorrect: number;
  incongruentAccuracy: number;
  /** Count of responded-but-wrong trials (interference errors live here). */
  falseTaps: number;
  /** Count of trials with no response at all. */
  omissions: number;
  /** Mean RT over responded trials, or null when none were responded. */
  meanResponseTimeMs: number | null;
  /** Overall card correctness — see {@link COLOR_WORD_PASS_ACCURACY}. */
  isCorrect: boolean;
};

/**
 * The slice of a {@link ColorWordCard} config the evaluator needs: just the
 * ordered `trials` (each carrying its ink answer key). Taking a `Pick` (not the
 * whole card) keeps the evaluator decoupled from rendering/timing concerns.
 */
export type ColorWordRules = Pick<ColorWordCard['config'], 'trials'>;

/**
 * Overall pass threshold for the card resolution.
 *
 * Color Word is a streamed interference task: one missed or misapplied trial
 * means the run was not executed correctly. The rich per-signal measures
 * (congruent/incongruent accuracy, false taps, timing) carry the diagnostic
 * detail, while the shared `isCorrect` boolean is intentionally strict — every
 * trial must be answered correctly (mirroring rule_flip).
 */
export const COLOR_WORD_PASS_ACCURACY = 1;

/** Guarded ratio: 0 when the denominator is 0, so empty sets never yield NaN. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Evaluate a full Color Word play-through. This is the renderer's single source
 * of truth for scoring: the renderer collects per-trial responses and routes
 * them through here rather than re-deriving correctness, the congruency split,
 * false taps, or timing inline.
 *
 * Responses for unknown indices (outside the trial list) are ignored; missing
 * responses are treated as omissions (incorrect). The function is order-
 * independent in `responses` because it indexes by `trialIndex`.
 */
export function evaluateColorWord(
  rules: ColorWordRules,
  responses: readonly ColorWordResponse[],
): ColorWordEvaluation {
  const { trials } = rules;

  // First response per trial wins; later duplicates for the same index ignored.
  const responseByIndex = new Map<number, ColorWordResponse>();
  for (const response of responses) {
    if (!responseByIndex.has(response.trialIndex)) {
      responseByIndex.set(response.trialIndex, response);
    }
  }

  const outcomes: ColorWordTrialOutcome[] = trials.map((trial, index) => {
    const recorded = responseByIndex.get(index) ?? null;
    const responded = recorded !== null;
    const pickedColorId = recorded?.pickedColorId ?? null;
    const isCorrect = responded && pickedColorId === trial.inkColorId;
    const isFalseTap = responded && !isCorrect;
    return {
      trialIndex: index,
      trialId: trial.id,
      congruent: trial.congruent,
      expectedColorId: trial.inkColorId,
      responded,
      pickedColorId,
      responseTimeMs: recorded?.responseTimeMs ?? null,
      isCorrect,
      isFalseTap,
    };
  });

  const congruent = outcomes.filter((outcome) => outcome.congruent);
  const incongruent = outcomes.filter((outcome) => !outcome.congruent);

  const congruentCorrect = congruent.filter((o) => o.isCorrect).length;
  const incongruentCorrect = incongruent.filter((o) => o.isCorrect).length;
  const totalCorrect = congruentCorrect + incongruentCorrect;
  const totalTrials = trials.length;

  const falseTaps = outcomes.filter((outcome) => outcome.isFalseTap).length;
  const omissions = outcomes.filter((outcome) => !outcome.responded).length;

  const respondedRts = outcomes
    .map((outcome) => outcome.responseTimeMs)
    .filter((rt): rt is number => rt !== null);
  const meanResponseTimeMs =
    respondedRts.length === 0
      ? null
      : respondedRts.reduce((sum, rt) => sum + rt, 0) / respondedRts.length;

  const overallAccuracy = ratio(totalCorrect, totalTrials);

  return {
    outcomes,
    totalTrials,
    totalCorrect,
    overallAccuracy,
    congruentTotal: congruent.length,
    congruentCorrect,
    congruentAccuracy: ratio(congruentCorrect, congruent.length),
    incongruentTotal: incongruent.length,
    incongruentCorrect,
    incongruentAccuracy: ratio(incongruentCorrect, incongruent.length),
    falseTaps,
    omissions,
    meanResponseTimeMs,
    // An empty card cannot be "passed" — there is nothing to get right.
    isCorrect: totalTrials > 0 && overallAccuracy >= COLOR_WORD_PASS_ACCURACY,
  };
}
