/**
 * Tests for the RN feed score accumulator hook (Phase 4), driven through a tiny
 * harness with a deterministic injected card lookup + fake async store. Asserts
 * accumulation, per-card lookup, idempotent re-resolution, best-run derivation,
 * and persistence on unmount.
 */

import { act, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import { BASE_POINTS, COMBO_STEP } from '../core/feed/scoring';
import type { ScoreStore } from './scoreStore';
import { useFeedScore } from './useFeedScore';

function fakeCard(cardId: string, timeLimitMs: number): LiquidCard {
  return { cardId, config: { timeLimitMs } } as unknown as LiquidCard;
}

const getCardById = (cardId: string): LiquidCard | undefined =>
  fakeCard(cardId, 10_000);

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
    <View>
      <Text testID="total">{h.state.totalPoints}</Text>
      <Text testID="streak">{h.state.currentStreak}</Text>
      <Text testID="bestRun">{h.bestRun}</Text>
    </View>
  );
}

const num = (id: string) => Number(screen.getByTestId(id).props.children);

describe('useFeedScore (RN)', () => {
  it('accumulates points and streak across resolutions', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);

    act(() => h.onCardResolved(0, correct('c0')));
    expect(num('total')).toBe(BASE_POINTS);
    expect(num('streak')).toBe(1);

    act(() => h.onCardResolved(1, correct('c1')));
    const second = Math.round(BASE_POINTS * (1 + COMBO_STEP));
    expect(num('total')).toBe(BASE_POINTS + second);
    expect(num('streak')).toBe(2);
  });

  it('records a per-card score readable by index', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(3, correct('c3')));
    expect(h.getCardScore(3)).toEqual({
      points: BASE_POINTS,
      correct: true,
      streak: 1,
      combo: 1,
    });
    expect(h.getCardScore(99)).toBeNull();
  });

  it('resets the streak on a miss but keeps best run', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(1, correct('b')));
    expect(num('streak')).toBe(2);
    act(() => h.onCardResolved(2, incorrect('c')));
    expect(num('streak')).toBe(0);
    expect(num('bestRun')).toBe(2);
  });

  it('is idempotent per index — a re-resolution does not double-count', () => {
    let h!: Handle;
    render(<Harness store={null} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(0, correct('a')));
    expect(num('total')).toBe(BASE_POINTS);
    expect(num('streak')).toBe(1);
  });

  it('seeds best run from the persisted store (async) and raises it', async () => {
    const store: ScoreStore = {
      read: jest.fn(async () => ({ bestRun: 5, totalPoints: 999 })),
      record: jest.fn(async () => ({ bestRun: 5, totalPoints: 999 })),
    };
    let h!: Handle;
    render(<Harness store={store} onReady={(x) => (h = x)} />);
    // The async read resolves on a microtask; flush it.
    await act(async () => {});
    expect(num('bestRun')).toBe(5);
    for (let i = 0; i < 6; i++) {
      act(() => h.onCardResolved(i, correct(`c${i}`)));
    }
    expect(num('streak')).toBe(6);
    expect(num('bestRun')).toBe(6);
  });

  it('persists the visit best run + total on unmount', () => {
    const record = jest.fn<ReturnType<ScoreStore['record']>, Parameters<ScoreStore['record']>>(
      async () => ({ bestRun: 0, totalPoints: 0 }),
    );
    const store: ScoreStore = {
      read: jest.fn(async () => ({ bestRun: 0, totalPoints: 0 })),
      record,
    };
    let h!: Handle;
    const view = render(<Harness store={store} onReady={(x) => (h = x)} />);
    act(() => h.onCardResolved(0, correct('a')));
    act(() => h.onCardResolved(1, correct('b')));
    view.unmount();
    expect(record).toHaveBeenCalledTimes(1);
    const [bestStreakArg, pointsArg] = record.mock.calls[0];
    expect(bestStreakArg).toBe(2);
    expect(pointsArg).toBeGreaterThan(0);
  });
});
