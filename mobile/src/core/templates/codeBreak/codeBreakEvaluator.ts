// Ported from web `src/templates/codeBreak/codeBreakEvaluator.ts`; source of
// truth is the web app — keep in sync (Phase M). Pure + DOM-free, so it runs
// unchanged under React Native; only the relative import path differs.
/**
 * Code Break evaluator (Azure DevOps #143; logical_reasoning mechanic).
 *
 * The Code Break mechanic hides a secret code of N symbols drawn from a palette;
 * the player submits guesses and gets per-guess "peg" feedback in the classic
 * Mastermind / Bulls-and-Cows form:
 *   - `exact`   — symbols that are the right symbol AND in the right slot;
 *   - `partial` — symbols that are the right symbol but in the WRONG slot.
 * The player wins by submitting a guess equal to the secret (all-exact).
 *
 * This module is PURE and React-free: it reads only the answer-key slice of a
 * {@link CodeBreakCard} config (its `secret`) and a list of submitted guesses,
 * so it is trivially unit-testable and is reused unchanged by both renderers as
 * their single source of truth for BOTH peg feedback AND card resolution — a
 * renderer never re-derives peg counts inline. Exposed as a typed function over
 * the precise config slice — never `Record<string, unknown>`.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATE-SYMBOL PEG COUNTING (the classic correctness bug):
 *
 * A guess symbol may match AT MOST ONE secret symbol, and a secret symbol may be
 * matched AT MOST ONCE — so a symbol can never be counted in both `exact` and
 * `partial`, nor counted twice. We use the standard two-pass algorithm:
 *
 *   Pass 1 (exact): walk the slots; where guess[i] === secret[i], increment
 *     `exact` and CONSUME both that guess slot and that secret slot (they are no
 *     longer available to the partial pass).
 *   Pass 2 (partial): over the remaining (non-exact) slots, tally how many of
 *     each symbol are still UNMATCHED in the secret. For each remaining guess
 *     symbol, if the secret still has an unmatched count for it, increment
 *     `partial` and decrement that available count (so it cannot be reused).
 *
 * Worked example — secret `A A B`, guess `A C A`:
 *   Pass 1: slot 0 A===A → exact=1 (secret slot 0 consumed). Slots 1,2 differ.
 *   Pass 2: remaining secret symbols = { A:1, B:1 }; remaining guess = [C, A].
 *           C: no available → skip. A: available (1) → partial=1, A now 0.
 *   Result: { exact: 1, partial: 1 }. The second guess A correctly matches the
 *   one remaining secret A; the surplus guess A is NOT double-counted.
 * ---------------------------------------------------------------------------
 */

import type { CodeBreakCard } from '../../cards/types';
import type { ResolutionType } from '../contract';

/**
 * The slice of a {@link CodeBreakCard} config the evaluator needs: just the
 * `secret` (the answer key). Taking a `Pick` (not the whole card) keeps the
 * evaluator decoupled from rendering/timing concerns.
 */
export type CodeBreakAnswerKey = Pick<CodeBreakCard['config'], 'secret'>;

/** Per-guess peg feedback — the two Mastermind peg counts. */
export type CodeBreakFeedback = {
  /** Symbols that are the right symbol AND in the right slot. */
  exact: number;
  /** Symbols that are the right symbol but in the WRONG slot. */
  partial: number;
};

/**
 * Compute the {@link CodeBreakFeedback} peg counts for one guess against the
 * secret, handling duplicate symbols WITHOUT double-counting (see the
 * module-level algorithm note). A guess of a different length than the secret is
 * still scored positionally for the overlapping prefix and by symbol for the
 * remainder — but renderers only ever submit a full-length guess.
 */
export function scoreGuess(
  secret: ReadonlyArray<string>,
  guess: ReadonlyArray<string>,
): CodeBreakFeedback {
  let exact = 0;

  // Pass 1 (exact) — consume matched slots so they are unavailable to pass 2.
  // `remaining` tallies the secret symbols NOT consumed as exact matches.
  const remaining = new Map<string, number>();
  const leftoverGuess: string[] = [];
  const len = Math.min(secret.length, guess.length);
  for (let i = 0; i < len; i++) {
    if (guess[i] === secret[i]) {
      exact += 1;
    } else {
      remaining.set(secret[i], (remaining.get(secret[i]) ?? 0) + 1);
      leftoverGuess.push(guess[i]);
    }
  }
  // Any secret slots past the (shorter) guess length are still unmatched.
  for (let i = len; i < secret.length; i++) {
    remaining.set(secret[i], (remaining.get(secret[i]) ?? 0) + 1);
  }

  // Pass 2 (partial) — for each unmatched guess symbol, consume one available
  // unmatched secret symbol of the same value if any remain.
  let partial = 0;
  for (const symbol of leftoverGuess) {
    const available = remaining.get(symbol) ?? 0;
    if (available > 0) {
      partial += 1;
      remaining.set(symbol, available - 1);
    }
  }

  return { exact, partial };
}

/** Whether a guess is an exact, full-length match of the secret (a solve). */
export function isSolved(
  secret: ReadonlyArray<string>,
  guess: ReadonlyArray<string>,
): boolean {
  if (guess.length !== secret.length) return false;
  return guess.every((symbol, i) => symbol === secret[i]);
}

/** Template-specific signals the evaluator derives from a sequence of guesses. */
export type CodeBreakSignals = {
  /** The total guesses the player is allowed (the board height). */
  guesses_allowed: number;
  /** How many guesses the player actually submitted. */
  guesses_used: number;
  /** Exact pegs on the FINAL submitted guess (-1 if none submitted). */
  final_exact: number;
  /** Partial pegs on the FINAL submitted guess (-1 if none submitted). */
  final_partial: number;
  /** Length of the code (number of slots). */
  code_length: number;
};

/** The result of evaluating a completed sequence of guesses. */
export type CodeBreakResult = {
  isCorrect: boolean;
  /** Code Break has no partial credit: the code is cracked or it is not. */
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: CodeBreakSignals;
};

/**
 * Evaluate a completed sequence of submitted guesses against the secret. A solve
 * is `correct` iff ANY guess in the sequence exactly equals the secret; otherwise
 * (player exhausted `maxGuesses` without solving, or timed out mid-board) it is
 * `incorrect`. `maxGuesses` is supplied so the derived signals can report the
 * board height even when fewer guesses were used. The renderer routes its
 * collected guesses through here to decide resolution — it never compares against
 * the secret itself.
 */
export function evaluateCodeBreak(
  answer: CodeBreakAnswerKey,
  guesses: ReadonlyArray<ReadonlyArray<string>>,
  maxGuesses: number,
): CodeBreakResult {
  const { secret } = answer;

  const isCorrect = guesses.some((guess) => isSolved(secret, guess));

  const finalGuess = guesses.length > 0 ? guesses[guesses.length - 1] : null;
  const finalFeedback = finalGuess
    ? scoreGuess(secret, finalGuess)
    : { exact: -1, partial: -1 };

  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      guesses_allowed: maxGuesses,
      guesses_used: guesses.length,
      final_exact: finalFeedback.exact,
      final_partial: finalFeedback.partial,
      code_length: secret.length,
    },
  };
}
