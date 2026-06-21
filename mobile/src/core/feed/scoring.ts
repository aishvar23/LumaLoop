// Ported from web `src/feed/scoring.ts`; source of truth is the web app — keep in
// sync (Phase 4 — GAME POINTS). Byte-faithful: only this header differs. The React
// `useFeedScore` hook + persistence store are ported separately. See
// `mobile/src/core/README.md`.
/**
 * Pure scoring + streak/combo core (Phase 4 — GAME POINTS).
 *
 * SOURCE OF TRUTH for the feed's game-points layer. This module is the web copy;
 * `mobile/src/core/feed/scoring.ts` is a byte-faithful port (header-only diff).
 *
 * ── POSITIONING GUARDRAIL (Design §7 / §21.8) ────────────────────────────────
 * This is a GAME scoring layer, framed as POINTS ONLY — "points", "streak", "best
 * run", "combo". It is NOT a skill / ability / IQ / performance-rating / trait
 * measure and MUST NEVER be presented as one. Faster + cleaner play earns more
 * GAME points; that is an arcade reward, not an assessment of the player.
 *
 * ── DESIGN (deterministic, template-agnostic) ────────────────────────────────
 * The core consumes ONLY the shared {@link CardResolution} fields every evaluator
 * already emits — `resolutionType`, `isCorrect`, `interactionElapsedMs`,
 * `attemptCount` — plus the card's `timeLimitMs` (the one timing primitive common
 * to every card config, already used by the feed's timer gate). It NEVER switches
 * on `templateType` and NEVER reads template-specific `signals`, so a new game
 * scores for free.
 *
 * Points for a CORRECT resolution:
 *
 *     points = round(BASE_POINTS * speedMultiplier * accuracyMultiplier * combo)
 *
 *   • speedMultiplier ∈ [MIN_SPEED_MULT, 1]: a linear ramp on the fraction of the
 *     time limit USED (interactionElapsedMs / timeLimitMs). Answering instantly →
 *     1.0; using the whole limit → MIN_SPEED_MULT. Monotonically NON-INCREASING
 *     in elapsed time (faster is never worth fewer points). When `timeLimitMs` is
 *     non-finite/≤0 (e.g. an un-gated card) speed weighting is neutral (1.0).
 *   • accuracyMultiplier ∈ [MIN_ACCURACY_MULT, 1]: 1.0 for a clean single attempt;
 *     each EXTRA attempt beyond the first subtracts ACCURACY_PENALTY_PER_ATTEMPT,
 *     floored at MIN_ACCURACY_MULT. Monotonically NON-INCREASING in attempts.
 *   • combo: the multiplier carried by the CURRENT streak (see {@link comboForStreak}),
 *     applied AFTER the streak has been incremented for this correct answer.
 *
 * An incorrect/timeout resolution earns INCORRECT_POINTS (0) and BREAKS the streak
 * (streak → 0, combo → 1).
 *
 * Everything is a pure function of its inputs — no clocks, no DOM, no randomness —
 * so the formula and the accumulator are exhaustively unit-testable.
 */

import type { CardResolution } from '../templates/contract';

// ── Tunable constants (game-feel; documented, not magic) ─────────────────────

/** Base points for a correct answer before speed/accuracy/combo weighting. */
export const BASE_POINTS = 100;

/** Points for an incorrect or timed-out resolution. */
export const INCORRECT_POINTS = 0;

/** Floor of the speed multiplier — using the whole time limit still earns this. */
export const MIN_SPEED_MULT = 0.5;

/** Floor of the accuracy multiplier — many false taps still earn this share. */
export const MIN_ACCURACY_MULT = 0.5;

/** Accuracy multiplier lost per EXTRA attempt beyond the first (clean) attempt. */
export const ACCURACY_PENALTY_PER_ATTEMPT = 0.15;

/**
 * Combo growth per consecutive correct answer, and its cap. The combo multiplier
 * is `1 + (streak - 1) * COMBO_STEP`, clamped to COMBO_MAX. So streak 1 → ×1.0,
 * and it climbs COMBO_STEP per correct answer until COMBO_MAX.
 */
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 2.5;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Clamp `value` into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Speed multiplier from the fraction of the time limit used. A linear ramp from
 * 1.0 (instant) down to {@link MIN_SPEED_MULT} (used the whole limit). Neutral
 * (1.0) when the time limit is not a positive finite number, so an un-gated card
 * is never penalised for "slowness" it could not have.
 */
export function speedMultiplier(
  interactionElapsedMs: number,
  timeLimitMs: number,
): number {
  if (!Number.isFinite(timeLimitMs) || timeLimitMs <= 0) return 1;
  const elapsed = interactionElapsedMs > 0 ? interactionElapsedMs : 0;
  const usedFraction = clamp(elapsed / timeLimitMs, 0, 1);
  return MIN_SPEED_MULT + (1 - MIN_SPEED_MULT) * (1 - usedFraction);
}

/**
 * Accuracy multiplier from the attempt count. A clean first attempt (or an
 * unknown/zero count) earns 1.0; each extra attempt subtracts
 * {@link ACCURACY_PENALTY_PER_ATTEMPT}, floored at {@link MIN_ACCURACY_MULT}.
 */
export function accuracyMultiplier(attemptCount: number): number {
  const extra = attemptCount > 1 ? attemptCount - 1 : 0;
  return clamp(1 - extra * ACCURACY_PENALTY_PER_ATTEMPT, MIN_ACCURACY_MULT, 1);
}

/**
 * The combo multiplier carried by a given streak length. Streak 0 or 1 → ×1.0;
 * each further consecutive correct answer adds {@link COMBO_STEP}, capped at
 * {@link COMBO_MAX}.
 */
export function comboForStreak(streak: number): number {
  if (streak <= 1) return 1;
  return clamp(1 + (streak - 1) * COMBO_STEP, 1, COMBO_MAX);
}

// ── Accumulator state + transition ───────────────────────────────────────────

/** The running game-points state across the endless feed. All game language. */
export type ScoreState = {
  /** Total points earned this feed visit. */
  totalPoints: number;
  /** Current consecutive-correct streak (resets to 0 on a miss). */
  currentStreak: number;
  /** Best streak reached this feed visit ("best run"). */
  bestStreak: number;
  /** The combo multiplier carried by the current streak. */
  combo: number;
};

/** The fresh, zeroed score state at the start of a feed visit. */
export const INITIAL_SCORE_STATE: ScoreState = {
  totalPoints: 0,
  currentStreak: 0,
  bestStreak: 0,
  combo: 1,
};

/** What a SINGLE resolution contributed — surfaced on the result card. */
export type CardScore = {
  /** Points earned for this resolution (0 on a miss). */
  points: number;
  /** Whether this resolution counted as correct (extended the streak). */
  correct: boolean;
  /** The streak AFTER applying this resolution. */
  streak: number;
  /** The combo multiplier applied to this resolution's points. */
  combo: number;
};

/**
 * Score a single resolution given the card's time limit — pure, no state. Returns
 * the standalone points for one card at combo ×1 (the accumulator re-applies the
 * running combo). Incorrect/timeout → {@link INCORRECT_POINTS}.
 */
export function scoreResolution(
  resolution: Pick<
    CardResolution,
    'isCorrect' | 'interactionElapsedMs' | 'attemptCount'
  >,
  timeLimitMs: number,
): number {
  if (!resolution.isCorrect) return INCORRECT_POINTS;
  const speed = speedMultiplier(resolution.interactionElapsedMs, timeLimitMs);
  const accuracy = accuracyMultiplier(resolution.attemptCount);
  return BASE_POINTS * speed * accuracy;
}

/**
 * Apply one resolution to the running {@link ScoreState}, returning the NEXT state
 * and the {@link CardScore} delta for this card. Pure: the same inputs always
 * yield the same outputs.
 *
 * On a CORRECT resolution: increment the streak, derive the combo from the NEW
 * streak, award `round(base * combo)`, and update the best run. On a MISS: award
 * {@link INCORRECT_POINTS} and reset the streak/combo.
 */
export function applyResolution(
  state: ScoreState,
  resolution: Pick<
    CardResolution,
    'isCorrect' | 'interactionElapsedMs' | 'attemptCount'
  >,
  timeLimitMs: number,
): { state: ScoreState; cardScore: CardScore } {
  if (!resolution.isCorrect) {
    const next: ScoreState = {
      ...state,
      currentStreak: 0,
      combo: 1,
    };
    return {
      state: next,
      cardScore: { points: INCORRECT_POINTS, correct: false, streak: 0, combo: 1 },
    };
  }

  const currentStreak = state.currentStreak + 1;
  const combo = comboForStreak(currentStreak);
  const base = scoreResolution(resolution, timeLimitMs);
  const points = Math.round(base * combo);
  const totalPoints = state.totalPoints + points;
  const bestStreak = Math.max(state.bestStreak, currentStreak);

  return {
    state: { totalPoints, currentStreak, bestStreak, combo },
    cardScore: { points, correct: true, streak: currentStreak, combo },
  };
}
