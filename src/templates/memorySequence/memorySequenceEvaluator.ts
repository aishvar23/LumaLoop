/**
 * Memory Sequence evaluator (Azure DevOps #137; working_memory mechanic).
 *
 * The Memory Sequence mechanic flashes an ordered set of grid tiles, then asks
 * the player to reproduce that order by tapping. A reproduction is "correct" iff
 * it is an EXACT, ordered, same-length match of the card's `sequence`.
 *
 * This function is PURE and React-free: it reads only the answer-key slice of a
 * {@link MemorySequenceCard} config (its `sequence`), so it is trivially
 * unit-testable and is reused unchanged by the renderer as its single source of
 * truth for correctness — the renderer routes its collected tap order through
 * here rather than re-deriving the comparison inline. Exposed as a typed
 * function over the precise config slice — never `Record<string, unknown>`.
 */

import type { GridCoordinate, MemorySequenceCard } from '../../cards/types';
import type { ResolutionType } from '../contract';

/**
 * The slice of a {@link MemorySequenceCard} config the evaluator needs: just the
 * ordered correct `sequence`. Taking a `Pick` (not the whole card) keeps the
 * evaluator decoupled from rendering/timing/flash concerns.
 */
export type MemorySequenceAnswerKey = Pick<
  MemorySequenceCard['config'],
  'sequence'
>;

/** Template-specific signals the evaluator derives from a reproduction. */
export type MemorySequenceSignals = {
  /** Length of the correct sequence the player had to reproduce. */
  sequence_length: number;
  /**
   * Number of positions that do not match the correct sequence. Counts both
   * wrong tiles at in-range positions AND any extra taps beyond the sequence
   * length, so a longer-than-expected reproduction is never scored as correct.
   */
  errors: number;
  /** Zero-based index of the first wrong position, or -1 if there is none. */
  first_error_step: number;
};

/** The result of evaluating one collected reproduction order. */
export type MemorySequenceResult = {
  isCorrect: boolean;
  /** Memory Sequence has no partial credit: a reproduction is correct or not. */
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: MemorySequenceSignals;
};

/** Same tile? Tolerates a missing `reproduced` entry (treated as a mismatch). */
function sameCoordinate(
  expected: GridCoordinate,
  actual: GridCoordinate | undefined,
): boolean {
  return (
    actual !== undefined &&
    expected.row === actual.row &&
    expected.column === actual.column
  );
}

/**
 * Evaluate a collected reproduction order against the card's correct sequence.
 *
 * The match is exact and ordered: every position must hold the same tile, and
 * the reproduction must be the same length as the sequence. Extra taps beyond
 * the sequence length are counted as errors so an over-long reproduction can
 * never be "correct"; a short reproduction (e.g. a timeout caught the player
 * mid-entry) has its missing positions counted as errors too.
 */
export function evaluateMemorySequence(
  answer: MemorySequenceAnswerKey,
  reproduced: ReadonlyArray<GridCoordinate>,
): MemorySequenceResult {
  const { sequence } = answer;

  let errors = 0;
  let firstErrorStep = -1;
  for (let i = 0; i < sequence.length; i++) {
    if (!sameCoordinate(sequence[i], reproduced[i])) {
      errors += 1;
      if (firstErrorStep === -1) firstErrorStep = i;
    }
  }

  // Any taps past the expected length are surplus errors. The first of them is
  // also the first error when the in-range prefix matched perfectly.
  if (reproduced.length > sequence.length) {
    if (firstErrorStep === -1) firstErrorStep = sequence.length;
    errors += reproduced.length - sequence.length;
  }

  const isCorrect = reproduced.length === sequence.length && errors === 0;

  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      sequence_length: sequence.length,
      errors,
      first_error_step: firstErrorStep,
    },
  };
}
