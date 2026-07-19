// Ported from web `src/templates/nBack/nBackEvaluator.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * N-Back answer evaluator (Design §9; Technical Design §7; working_memory).
 *
 * The N-Back mechanic streams items one at a time. The player flags (taps MATCH
 * on) any item that is the SAME as the one `n` steps back. This module is the
 * single source of truth for both (a) which positions are true matches — derived
 * from the stream + `n`, NEVER trusted from an authored key — and (b) scoring the
 * player's flags against that truth into hits / misses / false-alarms.
 *
 * Signal-detection scoring (the standard N-Back outcome model):
 *   - HIT          — a true-match position the player flagged.
 *   - MISS         — a true-match position the player did NOT flag.
 *   - FALSE_ALARM  — a NON-match position the player flagged.
 *   - CORRECT_REJECTION — a flaggable NON-match position the player left unflagged.
 *
 * The first `n` items can never be matches (there is nothing `n` back), so they
 * are excluded from the scorable window entirely — a flag on them is impossible
 * to commit in the renderer and is treated as out-of-window noise here.
 *
 * These functions are PURE and React-free: they read only the stream slice of an
 * {@link NBackCard} config plus the player's flagged positions, so they are
 * trivially unit-testable and reused unchanged by the renderer. Exposed as typed
 * functions over the precise config slice — never `Record<string, unknown>`.
 */

import type { NBackCard } from '../../cards/types';

/**
 * The slice of an {@link NBackCard} config the evaluator needs: the `stream` and
 * `n`. `matchIndices` is intentionally NOT read for scoring — it is an authored
 * answer key that catalog validation cross-checks against {@link deriveMatchIndices}
 * so a mis-authored key is rejected, but the live scoring always re-derives the
 * truth from the stream itself.
 */
export type NBackRules = Pick<NBackCard['config'], 'stream' | 'n'>;

/** The signal-detection outcome for a single scorable stream position. */
export type NBackOutcomeKind =
  | 'hit'
  | 'miss'
  | 'false_alarm'
  | 'correct_rejection';

/** Per-position scoring outcome — the granular basis for every aggregate. */
export type NBackPositionOutcome = {
  index: number;
  /** True iff `stream[index] === stream[index - n]` (a real match). */
  isMatch: boolean;
  /** True iff the player flagged this position. */
  flagged: boolean;
  kind: NBackOutcomeKind;
};

/** The full evaluation of an N-Back play-through. */
export type NBackEvaluation = {
  /** Scorable positions only (index >= n), in ascending order. */
  outcomes: NBackPositionOutcome[];
  /** The true-match positions (ascending) the evaluator derived from the stream. */
  matchIndices: number[];
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** Total true matches in the stream (= hits + misses). */
  totalMatches: number;
  /** Total scorable NON-match positions (= falseAlarms + correctRejections). */
  totalNonMatches: number;
  /**
   * Overall accuracy across the scorable window: (hits + correctRejections) over
   * the number of scorable positions. 0 for an empty window (no NaN).
   */
  accuracy: number;
  /** Overall card correctness — see {@link NBACK_PASS}. */
  isCorrect: boolean;
};

/** Guarded ratio: 0 when the denominator is 0, so empty windows never yield NaN. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Derive the true-match positions from a stream and `n`: every index `i >= n`
 * where `stream[i] === stream[i - n]`, ascending. This is the authoritative
 * answer key — catalog validation asserts the authored `matchIndices` equals
 * this, and {@link evaluateNBack} scores against this, never the authored key.
 */
export function deriveMatchIndices(rules: NBackRules): number[] {
  const { stream, n } = rules;
  const matches: number[] = [];
  if (!Number.isInteger(n) || n < 1) return matches;
  for (let i = n; i < stream.length; i += 1) {
    if (stream[i] === stream[i - n]) {
      matches.push(i);
    }
  }
  return matches;
}

/**
 * Evaluate a full N-Back play-through. This is the renderer's single source of
 * truth for scoring: the renderer collects the set of flagged positions and
 * routes them through here rather than re-deriving the match set or the
 * hit/miss/false-alarm tally inline.
 *
 * `flaggedIndices` may contain anything; only indices in the scorable window
 * (`[n, stream.length)`) are considered. Duplicate flags collapse (a position is
 * either flagged or not). Order-independent.
 */
export function evaluateNBack(
  rules: NBackRules,
  flaggedIndices: Iterable<number>,
): NBackEvaluation {
  const { stream, n } = rules;
  const flagged = new Set<number>();
  for (const index of flaggedIndices) flagged.add(index);

  const matchSet = new Set(deriveMatchIndices(rules));

  const outcomes: NBackPositionOutcome[] = [];
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  // Only positions where a match is even possible (index >= n) are scorable.
  const windowStart = Number.isInteger(n) && n >= 1 ? n : stream.length;
  for (let i = windowStart; i < stream.length; i += 1) {
    const isMatch = matchSet.has(i);
    const wasFlagged = flagged.has(i);
    let kind: NBackOutcomeKind;
    if (isMatch && wasFlagged) {
      kind = 'hit';
      hits += 1;
    } else if (isMatch && !wasFlagged) {
      kind = 'miss';
      misses += 1;
    } else if (!isMatch && wasFlagged) {
      kind = 'false_alarm';
      falseAlarms += 1;
    } else {
      kind = 'correct_rejection';
      correctRejections += 1;
    }
    outcomes.push({ index: i, isMatch, flagged: wasFlagged, kind });
  }

  const totalMatches = hits + misses;
  const totalNonMatches = falseAlarms + correctRejections;
  const scorable = outcomes.length;
  const accuracy = ratio(hits + correctRejections, scorable);

  return {
    outcomes,
    matchIndices: [...matchSet].sort((a, b) => a - b),
    hits,
    misses,
    falseAlarms,
    correctRejections,
    totalMatches,
    totalNonMatches,
    accuracy,
    // A run is correct only with EVERY match caught and ZERO false alarms — a
    // perfect signal-detection run over the scorable window.
    isCorrect:
      scorable > 0 && hits === totalMatches && falseAlarms === 0,
  };
}

/**
 * Whether an authored `matchIndices` answer key exactly equals the set derived
 * from the stream + `n`. Catalog validation uses this so a mis-authored key
 * (extra, missing, or out-of-order positions) is rejected loudly at startup.
 */
export const NBACK_PASS = true;

export function matchIndicesAreConsistent(
  config: Pick<NBackCard['config'], 'stream' | 'n' | 'matchIndices'>,
): boolean {
  const derived = deriveMatchIndices(config);
  const authored = config.matchIndices;
  if (authored.length !== derived.length) return false;
  for (let i = 0; i < derived.length; i += 1) {
    if (authored[i] !== derived[i]) return false;
  }
  return true;
}
