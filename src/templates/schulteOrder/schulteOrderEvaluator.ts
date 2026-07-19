/**
 * Schulte Order evaluator (Design §9; Technical Design §7; processing_speed /
 * visual_attention).
 *
 * The Schulte Order mechanic scatters a set of targets on a grid; the player
 * taps them in the correct ORDER (the `targets` array order — ascending numbers,
 * or an interleaved order like 1, A, 2, B). This module is the SINGLE SOURCE OF
 * TRUTH for both (a) whether a play-through completed the sequence in order and
 * (b) the error tally — derived by REPLAYING the player's raw tap log against the
 * expected order, never trusting a renderer-side count.
 *
 * Wrong-tap / ordering policy (documented UX choice — mirrors `spot_it`):
 *   - The expected next target advances ONLY on a correct in-order tap.
 *   - Any tap that is NOT the expected next target is COUNTED as an error but is
 *     NON-FATAL: it does not advance progress and does not end the card. The
 *     player keeps hunting for the same next target until they find it (or the
 *     clock runs out). This keeps "time to complete" meaningful and the touch
 *     interaction forgiving on a small grid.
 *   - A tap on an ALREADY-COMPLETED target (or an unknown id) is just another
 *     wrong tap → one error, no advance.
 *   - The play-through is CORRECT iff progress reaches the end (every target
 *     tapped in order). Errors do not, by themselves, fail the card — they are a
 *     measured signal. The card resolves INCORRECT only via timeout (the renderer
 *     reports a timeout as not-complete through here).
 *
 * The replay is order-dependent (taps are processed in the order they happened),
 * so the evaluator must receive the raw tap log, not a deduped set. Pure and
 * React-free: it reads only the ordered target ids plus the tap log, so it is
 * trivially unit-testable and reused unchanged by the renderer.
 */

import type { ResolutionType } from '../contract';

/**
 * The slice of a `SchulteOrderCard` config the evaluator needs: the ordered
 * target ids that define the correct sequence. Taking a small derived shape (not
 * the whole card) keeps the evaluator decoupled from rendering/timing/layout.
 */
export type SchulteOrderAnswerKey = {
  /** The target ids in the correct tap order (the `targets` array order). */
  orderedTargetIds: ReadonlyArray<string>;
};

/** Template-specific signals the evaluator derives from a play-through. */
export type SchulteOrderSignals = {
  /** Total number of targets in the sequence. */
  target_count: number;
  /** How many targets the player tapped in order (0..target_count). */
  progress: number;
  /** Wrong / out-of-order taps (non-fatal errors). */
  errors: number;
  /** Total taps the player made (correct advances + errors). */
  taps: number;
};

/** The result of evaluating one collected tap log. */
export type SchulteOrderResult = {
  isCorrect: boolean;
  /** Schulte Order has no partial credit: the sequence is completed or not. */
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: SchulteOrderSignals;
};

/**
 * Build the ordered answer key from a card's `targets` (their array order is the
 * correct tap order). A tiny helper so the renderer and validation derive the key
 * the same way.
 */
export function orderedTargetIdsFrom(
  targets: ReadonlyArray<{ id: string }>,
): string[] {
  return targets.map((target) => target.id);
}

/**
 * Replay a raw tap log against the expected order, returning how far the player
 * got (`progress`) and how many wrong/out-of-order taps they made (`errors`).
 * Exported so the renderer can drive its live "next target" highlight from the
 * SAME logic the scoring uses (display and scoring never drift apart).
 *
 * Each tap either matches the expected next id (advance progress) or does not
 * (one error, no advance). Taps past completion all count as errors.
 */
export function replaySchulteTaps(
  orderedTargetIds: ReadonlyArray<string>,
  tappedIds: ReadonlyArray<string>,
): { progress: number; errors: number } {
  let progress = 0;
  let errors = 0;
  for (const tappedId of tappedIds) {
    if (progress < orderedTargetIds.length && tappedId === orderedTargetIds[progress]) {
      progress += 1;
    } else {
      errors += 1;
    }
  }
  return { progress, errors };
}

/**
 * Evaluate a collected tap log against the card's ordered targets. This is the
 * renderer's single source of truth for completion + the error tally: the
 * renderer collects the raw tap order and routes it through here rather than
 * re-deriving progress/errors inline.
 *
 * A play-through is CORRECT iff progress reaches every target. A timeout-caught
 * play-through (short of completion) is INCORRECT, with `progress`/`errors`
 * reporting how far the player got.
 */
export function evaluateSchulteOrder(
  answer: SchulteOrderAnswerKey,
  tappedIds: ReadonlyArray<string>,
): SchulteOrderResult {
  const { orderedTargetIds } = answer;
  const { progress, errors } = replaySchulteTaps(orderedTargetIds, tappedIds);
  const isCorrect =
    orderedTargetIds.length > 0 && progress === orderedTargetIds.length;
  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      target_count: orderedTargetIds.length,
      progress,
      errors,
      taps: tappedIds.length,
    },
  };
}
