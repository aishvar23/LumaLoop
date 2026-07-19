// Ported from web `src/templates/wordUnscramble/wordUnscrambleEvaluator.test.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Tests for the pure Word Unscramble evaluator (Design §9).
 *
 * Pure-function tests: no React, no timers — the correct/incorrect selection
 * decision, the distractor it reports, the unknown-option boundary, and the
 * anagram check that backs catalog validation.
 */


import type { WordUnscrambleAnswerKey } from './wordUnscrambleEvaluator';
import {
  evaluateWordUnscrambleSelection,
  isValidUnscramble,
} from './wordUnscrambleEvaluator';

const answer: WordUnscrambleAnswerKey = { correctOptionId: 'opt-real' };

describe('evaluateWordUnscrambleSelection', () => {
  it('reports the correct option as correct with no distractor', () => {
    expect(evaluateWordUnscrambleSelection(answer, 'opt-real')).toEqual({
      isCorrect: true,
      selectedOptionId: 'opt-real',
      distractorOptionId: null,
    });
  });

  it('reports each wrong option as incorrect and names it as the distractor', () => {
    expect(evaluateWordUnscrambleSelection(answer, 'opt-near')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-near',
      distractorOptionId: 'opt-near',
    });
  });

  it('reports an unknown option id as an incorrect distractor', () => {
    expect(evaluateWordUnscrambleSelection(answer, 'nope')).toEqual({
      isCorrect: false,
      selectedOptionId: 'nope',
      distractorOptionId: 'nope',
    });
    expect(evaluateWordUnscrambleSelection(answer, '')).toEqual({
      isCorrect: false,
      selectedOptionId: '',
      distractorOptionId: '',
    });
  });
});

describe('isValidUnscramble', () => {
  it('accepts a genuine rearrangement of the scrambled letters', () => {
    expect(isValidUnscramble('tsrae', 'stare')).toBe(true);
    expect(isValidUnscramble('netsil', 'listen')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isValidUnscramble('T S R A E', 'Stare')).toBe(true);
    expect(isValidUnscramble('ECAPS', 'space')).toBe(true);
  });

  it('rejects a candidate with different letters or counts', () => {
    // Same length, different letters.
    expect(isValidUnscramble('tsrae', 'snake')).toBe(false);
    // Different counts (one extra letter).
    expect(isValidUnscramble('tsrae', 'stares')).toBe(false);
    // A sub-anagram (fewer letters) is not a full rearrangement.
    expect(isValidUnscramble('tsrae', 'rats')).toBe(false);
  });
});
