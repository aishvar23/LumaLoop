/**
 * Rule Flip answer evaluator (Design §9.3; Technical Design §7).
 *
 * The Rule Flip mechanic streams stimuli one at a time. The player applies a
 * simple rule — respond MATCH when the stimulus fits the active rule, NO-MATCH
 * when it does not. Partway through (at `flipAtStimulusIndex`) the rule FLIPS,
 * so the same stimulus may now require the opposite response. The template
 * measures cognitive flexibility through four §9.3 signals: pre-flip accuracy,
 * post-flip accuracy, switch latency, and perseveration errors.
 *
 * These functions are PURE and React-free: they read only the rule slice of a
 * {@link RuleFlipCard} config plus the player's per-stimulus responses, so they
 * are trivially unit-testable and reused unchanged by the renderer as its single
 * source of truth for scoring. Exposed as typed functions over the precise
 * config slice — never `Record<string, unknown>`.
 *
 * Boundary semantics (Design §9.3, "change the rule mid-card"): the INITIAL rule
 * is active for indices `< flipAtStimulusIndex`; the FLIPPED rule is active at
 * and after that index (`>= flipAtStimulusIndex`). The flip index is the first
 * post-flip stimulus.
 *
 * Accuracy denominator: accuracy is computed over EVERY stimulus in a phase, so
 * a non-response (omission) counts as incorrect — never responding is a failure
 * to apply the rule, consistent with the "timeout is a resolved incorrect card"
 * posture (Technical Design §7). Empty phases report accuracy 0 (no NaN).
 */

import type { RuleFlipCard } from '../../cards/types';

/** The two responses the player can give to a streamed stimulus. */
export type RuleFlipResponseKind = 'match' | 'no_match';

/**
 * A single per-stimulus response the player made during the stream. `stimulus
 * Index` ties it to a stimulus by position; `responseTimeMs` is the reaction
 * time measured from when that stimulus became visible (needed for switch
 * latency). At most one response per stimulus is meaningful — if duplicates are
 * supplied, the FIRST for an index wins (the renderer already enforces this).
 */
export type RuleFlipResponse = {
  stimulusIndex: number;
  response: RuleFlipResponseKind;
  responseTimeMs: number;
};

/** Which side of the flip a stimulus sits on. */
export type RuleFlipPhase = 'pre_flip' | 'post_flip';

/** Which rule was active for a stimulus (initial before the flip, flipped after). */
export type RuleFlipActiveRule = 'initial' | 'flipped';

/** Per-stimulus scoring outcome — the granular basis for every aggregate. */
export type RuleFlipStimulusOutcome = {
  stimulusIndex: number;
  stimulusId: string;
  phase: RuleFlipPhase;
  activeRule: RuleFlipActiveRule;
  /** The correct response under the rule ACTIVE at this index. */
  expectedResponse: RuleFlipResponseKind;
  responded: boolean;
  response: RuleFlipResponseKind | null;
  responseTimeMs: number | null;
  /** True iff the player's response matches `expectedResponse`. */
  isCorrect: boolean;
  /**
   * True iff this is a post-flip response that is WRONG under the new rule but
   * would have been CORRECT under the old (initial) rule — i.e. the player kept
   * applying the pre-flip rule (a perseveration error).
   */
  isPerseveration: boolean;
};

/** The full evaluation of a Rule Flip play-through. */
export type RuleFlipEvaluation = {
  outcomes: RuleFlipStimulusOutcome[];
  preFlipTotal: number;
  preFlipCorrect: number;
  preFlipAccuracy: number;
  postFlipTotal: number;
  postFlipCorrect: number;
  postFlipAccuracy: number;
  /** RT on the first post-flip stimulus the player responded to; null if none. */
  switchLatencyMs: number | null;
  perseverationCount: number;
  totalStimuli: number;
  totalCorrect: number;
  overallAccuracy: number;
  /** Overall card correctness — see {@link RULE_FLIP_PASS_ACCURACY}. */
  isCorrect: boolean;
};

/**
 * The slice of a {@link RuleFlipCard} config the evaluator needs: the stimulus
 * list (with each stimulus's rule-match flags) and where the rule flips. Taking
 * a `Pick` (not the whole card) keeps the evaluator decoupled from rendering,
 * timing, and stream-duration concerns.
 */
export type RuleFlipRules = Pick<
  RuleFlipCard['config'],
  'flipAtStimulusIndex' | 'stimuli'
>;

/**
 * Overall pass threshold for the card resolution.
 *
 * Design §9.3 defines Rule Flip by its four per-signal measures, not by a single
 * pass/fail verdict. But the shared `CardResolution` contract (Technical Design
 * §7) requires one `isCorrect` boolean per card so the session receipt can count
 * correct cards uniformly across templates. We therefore define a documented
 * prototype heuristic: the card resolves CORRECT iff the player answered at
 * least half of all stimuli correctly. The rich per-signal measures (pre/post
 * accuracy, switch latency, perseveration) carry the real flexibility story in
 * the resolution `signals`; this boolean only feeds the cross-template accuracy
 * tally. Named (not inlined) so the threshold is explicit and easy to revisit.
 */
export const RULE_FLIP_PASS_ACCURACY = 0.5;

/** Guarded ratio: 0 when the denominator is 0, so empty phases never yield NaN. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** The correct response for a stimulus under a given rule. */
function expectedResponseFor(
  stimulus: RuleFlipRules['stimuli'][number],
  rule: RuleFlipActiveRule,
): RuleFlipResponseKind {
  const matches =
    rule === 'initial'
      ? stimulus.matchesInitialRule
      : stimulus.matchesFlippedRule;
  return matches ? 'match' : 'no_match';
}

/**
 * Evaluate a full Rule Flip play-through. This is the renderer's single source
 * of truth for scoring: the renderer collects per-stimulus responses and routes
 * them through here rather than re-deriving correctness, accuracy, switch
 * latency, or perseveration inline.
 *
 * Responses for unknown indices (outside the stimulus list) are ignored; missing
 * responses are treated as omissions (incorrect). The function is order-
 * independent in `responses` because it indexes by `stimulusIndex`.
 */
export function evaluateRuleFlip(
  rules: RuleFlipRules,
  responses: readonly RuleFlipResponse[],
): RuleFlipEvaluation {
  const { stimuli, flipAtStimulusIndex } = rules;

  // First response per stimulus wins; later duplicates for the same index are
  // ignored (the renderer commits one response per stimulus, but stay robust).
  const responseByIndex = new Map<number, RuleFlipResponse>();
  for (const response of responses) {
    if (!responseByIndex.has(response.stimulusIndex)) {
      responseByIndex.set(response.stimulusIndex, response);
    }
  }

  const outcomes: RuleFlipStimulusOutcome[] = stimuli.map((stimulus, index) => {
    const isPostFlip = index >= flipAtStimulusIndex;
    const activeRule: RuleFlipActiveRule = isPostFlip ? 'flipped' : 'initial';
    const expectedResponse = expectedResponseFor(stimulus, activeRule);

    const recorded = responseByIndex.get(index) ?? null;
    const responded = recorded !== null;
    const response = recorded?.response ?? null;
    const isCorrect = responded && response === expectedResponse;

    // Perseveration: a post-flip response that is wrong under the NEW rule yet
    // matches what the OLD (initial) rule would have required — the player is
    // still applying the pre-flip rule. (When old and new agree for a stimulus,
    // a correct-under-old response is also correct-under-new, so it is never
    // counted here.)
    let isPerseveration = false;
    if (isPostFlip && responded && !isCorrect) {
      const oldRuleExpected = expectedResponseFor(stimulus, 'initial');
      isPerseveration = response === oldRuleExpected;
    }

    return {
      stimulusIndex: index,
      stimulusId: stimulus.id,
      phase: isPostFlip ? 'post_flip' : 'pre_flip',
      activeRule,
      expectedResponse,
      responded,
      response,
      responseTimeMs: recorded?.responseTimeMs ?? null,
      isCorrect,
      isPerseveration,
    };
  });

  const preFlip = outcomes.filter((outcome) => outcome.phase === 'pre_flip');
  const postFlip = outcomes.filter((outcome) => outcome.phase === 'post_flip');

  const preFlipCorrect = preFlip.filter((outcome) => outcome.isCorrect).length;
  const postFlipCorrect = postFlip.filter((outcome) => outcome.isCorrect).length;
  const totalCorrect = preFlipCorrect + postFlipCorrect;
  const totalStimuli = stimuli.length;

  // Switch latency: the RT of the first post-flip stimulus the player responded
  // to, in index order. `responseTimeMs` is non-null whenever `responded`.
  const firstPostResponse = postFlip.find((outcome) => outcome.responded);
  const switchLatencyMs = firstPostResponse?.responseTimeMs ?? null;

  const perseverationCount = postFlip.filter(
    (outcome) => outcome.isPerseveration,
  ).length;

  const overallAccuracy = ratio(totalCorrect, totalStimuli);

  return {
    outcomes,
    preFlipTotal: preFlip.length,
    preFlipCorrect,
    preFlipAccuracy: ratio(preFlipCorrect, preFlip.length),
    postFlipTotal: postFlip.length,
    postFlipCorrect,
    postFlipAccuracy: ratio(postFlipCorrect, postFlip.length),
    switchLatencyMs,
    perseverationCount,
    totalStimuli,
    totalCorrect,
    overallAccuracy,
    // An empty card cannot be "passed" — there is nothing to get right.
    isCorrect: totalStimuli > 0 && overallAccuracy >= RULE_FLIP_PASS_ACCURACY,
  };
}
