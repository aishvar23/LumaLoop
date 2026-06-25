/**
 * Tests for the Odd One Out renderer (Design §9; Tech §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers. Odd One Out is a single-phase, one-move conceptual pick: the FIRST pick
 * resolves the card, the chosen wrong item is reported as the distractor, and the
 * timeout path is delegated to the shared useCardTimer.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OddOneOutCard as OddOneOutCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import OddOneOutCard from './OddOneOutCard';

function oddOneOutCard(
  overrides: Partial<OddOneOutCardType['config']> = {},
): OddOneOutCardType {
  return {
    cardId: 'ooo-1',
    creatorHandle: '@test',
    templateType: 'odd_one_out',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Tap the one that does not belong.',
    puzzleDna: {
      mechanic: 'odd-one-out',
      inputMode: 'choice',
      measuredSignals: ['time_to_interaction', 'correct'],
    },
    explanation: {
      title: 'Shared rule',
      body: 'Three are even numbers; seven is the odd one.',
    },
    config: {
      items: [
        { id: 'a', label: '4' },
        { id: 'b', label: '8' },
        { id: 'c', label: '7' },
        { id: 'd', label: '12' },
      ],
      oddItemId: 'c',
      timeLimitMs: 12_000,
      ...overrides,
    },
  };
}

function startContext(
  overrides: Partial<CardStartContext> = {},
): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

function renderCard(opts: { card?: OddOneOutCardType; now?: () => number } = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <OddOneOutCard
      card={opts.card ?? oddOneOutCard()}
      context={startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const pickItem = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`ooo-item-${id}`)));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('initial render', () => {
  it('renders the prompt and every item', () => {
    renderCard({ now: () => 1_000 });
    expect(screen.getByTestId('ooo-prompt')).toHaveTextContent(
      'Tap the one that does not belong.',
    );
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(screen.getByTestId(`ooo-item-${id}`)).toBeInTheDocument();
    }
  });
});

describe('picking the odd item', () => {
  it('resolves correct with the right signals', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 2_500;
    pickItem('c');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.interactionElapsedMs).toBe(1_500);
    expect(resolution.signals.selected_item_id).toBe('c');
    expect(resolution.signals.distractor_item_id).toBe('');
  });
});

describe('picking a belonging item', () => {
  it('resolves incorrect and records the distractor', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    pickItem('a');

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.selected_item_id).toBe('a');
    expect(resolution.signals.distractor_item_id).toBe('a');
  });

  it('ignores picks after the card has resolved', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 2_000;
    pickItem('a');
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 3_000;
    pickItem('c');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('timeout', () => {
  it('resolves timeout when no pick is made', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    act(() => void vi.advanceTimersByTime(11_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 13_000;
    act(() => void vi.advanceTimersByTime(1));

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.time_to_interaction).toBe(-1);
    expect(onAttempt).not.toHaveBeenCalled();
  });
});
