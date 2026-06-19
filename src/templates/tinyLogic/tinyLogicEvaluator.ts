/**
 * Tiny Logic answer evaluator (Design §9.4; Technical Design §7).
 *
 * The Tiny Logic mechanic shows a short logic stem and asks the player to pick
 * one option. A selection is "correct" iff its option id equals the card's
 * `correctOptionId`; a wrong selection is the "distractor choice" the design
 * measures (Design §9.4 signals: accuracy, time, distractor choice, explanation
 * viewed after error).
 *
 * This function is PURE and React-free: it reads only the answer-key slice of a
 * {@link TinyLogicCard} config, so it is trivially unit-testable and reused
 * unchanged by the renderer as its single source of truth for correctness and
 * for which distractor was chosen. Exposed as a typed function over the precise
 * config slice — never `Record<string, unknown>`.
 */

import type { TinyLogicCard } from '../../cards/types';

/**
 * The slice of a {@link TinyLogicCard} config the evaluator needs: just the id
 * of the correct option. Taking a `Pick` (not the whole card) keeps the
 * evaluator decoupled from rendering/timing concerns.
 */
export type TinyLogicAnswerKey = Pick<
  TinyLogicCard['config'],
  'correctOptionId'
>;

/**
 * The result of evaluating a single committed selection.
 *
 * `distractorOptionId` is the chosen wrong option id when the selection is
 * incorrect, and `null` when it is correct — so the renderer can report the
 * distractor choice (Design §9.4) without re-deriving the wrong/right branch.
 */
export type TinyLogicSelectionResult = {
  isCorrect: boolean;
  selectedOptionId: string;
  distractorOptionId: string | null;
};

/**
 * Evaluate a committed option selection. This is the renderer's single source
 * of truth for selection correctness and the distractor choice: `TinyLogicCard`
 * routes every selection through here rather than re-deriving the
 * `=== correctOptionId` check inline.
 *
 * An unknown option id (one not in the card's `options`) is simply incorrect —
 * it cannot equal `correctOptionId`, so no special-casing is needed, and it is
 * reported as the chosen distractor like any other wrong selection.
 */
export function evaluateTinyLogicSelection(
  answer: TinyLogicAnswerKey,
  selectedOptionId: string,
): TinyLogicSelectionResult {
  const isCorrect = selectedOptionId === answer.correctOptionId;
  return {
    isCorrect,
    selectedOptionId,
    distractorOptionId: isCorrect ? null : selectedOptionId,
  };
}
