// Ported from web `src/feed/scoring.test.ts`; keep in sync (Phase 4). jest globals (no vitest import).
/**
 * Tests for the pure scoring + streak/combo core (Phase 4).
 *
 * Covers: speed weighting (monotonic, bounded, neutral on no limit), accuracy
 * weighting (monotonic, floored), combo growth/cap/reset, streak increments/
 * resets, and incorrect/timeout = 0. Pure functions → no mocks, no clock.
 */


import type { CardResolution } from '../templates/contract';
import {
  ACCURACY_PENALTY_PER_ATTEMPT,
  BASE_POINTS,
  COMBO_MAX,
  COMBO_STEP,
  INCORRECT_POINTS,
  INITIAL_SCORE_STATE,
  MIN_ACCURACY_MULT,
  MIN_SPEED_MULT,
  accuracyMultiplier,
  applyResolution,
  comboForStreak,
  scoreResolution,
  speedMultiplier,
} from './scoring';

/** Build a minimal resolution slice for the scoring core. */
function res(
  partial: Partial<
    Pick<CardResolution, 'isCorrect' | 'interactionElapsedMs' | 'attemptCount'>
  >,
): Pick<CardResolution, 'isCorrect' | 'interactionElapsedMs' | 'attemptCount'> {
  return {
    isCorrect: true,
    interactionElapsedMs: 0,
    attemptCount: 1,
    ...partial,
  };
}

describe('speedMultiplier', () => {
  const LIMIT = 10_000;

  it('is 1.0 for an instant answer and the floor for using the whole limit', () => {
    expect(speedMultiplier(0, LIMIT)).toBe(1);
    expect(speedMultiplier(LIMIT, LIMIT)).toBeCloseTo(MIN_SPEED_MULT, 10);
  });

  it('is the midpoint at half the limit', () => {
    expect(speedMultiplier(LIMIT / 2, LIMIT)).toBeCloseTo(
      MIN_SPEED_MULT + (1 - MIN_SPEED_MULT) * 0.5,
      10,
    );
  });

  it('is monotonically non-increasing in elapsed time', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let e = 0; e <= LIMIT; e += LIMIT / 20) {
      const m = speedMultiplier(e, LIMIT);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      prev = m;
    }
  });

  it('clamps overruns to the floor and never below it', () => {
    expect(speedMultiplier(LIMIT * 5, LIMIT)).toBeCloseTo(MIN_SPEED_MULT, 10);
  });

  it('is neutral (1.0) for a non-finite or non-positive time limit', () => {
    expect(speedMultiplier(5_000, Number.POSITIVE_INFINITY)).toBe(1);
    expect(speedMultiplier(5_000, 0)).toBe(1);
    expect(speedMultiplier(5_000, -1)).toBe(1);
  });

  it('treats negative elapsed as zero (full speed)', () => {
    expect(speedMultiplier(-100, LIMIT)).toBe(1);
  });
});

describe('accuracyMultiplier', () => {
  it('is 1.0 for a clean single attempt (or unknown/zero)', () => {
    expect(accuracyMultiplier(1)).toBe(1);
    expect(accuracyMultiplier(0)).toBe(1);
  });

  it('subtracts the penalty per extra attempt', () => {
    expect(accuracyMultiplier(2)).toBeCloseTo(1 - ACCURACY_PENALTY_PER_ATTEMPT, 10);
    expect(accuracyMultiplier(3)).toBeCloseTo(
      1 - 2 * ACCURACY_PENALTY_PER_ATTEMPT,
      10,
    );
  });

  it('is monotonically non-increasing in attempts and floored', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let a = 1; a <= 20; a++) {
      const m = accuracyMultiplier(a);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      expect(m).toBeGreaterThanOrEqual(MIN_ACCURACY_MULT);
      prev = m;
    }
    expect(accuracyMultiplier(50)).toBe(MIN_ACCURACY_MULT);
  });
});

describe('comboForStreak', () => {
  it('is 1.0 at streak 0 and 1', () => {
    expect(comboForStreak(0)).toBe(1);
    expect(comboForStreak(1)).toBe(1);
  });

  it('grows by COMBO_STEP per consecutive correct answer', () => {
    expect(comboForStreak(2)).toBeCloseTo(1 + COMBO_STEP, 10);
    expect(comboForStreak(3)).toBeCloseTo(1 + 2 * COMBO_STEP, 10);
  });

  it('caps at COMBO_MAX', () => {
    expect(comboForStreak(1000)).toBe(COMBO_MAX);
  });
});

describe('scoreResolution', () => {
  it('returns INCORRECT_POINTS for an incorrect resolution', () => {
    expect(scoreResolution(res({ isCorrect: false }), 10_000)).toBe(
      INCORRECT_POINTS,
    );
  });

  it('awards full base for an instant, clean correct answer', () => {
    expect(scoreResolution(res({ interactionElapsedMs: 0, attemptCount: 1 }), 10_000)).toBe(
      BASE_POINTS,
    );
  });

  it('combines speed and accuracy weighting multiplicatively', () => {
    const value = scoreResolution(
      res({ interactionElapsedMs: 5_000, attemptCount: 2 }),
      10_000,
    );
    const expected =
      BASE_POINTS * speedMultiplier(5_000, 10_000) * accuracyMultiplier(2);
    expect(value).toBeCloseTo(expected, 10);
  });
});

describe('applyResolution — streak / combo accumulation', () => {
  it('increments the streak and awards combo-scaled points on correct', () => {
    const r1 = applyResolution(
      INITIAL_SCORE_STATE,
      res({ interactionElapsedMs: 0, attemptCount: 1 }),
      10_000,
    );
    // Streak 1 → combo ×1.0 → full base.
    expect(r1.cardScore).toEqual({
      points: BASE_POINTS,
      correct: true,
      streak: 1,
      combo: 1,
    });
    expect(r1.state).toEqual({
      totalPoints: BASE_POINTS,
      currentStreak: 1,
      bestStreak: 1,
      combo: 1,
    });

    const r2 = applyResolution(
      r1.state,
      res({ interactionElapsedMs: 0, attemptCount: 1 }),
      10_000,
    );
    // Streak 2 → combo ×(1+COMBO_STEP).
    const combo2 = 1 + COMBO_STEP;
    expect(r2.cardScore.streak).toBe(2);
    expect(r2.cardScore.combo).toBeCloseTo(combo2, 10);
    expect(r2.cardScore.points).toBe(Math.round(BASE_POINTS * combo2));
    expect(r2.state.totalPoints).toBe(BASE_POINTS + Math.round(BASE_POINTS * combo2));
    expect(r2.state.bestStreak).toBe(2);
  });

  it('resets the streak and combo on a miss, awarding INCORRECT_POINTS', () => {
    const built = applyResolution(INITIAL_SCORE_STATE, res({}), 10_000);
    const after = applyResolution(built.state, res({ isCorrect: false }), 10_000);
    expect(after.cardScore).toEqual({
      points: INCORRECT_POINTS,
      correct: false,
      streak: 0,
      combo: 1,
    });
    expect(after.state.currentStreak).toBe(0);
    expect(after.state.combo).toBe(1);
    // Total is unchanged by a miss; best streak is preserved.
    expect(after.state.totalPoints).toBe(built.state.totalPoints);
    expect(after.state.bestStreak).toBe(1);
  });

  it('preserves the best run across a reset and a fresh build', () => {
    let s = INITIAL_SCORE_STATE;
    for (let i = 0; i < 4; i++) s = applyResolution(s, res({}), 10_000).state;
    expect(s.currentStreak).toBe(4);
    expect(s.bestStreak).toBe(4);
    s = applyResolution(s, res({ isCorrect: false }), 10_000).state; // miss
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(4);
    s = applyResolution(s, res({}), 10_000).state; // build 1 again
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(4); // best run unchanged
  });

  it('caps the combo over a long streak', () => {
    let s = INITIAL_SCORE_STATE;
    let last = applyResolution(s, res({}), 10_000);
    for (let i = 0; i < 100; i++) {
      last = applyResolution(last.state, res({}), 10_000);
      s = last.state;
    }
    expect(s.combo).toBe(COMBO_MAX);
    expect(last.cardScore.combo).toBe(COMBO_MAX);
  });

  it('is deterministic — same inputs yield same outputs', () => {
    const a = applyResolution(INITIAL_SCORE_STATE, res({ interactionElapsedMs: 3_333, attemptCount: 2 }), 7_777);
    const b = applyResolution(INITIAL_SCORE_STATE, res({ interactionElapsedMs: 3_333, attemptCount: 2 }), 7_777);
    expect(a).toEqual(b);
  });
});
