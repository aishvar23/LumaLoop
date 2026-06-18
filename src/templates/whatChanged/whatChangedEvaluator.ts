/**
 * What Changed answer evaluator (Design §9.2; Technical Design §7).
 *
 * The What Changed mechanic shows a pattern briefly, then asks the player to
 * identify what changed by picking one option. A selection is "correct" iff its
 * option id equals the card's `correctOptionId`.
 *
 * This function is PURE and React-free: it reads only the answer-key slice of a
 * {@link WhatChangedCard} config, so it is trivially unit-testable and reused
 * unchanged by the renderer as its single source of truth for correctness.
 * Exposed as a typed function over the precise config slice — never
 * `Record<string, unknown>`.
 */

import type { WhatChangedCard } from '../../cards/types';

/**
 * The slice of a {@link WhatChangedCard} config the evaluator needs: just the
 * id of the correct option. Taking a `Pick` (not the whole card) keeps the
 * evaluator decoupled from rendering/timing/preview concerns.
 */
export type WhatChangedAnswerKey = Pick<
  WhatChangedCard['config'],
  'correctOptionId'
>;

/** The result of evaluating a single committed selection. */
export type WhatChangedSelectionResult = { isCorrect: boolean };

/**
 * Evaluate a committed option selection. This is the renderer's single source
 * of truth for selection correctness: `WhatChangedCard` routes every selection
 * through here rather than re-deriving the `=== correctOptionId` check inline.
 *
 * An unknown option id (one not in the card's `options`) is simply incorrect —
 * it cannot equal `correctOptionId`, so no special-casing is needed.
 */
export function evaluateWhatChangedSelection(
  answer: WhatChangedAnswerKey,
  selectedOptionId: string,
): WhatChangedSelectionResult {
  return { isCorrect: selectedOptionId === answer.correctOptionId };
}
