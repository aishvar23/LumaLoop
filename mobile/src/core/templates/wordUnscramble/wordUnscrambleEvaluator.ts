// Ported from web `src/templates/wordUnscramble/wordUnscrambleEvaluator.ts`; source of truth is the web app — keep in
// sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Word Unscramble answer evaluator (Design §9; Technical Design §7).
 *
 * The Word Unscramble mechanic shows a hidden word's letters in a scrambled
 * order and asks the player to pick the correctly-unscrambled word from a
 * multiple-choice list. A selection is "correct" iff its option id equals the
 * card's `correctOptionId`; a wrong selection is the recorded "distractor
 * choice" (mirroring tiny_logic's signals).
 *
 * This function is PURE and React-free: it reads only the answer-key slice of a
 * {@link WordUnscrambleCard} config, so it is trivially unit-testable and reused
 * unchanged by the renderer as its single source of truth for correctness and
 * for which distractor was chosen. Exposed as a typed function over the precise
 * config slice — never `Record<string, unknown>`.
 *
 * A separate {@link isValidUnscramble} helper proves a candidate word is a
 * genuine letter-for-letter rearrangement of the scrambled letters (case- and
 * whitespace-insensitive). Catalog validation uses it to guarantee the authored
 * answer key really is an anagram of `scrambled`, so the renderer never has to.
 */

import type { WordUnscrambleCard } from '../../cards/types';

/**
 * The slice of a {@link WordUnscrambleCard} config the selection evaluator
 * needs: just the id of the correct option. Taking a `Pick` (not the whole
 * card) keeps the evaluator decoupled from rendering/timing concerns.
 */
export type WordUnscrambleAnswerKey = Pick<
  WordUnscrambleCard['config'],
  'correctOptionId'
>;

/**
 * The result of evaluating a single committed selection. `distractorOptionId`
 * is the chosen wrong option id when the selection is incorrect, and `null`
 * when it is correct.
 */
export type WordUnscrambleSelectionResult = {
  isCorrect: boolean;
  selectedOptionId: string;
  distractorOptionId: string | null;
};

/**
 * Normalise a word to its comparable letter multiset key: lowercased, with all
 * whitespace removed, and its characters sorted. Two words share a key iff one
 * is an anagram of the other. Pure and locale-light (lowercase + code-unit sort)
 * — sufficient for the authored ASCII catalog.
 */
function letterKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/\s+/g, '')
    .split('')
    .sort()
    .join('');
}

/**
 * True iff `candidate` is a genuine letter-for-letter rearrangement of
 * `scrambled` (same letters, same counts), case- and whitespace-insensitive.
 * Used by catalog validation to verify the authored answer truly unscrambles
 * the displayed letters.
 */
export function isValidUnscramble(
  scrambled: string,
  candidate: string,
): boolean {
  return letterKey(scrambled) === letterKey(candidate);
}

/**
 * Evaluate a committed option selection. This is the renderer's single source
 * of truth for selection correctness and the distractor choice: the renderer
 * routes every selection through here rather than re-deriving the
 * `=== correctOptionId` check inline.
 *
 * An unknown option id (one not in the card's `options`) is simply incorrect —
 * it cannot equal `correctOptionId`, so no special-casing is needed.
 */
export function evaluateWordUnscrambleSelection(
  answer: WordUnscrambleAnswerKey,
  selectedOptionId: string,
): WordUnscrambleSelectionResult {
  const isCorrect = selectedOptionId === answer.correctOptionId;
  return {
    isCorrect,
    selectedOptionId,
    distractorOptionId: isCorrect ? null : selectedOptionId,
  };
}
