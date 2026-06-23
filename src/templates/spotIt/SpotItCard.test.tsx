/**
 * Tests for the Spot It renderer (Azure DevOps #64; Design §9.1; Tech §7, §14).
 *
 * The renderer is driven through React Testing Library with an INJECTED clock
 * and vitest fake timers, so no assertion depends on the real `Date.now()`.
 * Timeout behavior is delegated to the shared `useCardTimer`; here we assert
 * the renderer wires it correctly (advancing fake timers fires a timeout).
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpotItCard as SpotItCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import SpotItCard from './SpotItCard';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function spotItCard(overrides: Partial<SpotItCardType['config']> = {}): SpotItCardType {
  return {
    cardId: 'spot-1',
    creatorHandle: '@test',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 8,
    prompt: 'Tap the one that is different',
    puzzleDna: {
      mechanic: 'single_anomaly_visual_search',
      inputMode: 'tap',
      measuredSignals: ['time_to_first_tap', 'correct_tap', 'elapsed_ms'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 3,
      columns: 4,
      baseElement: 'A7Z',
      anomalyElement: 'A7X',
      anomalyRow: 1,
      anomalyColumn: 2,
      timeLimitMs: 10_000,
      ...overrides,
    },
  };
}

function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_200,
    ...overrides,
  };
}

type RenderOpts = {
  card?: SpotItCardType;
  context?: CardStartContext;
  now?: () => number;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <SpotItCard
      card={opts.card ?? spotItCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const tapCell = (row: number, column: number) =>
  act(() => void fireEvent.click(screen.getByTestId(`spot-cell-${row}-${column}`)));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Grid rendering.
// ---------------------------------------------------------------------------

describe('grid rendering', () => {
  it('renders rows × columns cells with the anomaly in the right cell', () => {
    renderCard();

    // 3 × 4 = 12 cells.
    expect(screen.getAllByRole('button')).toHaveLength(12);

    // Every non-anomaly cell shows the base element; the anomaly cell shows the
    // anomaly glyph — the difference is the GLYPH, never colour (colour-blind safe).
    const anomaly = screen.getByTestId('spot-cell-1-2');
    expect(anomaly).toHaveTextContent('A7X');

    const ordinary = screen.getByTestId('spot-cell-0-0');
    expect(ordinary).toHaveTextContent('A7Z');

    // Accessible label carries position + content, not colour.
    expect(anomaly).toHaveAccessibleName('Row 2, column 3: A7X');
  });

  it('uses a compact, shrink-safe grid for six-column boards', () => {
    renderCard({
      card: spotItCard({ columns: 6, anomalyColumn: 5 }),
    });

    expect(screen.getByRole('group')).toHaveStyle({
      gap: 'var(--space-1)',
      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    });
    expect(screen.getByTestId('spot-cell-0-5')).toBeInTheDocument();
  });

  it('shrinks two-character code glyphs below the single-glyph size', () => {
    renderCard({
      card: spotItCard({
        rows: 1,
        columns: 2,
        baseElement: 'M7',
        anomalyElement: 'MN',
        anomalyRow: 0,
        anomalyColumn: 1,
      }),
    });

    const ordinaryText = screen.getByTestId('spot-cell-0-0').querySelector('span');
    const anomalyText = screen.getByTestId('spot-cell-0-1').querySelector('span');
    expect(ordinaryText).toHaveStyle({
      fontSize: 'clamp(0.9rem, 4.2vw, 1.25rem)',
      letterSpacing: '-0.02em',
    });
    expect(anomalyText).toHaveStyle({
      fontSize: 'clamp(0.9rem, 4.2vw, 1.25rem)',
      letterSpacing: '-0.02em',
    });
  });

  it('shrinks three-character code glyphs aggressively so they fit inside each tile', () => {
    renderCard({
      card: spotItCard({
        rows: 1,
        columns: 2,
        baseElement: 'M7N',
        anomalyElement: 'MN7',
        anomalyRow: 0,
        anomalyColumn: 1,
      }),
    });

    const ordinaryText = screen.getByTestId('spot-cell-0-0').querySelector('span');
    const anomalyText = screen.getByTestId('spot-cell-0-1').querySelector('span');
    expect(ordinaryText).toHaveStyle({
      fontSize: 'clamp(0.72rem, 3.4vw, 0.95rem)',
      letterSpacing: '-0.04em',
    });
    expect(anomalyText).toHaveStyle({
      fontSize: 'clamp(0.72rem, 3.4vw, 0.95rem)',
      letterSpacing: '-0.04em',
    });
  });
});

// ---------------------------------------------------------------------------
// Correct tap.
// ---------------------------------------------------------------------------

describe('tapping the anomaly', () => {
  it('resolves correct with the documented signals and no false taps', () => {
    let clock = 1_200;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_200; // 2_000ms after interaction enabled
    tapCell(1, 2);

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('spot-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);
    expect(resolution.elapsedMs).toBe(2_200); // 3_200 - activeAt 1_000
    expect(resolution.interactionElapsedMs).toBe(2_000); // 3_200 - 1_200

    expect(resolution.signals.correct_tap).toBe(true);
    expect(resolution.signals.false_taps).toBe(0);
    expect(resolution.signals.time_to_first_tap).toBe(2_000);
    expect(resolution.signals.elapsed).toBe(2_000);
  });

  it('fires onAttempt exactly once even across multiple taps', () => {
    let clock = 1_200;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    tapCell(0, 0); // false tap — first input
    clock = 1_800;
    tapCell(0, 1); // another false tap
    clock = 2_000;
    tapCell(1, 2); // correct

    expect(onAttempt).toHaveBeenCalledTimes(1);
    // time_to_first_tap is captured from the FIRST tap (300ms), not the correct one.
    expect(onAttempt).toHaveBeenCalledWith({ time_to_first_tap: 300 });
    expect(lastResolution(onResolve).signals.time_to_first_tap).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// False taps (Design §9.1: counted, not fatal).
// ---------------------------------------------------------------------------

describe('tapping a wrong cell', () => {
  it('records a false tap and does NOT resolve, then resolves on the anomaly', () => {
    let clock = 1_200;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_400;
    tapCell(0, 0); // wrong
    clock = 1_600;
    tapCell(2, 3); // wrong
    // No resolution yet: false taps keep the card in play.
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('2 incorrect taps');

    clock = 1_900;
    tapCell(1, 2); // correct
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.signals.false_taps).toBe(2);
    expect(resolution.signals.correct_tap).toBe(true);
  });

  it('announces a single false tap with singular copy', () => {
    renderCard({ now: () => 1_200 });
    tapCell(0, 0);
    expect(screen.getByRole('status')).toHaveTextContent('1 incorrect tap');
  });
});

// ---------------------------------------------------------------------------
// Timeout path is delegated to the shared hook.
// ---------------------------------------------------------------------------

describe('timeout', () => {
  it('resolves via useCardTimer when the per-card timer expires', () => {
    let clock = 1_200;
    const { onResolve } = renderCard({
      context: startContext({ activeAtMs: 1_000, interactionEnabledAtMs: 1_200 }),
      now: () => clock,
    });

    // Player makes one false tap, then never finds the anomaly.
    clock = 2_200;
    tapCell(0, 0);

    // Advance to the card's timeLimitMs (10_000) — the hook fires the timeout.
    clock = 11_000;
    act(() => void vi.advanceTimersByTime(10_000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.correct_tap).toBe(false);
    expect(resolution.signals.false_taps).toBe(1);
    expect(resolution.signals.time_to_first_tap).toBe(1_000); // 2_200 - 1_200
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_200;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 2_000;
    tapCell(1, 2); // correct, disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1); // no second resolution
  });
});

// ---------------------------------------------------------------------------
// Post-resolution taps are inert (no false_taps, no live-region change).
// ---------------------------------------------------------------------------

describe('taps after the card has resolved', () => {
  it('ignores taps after a correct resolution (no false_taps, no announce)', () => {
    let clock = 1_200;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 2_000;
    tapCell(1, 2); // correct — card is now resolved
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(lastResolution(onResolve).signals.false_taps).toBe(0);

    // A wrong tap after resolution must be a no-op.
    clock = 2_500;
    tapCell(0, 0);

    expect(onResolve).toHaveBeenCalledTimes(1); // still just the one resolution
    expect(screen.getByRole('status')).toHaveTextContent(''); // no "incorrect tap"
  });

  it('ignores taps after a timeout resolution', () => {
    let clock = 1_200;
    const { onResolve } = renderCard({ now: () => clock });

    // Time the card out without ever finding the anomaly.
    clock = 11_200;
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(lastResolution(onResolve).resolutionType).toBe('timeout');

    // A tap after timeout must not increment false_taps or re-announce.
    clock = 11_500;
    tapCell(0, 0);

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
