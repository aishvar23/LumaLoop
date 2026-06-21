/**
 * Tests for the pure Code Break evaluator (Azure DevOps #143; ported from web
 * `src/templates/codeBreak/codeBreakEvaluator.test.ts`).
 *
 * Pure-function tests: no React, no timers. The peg-counting suite focuses on
 * the duplicate-symbol edge cases that are the classic Mastermind bug source.
 */
import {
  evaluateCodeBreak,
  isSolved,
  scoreGuess,
} from './codeBreakEvaluator';

describe('scoreGuess — peg counting', () => {
  it('counts all exact on a perfect guess and no partials', () => {
    expect(scoreGuess(['A', 'B', 'C'], ['A', 'B', 'C'])).toEqual({
      exact: 3,
      partial: 0,
    });
  });

  it('counts pure partials when every symbol is present but misplaced', () => {
    // secret A B C, guess C A B → all present, none in place.
    expect(scoreGuess(['A', 'B', 'C'], ['C', 'A', 'B'])).toEqual({
      exact: 0,
      partial: 3,
    });
  });

  it('counts no pegs when no guess symbol is in the code', () => {
    expect(scoreGuess(['A', 'B', 'C'], ['X', 'Y', 'Z'])).toEqual({
      exact: 0,
      partial: 0,
    });
  });

  it('mixes exact and partial without double-counting', () => {
    // secret A B C D, guess A C B X → A exact; B,C present misplaced; X absent.
    expect(scoreGuess(['A', 'B', 'C', 'D'], ['A', 'C', 'B', 'X'])).toEqual({
      exact: 1,
      partial: 2,
    });
  });

  // ── Duplicate-symbol edge cases (the classic bug source) ──────────────────

  it('does not double-count a duplicated guess symbol against a single secret', () => {
    // secret A A B, guess A C A → slot0 exact A; the remaining secret has one A,
    // the second guess A claims it as a partial; the C and surplus matter nil.
    expect(scoreGuess(['A', 'A', 'B'], ['A', 'C', 'A'])).toEqual({
      exact: 1,
      partial: 1,
    });
  });

  it('caps partials at the secret multiplicity of a symbol', () => {
    // secret A B C, guess A A A → one exact A (slot0); the other two A guesses
    // find NO remaining A in the secret, so no partials.
    expect(scoreGuess(['A', 'B', 'C'], ['A', 'A', 'A'])).toEqual({
      exact: 1,
      partial: 0,
    });
  });

  it('counts a single secret duplicate once as partial when misplaced', () => {
    // secret A A B, guess B X A → no exact; the one misplaced A matches one of
    // the two secret As (partial 1); B is present but the only B is in slot2,
    // guess B in slot0 → partial; X nothing.
    expect(scoreGuess(['A', 'A', 'B'], ['B', 'X', 'A'])).toEqual({
      exact: 0,
      partial: 2,
    });
  });

  it('handles a secret full of one symbol with exacts only', () => {
    // secret A A A, guess A A B → two exact, the B finds no A left.
    expect(scoreGuess(['A', 'A', 'A'], ['A', 'A', 'B'])).toEqual({
      exact: 2,
      partial: 0,
    });
  });

  it('does not let a misplaced duplicate steal an already-exact secret symbol', () => {
    // secret A B A, guess A A C → slot0 A exact (consumes secret slot0 A);
    // remaining secret = {B, A}; guess remaining = [A(slot1), C]. The slot1 A
    // matches the remaining A → partial 1; C nothing. Crucially the slot1 A does
    // NOT also claim the already-exact secret A.
    expect(scoreGuess(['A', 'B', 'A'], ['A', 'A', 'C'])).toEqual({
      exact: 1,
      partial: 1,
    });
  });
});

describe('isSolved', () => {
  it('is true only for an exact full-length match', () => {
    expect(isSolved(['A', 'B'], ['A', 'B'])).toBe(true);
    expect(isSolved(['A', 'B'], ['B', 'A'])).toBe(false);
    expect(isSolved(['A', 'B'], ['A'])).toBe(false);
    expect(isSolved(['A', 'B'], ['A', 'B', 'C'])).toBe(false);
  });
});

describe('evaluateCodeBreak — resolution + signals', () => {
  const answer = { secret: ['A', 'B', 'C', 'D'] } as const;

  it('resolves correct when any guess equals the secret', () => {
    const result = evaluateCodeBreak(
      answer,
      [
        ['A', 'A', 'A', 'A'],
        ['A', 'B', 'C', 'D'],
      ],
      8,
    );
    expect(result.isCorrect).toBe(true);
    expect(result.resolutionType).toBe('correct');
    expect(result.signals).toEqual({
      guesses_allowed: 8,
      guesses_used: 2,
      final_exact: 4,
      final_partial: 0,
      code_length: 4,
    });
  });

  it('resolves incorrect when guesses are exhausted without solving', () => {
    const result = evaluateCodeBreak(
      answer,
      [
        ['A', 'A', 'A', 'A'],
        ['B', 'B', 'B', 'B'],
      ],
      2,
    );
    expect(result.isCorrect).toBe(false);
    expect(result.resolutionType).toBe('incorrect');
    expect(result.signals.guesses_allowed).toBe(2);
    expect(result.signals.guesses_used).toBe(2);
    // Final guess B B B B vs A B C D → one exact (slot1 B).
    expect(result.signals.final_exact).toBe(1);
    expect(result.signals.final_partial).toBe(0);
  });

  it('reports -1 final pegs when no guess was submitted (timeout pre-guess)', () => {
    const result = evaluateCodeBreak(answer, [], 8);
    expect(result.isCorrect).toBe(false);
    expect(result.signals.guesses_used).toBe(0);
    expect(result.signals.final_exact).toBe(-1);
    expect(result.signals.final_partial).toBe(-1);
  });
});
