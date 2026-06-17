/**
 * Session summary / receipt computation (Technical Design §9, Azure DevOps #62).
 *
 * PURITY CONTRACT (CLAUDE.md §3/§4): `computeSessionSummary` is a pure,
 * deterministic function of its inputs. It never reads the clock (`Date.now`),
 * never generates randomness (`Math.random`), and never imports the live
 * catalog, reducer, or controller. The card->category mapping it needs is
 * INJECTED (`categoryOf`) so the core stays pure and testable; same inputs
 * always yield the same output.
 *
 * TEMPLATE-AGNOSTIC (CLAUDE.md §4/§6): the summary aggregates only over the
 * generic `CardResolution` contract plus the injected `ChallengeCategory`. It
 * never narrows on `templateType` and never hard-codes the category list, so
 * adding a new template/category needs no edit here.
 *
 * POSITIONING (Design §7): session- and category-level performance only. No
 * trait scores, no "weakest/strongest", no `hardestCategory`, no IQ / clinical
 * / employment framing — neutral "performance categories" language only.
 */

import { MODE_DEFAULTS } from './sessionTypes';
import type { SessionMode } from './sessionTypes';
import type { CardResolution } from '../templates/contract';
import type { ChallengeCategory } from '../cards/types';

/**
 * Injected card->category lookup. Returns `undefined` when the resolved cardId
 * has no known category (e.g. a card no longer in the catalog); such cards are
 * still counted in `completedCards`/`accuracy` but are omitted from
 * `categoryBreakdown` (they cannot be attributed to a category). Keeping this a
 * function (rather than importing the catalog) is what preserves purity.
 */
export type CategoryLookup = (cardId: string) => ChallengeCategory | undefined;

/** A single category's aggregate within a session (Technical Design §9). */
export type CategorySummary = {
  category: ChallengeCategory;
  attempted: number;
  correct: number;
  medianElapsedMs: number;
};

/**
 * End-of-session receipt (Technical Design §9). Field set and shape are taken
 * verbatim from the Tech Design §9 `SessionSummary` (the docs are authoritative,
 * CLAUDE.md §1) — no invented fields.
 */
export type SessionSummary = {
  sessionId: string;
  mode: SessionMode;
  completedCards: number;
  correctCards: number;
  accuracy: number;
  totalElapsedMs: number;
  fastestCorrectCard?: {
    cardId: string;
    elapsedMs: number;
  };
  categoryBreakdown: CategorySummary[];
  earnedExitBadge: boolean;
};

/** Inputs to {@link computeSessionSummary}. `resolutions` is the ordered list of
 *  every resolved card in the session window (the reducer's `results`). */
export type SessionSummaryInput = {
  sessionId: string;
  mode: SessionMode;
  resolutions: readonly CardResolution[];
  categoryOf: CategoryLookup;
};

/**
 * Median of a numeric sample. Empty sample -> 0 (a documented edge default; an
 * empty category never reaches here, but the guard keeps the helper total).
 * Even-length samples return the mean of the two middle values. Pure: sorts a
 * copy, never mutates the input.
 */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the session receipt from a session's resolutions.
 *
 * DECISIONS (documented per CLAUDE.md §2):
 *
 * - "correct" is `resolution.isCorrect` — the contract's source of truth. A
 *   `timeout` resolution carries `isCorrect: false`, so timeouts count as NOT
 *   correct (Technical Design §7).
 * - `accuracy = correctCards / completedCards`, in [0, 1]. With zero completed
 *   cards accuracy is defined as 0 (no division by zero).
 * - `fastestCorrectCard` ranks CORRECT cards only (§9: "Only resolutionType
 *   'correct' cards are eligible") by `elapsedMs` — the time field §9's struct
 *   names. (`interactionElapsedMs` is the input-only measure; §9 selects the
 *   full `elapsedMs`.) Ties break on FIRST OCCURRENCE in `resolutions` (stable).
 *   Absent (`undefined`) when there were no correct cards.
 * - `totalElapsedMs` sums `elapsedMs` across every completed card.
 * - `categoryBreakdown` groups resolutions by their injected category;
 *   `medianElapsedMs` is the median `elapsedMs` over that category's attempted
 *   cards. Categories appear in first-occurrence order (deterministic, and
 *   mirrors the "this session included …" receipt copy). Cards with no resolved
 *   category are omitted from the breakdown (but still counted overall).
 * - `earnedExitBadge`: Design §8.3/§8.4 — "Exit badge when the user leaves on
 *   time", i.e. they completed the bounded session rather than abandoning it.
 *   DECISION: the pure summary is handed no session timing/status, so the
 *   neutral, testable criterion is reaching the mode's bounded card count:
 *   `completedCards >= MODE_DEFAULTS[mode].maxCards`. (Duration-based early
 *   completion is the controller's concern and is intentionally out of scope
 *   for this pure function.)
 */
export function computeSessionSummary(
  input: SessionSummaryInput,
): SessionSummary {
  const { sessionId, mode, resolutions, categoryOf } = input;

  const completedCards = resolutions.length;
  const correctCards = resolutions.reduce(
    (sum, r) => sum + (r.isCorrect ? 1 : 0),
    0,
  );
  const accuracy = completedCards === 0 ? 0 : correctCards / completedCards;
  const totalElapsedMs = resolutions.reduce((sum, r) => sum + r.elapsedMs, 0);

  // Fastest CORRECT card by elapsedMs; ties resolve to the first occurrence
  // (strict `<` keeps the earliest of equal times).
  let fastestCorrectCard: SessionSummary['fastestCorrectCard'];
  for (const r of resolutions) {
    if (!r.isCorrect) {
      continue;
    }
    if (
      fastestCorrectCard === undefined ||
      r.elapsedMs < fastestCorrectCard.elapsedMs
    ) {
      fastestCorrectCard = { cardId: r.cardId, elapsedMs: r.elapsedMs };
    }
  }

  // Per-category aggregation. We accumulate into a Map keyed by category and
  // track first-occurrence order separately so the output is deterministic
  // without hard-coding the category union (stays template-agnostic).
  type Accumulator = {
    attempted: number;
    correct: number;
    elapsed: number[];
  };
  const byCategory = new Map<ChallengeCategory, Accumulator>();
  const categoryOrder: ChallengeCategory[] = [];

  for (const r of resolutions) {
    const category = categoryOf(r.cardId);
    if (category === undefined) {
      continue;
    }
    let acc = byCategory.get(category);
    if (acc === undefined) {
      acc = { attempted: 0, correct: 0, elapsed: [] };
      byCategory.set(category, acc);
      categoryOrder.push(category);
    }
    acc.attempted += 1;
    acc.correct += r.isCorrect ? 1 : 0;
    acc.elapsed.push(r.elapsedMs);
  }

  const categoryBreakdown: CategorySummary[] = categoryOrder.map((category) => {
    const acc = byCategory.get(category)!;
    return {
      category,
      attempted: acc.attempted,
      correct: acc.correct,
      medianElapsedMs: median(acc.elapsed),
    };
  });

  const earnedExitBadge = completedCards >= MODE_DEFAULTS[mode].maxCards;

  return {
    sessionId,
    mode,
    completedCards,
    correctCards,
    accuracy,
    totalElapsedMs,
    ...(fastestCorrectCard !== undefined ? { fastestCorrectCard } : {}),
    categoryBreakdown,
    earnedExitBadge,
  };
}
