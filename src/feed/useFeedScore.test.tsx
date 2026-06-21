/**
 * Tests for the feed score accumulator hook (Phase 4), driven through a tiny
 * harness with a deterministic injected card lookup + fake persistence store.
 * Asserts: accumulation across resolutions, per-card score lookup, idempotent
 * re-resolution, best-run derivation, and persistence on unmount.
 */

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import { BASE_POINTS, COMBO_STEP } from './scoring';
import type { ScoreStore } from './scoreStore';
import { useFeedScore } from './useFeedScore';

/** A minimal typed card carrying just the `timeLimitMs` the hook reads. */
function fakeCard(cardId: string, timeLimitMs: number): LiquidCard {
  return {
    cardId,
    config: { timeLimitMs },
  } as unknown as LiquidCard;
}

const getCardById = (cardId: string): LiquidCard | undefined =>
  fakeCard(cardId, 10_000);

/** A clean, instant correct resolution for `cardId`. */
function correct(cardId: string): CardResolution {
  return {
    cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 0,
    interactionElapsedMs: 0,
    attemptCount: 1,
    signals: {},
  };
}

/** An incorrect resolution for `cardId`. */
function incorrect(cardId: string): CardResolution {
  return {
    cardId,
    resolutionType: 'incorrect',
    isCorrect: false,
    elapsedMs: 1_000,
    interactionElapsedMs: 1_000,
    attemptCount: 1,
    signals: {},
  };
}

type Handle = ReturnType<typeof useFeedScore>;

function Harness({
  store,
  onReady,
}: {
  store?: ScoreStore | null;
  onReady: (h: Handle) => void;
}) {
  const h = useFeedScore({ getCardById, store });
  onReady(h);
  return (
    <div>
      <span data-testid="total">{h.state.totalPoints}</span>
      <span data-testid="streak">{h.state.currentStreak}</span>
      <span data-testid="best">{h.state.bestStreak}</span>
      <span data-testid="bestRun">{h.bestRun}</span>
    </div>
  );
}

const total = () => Number(screen.getByTestId('total').textContent);
const streak = () => Number(screen.getByTestId('streak').textContent);
const bestRun = () => Number(screen.getByTestId('bestRun').textContent);

describe('useFeedScore', () => {
  it('accumulates points and streak across resolutions', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);

    act(() => h.onCardResolved(0, correct('c0')));
    expect(total()).toBe(BASE_POINTS);
    expect(streak()).toBe(1);

    act(() => h.onCardResolved(1, correct('c1')));
    // Streak 2 → combo ×(1+COMBO_STEP).
    const second = Math.round(BASE_POINTS * (1 + COMBO_STEP));
    expect(total()).toBe(BASE_POINTS + second);
    expect(streak()).toBe(2);
  });

  it('records a per-card score readable by index', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(3, correct('c3')));
    const cardScore = h.getCardScore(3);
    expect(cardScore).toEqual({
      points: BASE_POINTS,
      correct: true,
      streak: 1,
      combo: 1,
    });
    // An unresolved index has no score.
    expect(h.getCardScore(99)).toBeNull();
  });

  it('resets the streak on a miss but keeps best run', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(1, correct('b')));
    expect(streak()).toBe(2);
    act(() => h.onCardResolved(2, incorrect('c')));
    expect(streak()).toBe(0);
    expect(bestRun()).toBe(2);
    expect(h.getCardScore(2)).toEqual({
      points: 0,
      correct: false,
      streak: 0,
      combo: 1,
    });
  });

  it('is idempotent per index — a re-resolution does not double-count', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(0, correct('a'))); // phantom re-resolve
    expect(total()).toBe(BASE_POINTS);
    expect(streak()).toBe(1);
  });

  it('seeds best run from the persisted store and raises it', () => {
    const store: ScoreStore = {
      read: () => ({ bestRun: 5, totalPoints: 999 }),
      record: vi.fn(() => ({ bestRun: 5, totalPoints: 999 })),
    };
    let h!: Handle;
    render(<Harness store={store} onReady={(x) => (h = x)} />);
    expect(bestRun()).toBe(5); // seeded from persistence
    // Build a longer run than the persisted best.
    for (let i = 0; i < 6; i++) {
      act(() => h.onCardResolved(i, correct(`c${i}`)));
    }
    expect(streak()).toBe(6);
    expect(bestRun()).toBe(6); // raised above the persisted 5
  });

  it('persists the visit best run + total on unmount', () => {
    const record = vi.fn<ScoreStore['record']>(() => ({
      bestRun: 0,
      totalPoints: 0,
    }));
    const store: ScoreStore = {
      read: () => ({ bestRun: 0, totalPoints: 0 }),
      record,
    };
    let h!: Handle;
    const { unmount } = render(<Harness store={store} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(1, correct('b')));
    unmount();
    // record(visitBestStreak, visitPoints)
    expect(record).toHaveBeenCalledTimes(1);
    const [bestStreakArg, pointsArg] = record.mock.calls[0];
    expect(bestStreakArg).toBe(2);
    expect(pointsArg).toBeGreaterThan(0);
  });
});
