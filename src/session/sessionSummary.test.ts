import { describe, expect, it } from 'vitest';

import type { ChallengeCategory } from '../cards/types';
import type { CardResolution, ResolutionType } from '../templates/contract';
import { computeSessionSummary } from './sessionSummary';
import type { CategoryLookup, SessionSummaryInput } from './sessionSummary';
import { MODE_DEFAULTS } from './sessionTypes';

/**
 * Session summary / receipt computation (Technical Design §9, Azure DevOps #62).
 * These assert `computeSessionSummary` is pure and deterministic and honors the
 * documented rules: `isCorrect` is the correctness source of truth (timeouts
 * count as incorrect), fastest = fastest card with `resolutionType === 'correct'`
 * by `elapsedMs` (first occurrence on ties), per-category aggregation via the
 * injected lookup, and `earnedExitBadge` = the injected `completedOnTime`
 * boundary signal (NOT inferred from card count). No trait/ranking language.
 */

/** Build a CardResolution fixture; defaults keep each test focused on one axis. */
function res(
  cardId: string,
  isCorrect: boolean,
  elapsedMs: number,
  resolutionType: ResolutionType = isCorrect ? 'correct' : 'incorrect',
): CardResolution {
  return {
    cardId,
    resolutionType,
    isCorrect,
    elapsedMs,
    interactionElapsedMs: elapsedMs,
    attemptCount: 1,
    signals: {},
  };
}

/** A category lookup backed by a plain record; unknown ids -> undefined. */
function lookup(map: Record<string, ChallengeCategory>): CategoryLookup {
  return (cardId) => map[cardId];
}

const noCategories: CategoryLookup = () => undefined;

/**
 * Build a SessionSummaryInput with sensible test defaults. `completedOnTime`
 * defaults to `true` (the common "session finished its bounded window" case);
 * tests that care about the badge pass it explicitly.
 */
function input(
  partial: Partial<SessionSummaryInput> &
    Pick<SessionSummaryInput, 'resolutions'>,
): SessionSummaryInput {
  return {
    sessionId: 's1',
    mode: 'three_minute_reset',
    categoryOf: noCategories,
    completedOnTime: true,
    ...partial,
  };
}

describe('computeSessionSummary — completedCards & accuracy', () => {
  it('counts every resolved card and computes accuracy from isCorrect', () => {
    const summary = computeSessionSummary(
      input({
        mode: 'three_minute_reset',
        resolutions: [
          res('c0', true, 100),
          res('c1', false, 200),
          res('c2', true, 300),
          res('c3', false, 400),
        ],
      }),
    );
    expect(summary.completedCards).toBe(4);
    expect(summary.correctCards).toBe(2);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.totalElapsedMs).toBe(1000);
    expect(summary.sessionId).toBe('s1');
    expect(summary.mode).toBe('three_minute_reset');
  });

  it('treats a timeout resolution as incorrect (isCorrect:false)', () => {
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [
          res('c0', true, 100),
          res('c1', false, 9_999, 'timeout'),
          res('c2', false, 50, 'timeout'),
        ],
      }),
    );
    expect(summary.completedCards).toBe(3);
    expect(summary.correctCards).toBe(1);
    expect(summary.accuracy).toBeCloseTo(1 / 3, 10);
  });

  it('defines accuracy as 0 (no division by zero) for an empty session', () => {
    const summary = computeSessionSummary(
      input({ mode: 'one_minute_rescue', resolutions: [], completedOnTime: false }),
    );
    expect(summary.completedCards).toBe(0);
    expect(summary.correctCards).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalElapsedMs).toBe(0);
    expect(summary.fastestCorrectCard).toBeUndefined();
    expect(summary.categoryBreakdown).toEqual([]);
    expect(summary.earnedExitBadge).toBe(false);
  });
});

describe('computeSessionSummary — fastestCorrectCard', () => {
  it('picks the fastest CORRECT card by elapsedMs (ignoring faster incorrect ones)', () => {
    const summary = computeSessionSummary(
      input({
        resolutions: [
          res('slow-correct', true, 500),
          res('fast-wrong', false, 10), // faster but incorrect -> ineligible
          res('fast-correct', true, 120),
        ],
      }),
    );
    expect(summary.fastestCorrectCard).toEqual({ cardId: 'fast-correct', elapsedMs: 120 });
  });

  it('keys eligibility on resolutionType === "correct", not isCorrect', () => {
    // A deliberately inconsistent fixture: faster but resolutionType !== 'correct'
    // (§9 keys eligibility on resolutionType). It must be ineligible even though
    // its isCorrect flag is true, so the slower genuinely-correct card wins.
    const summary = computeSessionSummary(
      input({
        resolutions: [
          res('genuinely-correct', true, 300, 'correct'),
          res('flag-only', true, 50, 'incorrect'),
        ],
      }),
    );
    expect(summary.fastestCorrectCard).toEqual({ cardId: 'genuinely-correct', elapsedMs: 300 });
  });

  it('is undefined when there are no correct cards (all timeouts/incorrect)', () => {
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('c0', false, 10, 'timeout'), res('c1', false, 20)],
      }),
    );
    expect(summary.fastestCorrectCard).toBeUndefined();
    expect('fastestCorrectCard' in summary).toBe(false);
  });

  it('breaks ties on FIRST occurrence in resolutions', () => {
    const summary = computeSessionSummary(
      input({
        resolutions: [
          res('first', true, 200),
          res('tie', true, 200), // equal time, later -> not chosen
        ],
      }),
    );
    expect(summary.fastestCorrectCard).toEqual({ cardId: 'first', elapsedMs: 200 });
  });
});

describe('computeSessionSummary — categoryBreakdown', () => {
  it('aggregates attempted/correct/medianElapsedMs per category in first-occurrence order', () => {
    const categoryOf = lookup({
      a0: 'visual_attention',
      b0: 'working_memory',
      a1: 'visual_attention',
      a2: 'visual_attention',
    });
    const summary = computeSessionSummary(
      input({
        resolutions: [
          res('a0', true, 100),
          res('b0', false, 400),
          res('a1', true, 300),
          res('a2', false, 200),
        ],
        categoryOf,
      }),
    );
    // First-occurrence order: visual_attention (a0) then working_memory (b0).
    expect(summary.categoryBreakdown).toEqual([
      {
        category: 'visual_attention',
        attempted: 3,
        correct: 2,
        medianElapsedMs: 200, // median of [100, 300, 200] = 200
      },
      {
        category: 'working_memory',
        attempted: 1,
        correct: 0,
        medianElapsedMs: 400,
      },
    ]);
  });

  it('uses the mean of the two middle values for an even-sized category sample', () => {
    const categoryOf = lookup({ a0: 'logical_reasoning', a1: 'logical_reasoning' });
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('a0', true, 100), res('a1', true, 200)],
        categoryOf,
      }),
    );
    expect(summary.categoryBreakdown[0].medianElapsedMs).toBe(150);
  });

  it('omits cards with no resolved category from the breakdown but still counts them overall', () => {
    const categoryOf = lookup({ known: 'pattern_recognition' });
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [
          res('known', true, 100),
          res('orphan', false, 200), // categoryOf -> undefined
        ],
        categoryOf,
      }),
    );
    expect(summary.completedCards).toBe(2);
    expect(summary.correctCards).toBe(1);
    expect(summary.categoryBreakdown).toHaveLength(1);
    expect(summary.categoryBreakdown[0].category).toBe('pattern_recognition');
    expect(summary.categoryBreakdown[0].attempted).toBe(1);
  });
});

describe('computeSessionSummary — earnedExitBadge (leaves on time)', () => {
  it('is exactly the injected completedOnTime signal, regardless of accuracy', () => {
    const onTime = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('c0', false, 10), res('c1', false, 10), res('c2', false, 10)],
        completedOnTime: true,
      }),
    );
    expect(onTime.earnedExitBadge).toBe(true); // badge is about completing, not accuracy

    const abandoned = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('c0', true, 10), res('c1', true, 10), res('c2', true, 10)],
        completedOnTime: false,
      }),
    );
    expect(abandoned.earnedExitBadge).toBe(false); // user left mid-window
  });

  it('is earned by a duration-limited session that completes on time with FEWER than maxCards', () => {
    // Design §8.3: the badge follows "after the bounded card count OR timer
    // completes". A one_minute_rescue (max 3) that the timer ends after only 2
    // cards still earned it — the card-count proxy would wrongly deny it.
    expect(MODE_DEFAULTS.one_minute_rescue.maxCards).toBe(3);
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('c0', true, 10), res('c1', true, 10)], // 2 < 3
        completedOnTime: true,
      }),
    );
    expect(summary.earnedExitBadge).toBe(true);
  });
});

describe('computeSessionSummary — edge cases & purity', () => {
  it('handles a single correct card', () => {
    const summary = computeSessionSummary(
      input({
        mode: 'one_minute_rescue',
        resolutions: [res('only', true, 250)],
        categoryOf: lookup({ only: 'processing_speed' }),
      }),
    );
    expect(summary.completedCards).toBe(1);
    expect(summary.accuracy).toBe(1);
    expect(summary.fastestCorrectCard).toEqual({ cardId: 'only', elapsedMs: 250 });
    expect(summary.categoryBreakdown).toEqual([
      { category: 'processing_speed', attempted: 1, correct: 1, medianElapsedMs: 250 },
    ]);
  });

  it('is deterministic: identical inputs yield a deeply equal result and never mutates inputs', () => {
    const resolutions: readonly CardResolution[] = [
      res('a0', true, 100),
      res('b0', false, 200),
      res('a1', true, 300),
    ];
    const frozen = resolutions.map((r) => ({ ...r }));
    const categoryOf = lookup({ a0: 'visual_attention', b0: 'working_memory', a1: 'visual_attention' });
    const args = input({ resolutions, categoryOf });

    const first = computeSessionSummary(args);
    const second = computeSessionSummary(args);
    expect(first).toEqual(second);
    // Inputs are untouched (pure).
    expect(resolutions).toEqual(frozen);
  });
});
