/**
 * Step Logic evaluator (Azure DevOps #139; logical_reasoning mechanic).
 *
 * The Step Logic mechanic shows a shared premise and asks the player to answer a
 * short chain of 2–3 LINKED multiple-choice sub-questions in order. A solve is
 * "correct" iff EVERY step's chosen option id is an exact match of that step's
 * `correctOptionId`, in order, for all steps.
 *
 * This function is PURE and React-free: it reads only the answer-key slice of a
 * {@link StepLogicCard} config (its ordered `steps`), so it is trivially
 * unit-testable and is reused unchanged by the renderer as its single source of
 * truth for correctness — the renderer routes its collected pick order through
 * here rather than re-deriving the comparison inline. Exposed as a typed
 * function over the precise config slice — never `Record<string, unknown>`.
 */

import type { StepLogicCard } from '../../cards/types';
import type { ResolutionType } from '../contract';

/**
 * The slice of a {@link StepLogicCard} config the evaluator needs: just the
 * ordered `steps` (their `correctOptionId`s form the answer key). Taking a
 * `Pick` (not the whole card) keeps the evaluator decoupled from
 * rendering/timing concerns.
 */
export type StepLogicAnswerKey = Pick<StepLogicCard['config'], 'steps'>;

/** Template-specific signals the evaluator derives from a chain of picks. */
export type StepLogicSignals = {
  /** Total number of sub-questions the player had to answer. */
  steps_total: number;
  /** How many step picks exactly matched their `correctOptionId`. */
  steps_correct: number;
  /** Zero-based index of the first wrong step, or -1 if there is none. */
  first_error_step: number;
};

/** The result of evaluating one collected chain of picks. */
export type StepLogicResult = {
  isCorrect: boolean;
  /** Step Logic has no partial credit: a chain is correct or not. */
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: StepLogicSignals;
};

/**
 * Evaluate a collected chain of picked option ids against the card's steps.
 *
 * The match is exact and ordered: each step's pick must equal that step's
 * `correctOptionId`, and the player must have answered every step. A short chain
 * (e.g. a timeout caught the player mid-solve) has its unanswered steps counted
 * as wrong; any surplus picks beyond the step count are likewise treated as a
 * mismatch so an over-long chain can never be "correct".
 */
export function evaluateStepLogic(
  answer: StepLogicAnswerKey,
  chosenOptionIds: ReadonlyArray<string>,
): StepLogicResult {
  const { steps } = answer;

  let stepsCorrect = 0;
  let firstErrorStep = -1;
  for (let i = 0; i < steps.length; i++) {
    if (chosenOptionIds[i] === steps[i].correctOptionId) {
      stepsCorrect += 1;
    } else if (firstErrorStep === -1) {
      firstErrorStep = i;
    }
  }

  // Any picks past the expected step count are surplus errors. The first of them
  // is also the first error when the in-range prefix matched every step.
  const hasSurplus = chosenOptionIds.length > steps.length;
  if (hasSurplus && firstErrorStep === -1) {
    firstErrorStep = steps.length;
  }

  const isCorrect =
    chosenOptionIds.length === steps.length && stepsCorrect === steps.length;

  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      steps_total: steps.length,
      steps_correct: stepsCorrect,
      first_error_step: firstErrorStep,
    },
  };
}
