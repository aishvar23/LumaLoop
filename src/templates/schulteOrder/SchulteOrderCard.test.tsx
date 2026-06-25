/**
 * Tests for the Schulte Order renderer (Design §9; Tech §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers. Schulte Order is a single-phase, MULTI-TAP timed scan: correct in-order
 * taps advance progress, wrong taps are non-fatal errors, completing the order
 * resolves correct, and the timeout path (carrying progress) is delegated to the
 * shared useCardTimer. Resolution is latched per slide.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchulteOrderCard as SchulteOrderCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import SchulteOrderCard from './SchulteOrderCard';

function schulteCard(
  overrides: Partial<SchulteOrderCardType['config']> = {},
): SchulteOrderCardType {
  return {
    cardId: 'schulte-1',
    creatorHandle: '@test',
    templateType: 'schulte_order',
    category: 'processing_speed',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Tap 1 to 4 in order, as fast as you can.',
    puzzleDna: {
      mechanic: 'schulte-scan',
      inputMode: 'tap',
      measuredSignals: ['progress', 'errors', 'time_to_interaction'],
    },
    explanation: { title: 'Order', body: 'Scan and tap ascending.' },
    config: {
      rows: 2,
      columns: 2,
      targets: [
        { id: 't1', label: '1', row: 1, column: 1 },
        { id: 't2', label: '2', row: 0, column: 0 },
        { id: 't3', label: '3', row: 1, column: 0 },
        { id: 't4', label: '4', row: 0, column: 1 },
      ],
      timeLimitMs: 20_000,
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

function renderCard(
  opts: {
    card?: SchulteOrderCardType;
    now?: () => number;
    isActive?: boolean;
  } = {},
) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <SchulteOrderCard
      card={opts.card ?? schulteCard()}
      context={startContext()}
      isActive={opts.isActive}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const tapTarget = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`schulte-target-${id}`)));

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
  it('renders every target at its scattered position', () => {
    renderCard({ now: () => 1_000 });
    for (const id of ['t1', 't2', 't3', 't4']) {
      expect(screen.getByTestId(`schulte-target-${id}`)).toBeInTheDocument();
    }
  });

  it('does NOT telegraph the next target (no "tap this next" hint)', () => {
    renderCard({ now: () => 1_000 });
    // Every untapped target is labelled by its value alone — the renderer must
    // never reveal which cell is expected next (that would defeat the search).
    for (const [id, label] of [
      ['t1', '1'],
      ['t2', '2'],
      ['t3', '3'],
      ['t4', '4'],
    ] as const) {
      expect(screen.getByTestId(`schulte-target-${id}`)).toHaveAttribute(
        'aria-label',
        label,
      );
    }
    // No "▸" marker is rendered anywhere.
    expect(screen.queryByText(/▸/)).not.toBeInTheDocument();
  });

  it('marks a correctly-tapped target as done (fair feedback, not a hint)', () => {
    renderCard({ now: () => 1_000 });
    tapTarget('t1');
    expect(screen.getByTestId('schulte-target-t1')).toHaveAttribute(
      'aria-label',
      '1: tapped',
    );
    expect(screen.getByTestId('schulte-target-t1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The next target is still NOT telegraphed after a correct tap.
    expect(screen.getByTestId('schulte-target-t2')).toHaveAttribute(
      'aria-label',
      '2',
    );
  });
});

describe('tapping in order', () => {
  it('resolves correct once every target is tapped in order', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    tapTarget('t1');
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();

    tapTarget('t2');
    tapTarget('t3');
    clock = 4_000;
    tapTarget('t4');

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.signals.progress).toBe(4);
    expect(resolution.signals.errors).toBe(0);
    expect(resolution.interactionElapsedMs).toBe(3_000);
  });

  it('counts an out-of-order tap as a non-fatal error and stays correct', () => {
    const clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    tapTarget('t2'); // error — expected t1
    tapTarget('t1');
    tapTarget('t2');
    tapTarget('t3');
    tapTarget('t4');

    const resolution = lastResolution(onResolve);
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.signals.errors).toBe(1);
    expect(resolution.signals.progress).toBe(4);
  });
});

describe('isActive gating', () => {
  it('does not engage while pre-mounted off-screen', () => {
    const { onAttempt, onResolve } = renderCard({
      now: () => 1_000,
      isActive: false,
    });
    tapTarget('t1');
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });
});

describe('timeout', () => {
  it('resolves timeout carrying the partial progress', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    tapTarget('t1');
    tapTarget('t2');

    act(() => void vi.advanceTimersByTime(19_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 21_000; // activeAt 1_000 + 20_000
    act(() => void vi.advanceTimersByTime(1));

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.progress).toBe(2);
    expect(resolution.signals.target_count).toBe(4);
  });

  it('does not fire a late timeout after completion', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    tapTarget('t1');
    tapTarget('t2');
    tapTarget('t3');
    tapTarget('t4');
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
