// Ported from web `src/templates/oddOneOut/oddOneOutEvaluator.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Odd One Out answer evaluator (Design §9; Technical Design §7;
 * pattern_recognition / logical_reasoning).
 *
 * The Odd One Out mechanic shows a small set of items where all but one share a
 * hidden rule (category, parity, shape, property, …). The player taps the single
 * item that does NOT belong. A pick is "correct" iff its item id equals the
 * card's `oddItemId`; a wrong pick is the "distractor" the design measures.
 *
 * This is a CONCEPTUAL pick — distinct from `spot_it`'s perceptual odd-glyph
 * scan — but its answer logic is the same single-committed-choice shape as
 * `tiny_logic`: one source-of-truth comparison against the answer key.
 *
 * This function is PURE and React-free: it reads only the answer-key slice of an
 * {@link OddOneOutCard} config, so it is trivially unit-testable and reused
 * unchanged by the renderer as its single source of truth for correctness and
 * for which distractor was chosen. Exposed as a typed function over the precise
 * config slice — never `Record<string, unknown>`.
 */

import type { OddOneOutCard } from '../../cards/types';

/**
 * The slice of an {@link OddOneOutCard} config the evaluator needs: just the id
 * of the odd item. Taking a `Pick` (not the whole card) keeps the evaluator
 * decoupled from rendering/timing concerns.
 */
export type OddOneOutAnswerKey = Pick<OddOneOutCard['config'], 'oddItemId'>;

/**
 * The result of evaluating a single committed pick.
 *
 * `distractorItemId` is the chosen wrong item id when the pick is incorrect, and
 * `null` when it is correct — so the renderer can report the distractor choice
 * without re-deriving the wrong/right branch.
 */
export type OddOneOutPickResult = {
  isCorrect: boolean;
  selectedItemId: string;
  distractorItemId: string | null;
};

/**
 * Evaluate a committed item pick. This is the renderer's single source of truth
 * for pick correctness and the distractor choice: the renderer routes every pick
 * through here rather than re-deriving the `=== oddItemId` check inline.
 *
 * An unknown item id (one not in the card's `items`) is simply incorrect — it
 * cannot equal `oddItemId`, so no special-casing is needed, and it is reported as
 * the chosen distractor like any other wrong pick.
 */
export function evaluateOddOneOut(
  answer: OddOneOutAnswerKey,
  selectedItemId: string,
): OddOneOutPickResult {
  const isCorrect = selectedItemId === answer.oddItemId;
  return {
    isCorrect,
    selectedItemId,
    distractorItemId: isCorrect ? null : selectedItemId,
  };
}
