/**
 * Gears Rotation answer evaluator.
 *
 * gears_rotation shows a horizontal chain of meshed gears spinning in
 * ALTERNATING directions; the driver (first) gear's spin is shown and the player
 * picks which way the LAST gear spins. A selection is "correct" iff its option id
 * equals the card's `correctOptionId`; a wrong selection is the recorded
 * distractor choice (mirrors matrix_reasoning exactly — the "reasoning" lives in
 * the authored content, not in code).
 *
 * PURE and React-free: it reads only the answer-key slice of a
 * {@link GearsRotationCard} config, so it is trivially unit-testable and reused
 * unchanged by the renderer as its single source of truth for correctness and
 * for which distractor was chosen. Typed over the precise config slice — never
 * `Record<string, unknown>`.
 */

import type { GearsRotationCard } from '../../cards/types';

/** The slice of config the evaluator needs: just the correct option's id. */
export type GearsRotationAnswerKey = Pick<
  GearsRotationCard['config'],
  'correctOptionId'
>;

/** The result of evaluating a single committed selection. */
export type GearsRotationSelectionResult = {
  isCorrect: boolean;
  selectedOptionId: string;
  /** The chosen wrong option id when incorrect; `null` when correct. */
  distractorOptionId: string | null;
};

/**
 * Evaluate a committed option selection — the renderer's single source of truth
 * for correctness and the distractor choice. An unknown option id is simply
 * incorrect (it cannot equal `correctOptionId`), so no special-casing is needed.
 */
export function evaluateGearsRotationSelection(
  answer: GearsRotationAnswerKey,
  selectedOptionId: string,
): GearsRotationSelectionResult {
  const isCorrect = selectedOptionId === answer.correctOptionId;
  return {
    isCorrect,
    selectedOptionId,
    distractorOptionId: isCorrect ? null : selectedOptionId,
  };
}
