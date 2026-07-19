/**
 * Tests for the Memory Sequence renderer (Azure DevOps #137; Tech §7, §10, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers, so no assertion depends on the real `Date.now()`. Fake timers drive
 * BOTH the renderer-owned WATCH animation (the flash schedule + the
 * watch→reproduce transition) and the shared `useCardTimer` countdown, while the
 * injected `now` supplies the measured-time math.
 *
 * The key timing contract (Design §9.2 parity; Tech §7, §10): the controller
 * sets `interactionEnabledAtMs === activeAtMs`, so the RENDERER owns the
 * watch→reproduce transition. Time-to-interaction and `interactionElapsedMs`
 * must be measured from the renderer's OWN reproduce-phase start (EXCLUDING the
 * watch window), and `timeLimitMs` must cover the reproduce phase only.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemorySequenceCard as MemorySequenceCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import MemorySequenceCard from './MemorySequenceCard';

// ---------------------------------------------------------------------------
// Fixtures. A 2×2 grid with a two-step sequence keeps the tap math tiny; the
// catalog enforces the 3–6 length, but the renderer is length-agnostic.
// ---------------------------------------------------------------------------

const FLASH_MS = 500;
const GAP_MS = 200;
// Watch animation total = length * (flashMs + gapMs); 2 * 700 = 1400ms.
const WATCH_MS = 2 * (FLASH_MS + GAP_MS);

function memorySequenceCard(
  overrides: Partial<MemorySequenceCardType['config']> = {},
): MemorySequenceCardType {
  return {
    cardId: 'ms-1',
    creatorHandle: '@test',
    templateType: 'memory_sequence',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Reproduce the order',
    puzzleDna: {
      mechanic: 'sequence-recall',
      inputMode: 'sequence',
      measuredSignals: ['recall', 'accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 2,
      columns: 2,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
      ],
      flashMs: FLASH_MS,
      gapMs: GAP_MS,
      timeLimitMs: 8_000,
      ...overrides,
    },
  };
}

function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

type RenderOpts = {
  card?: MemorySequenceCardType;
  context?: CardStartContext;
  now?: () => number;
  isActive?: boolean;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <MemorySequenceCard
      card={opts.card ?? memorySequenceCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
      isActive={opts.isActive}
    />,
  );
  return { onAttempt, onResolve };
}

/** Run the WATCH animation to completion, entering the reproduce phase. */
const advanceWatch = () => act(() => void vi.advanceTimersByTime(WATCH_MS));

const tapTile = (row: number, column: number) =>
  act(() => void fireEvent.click(screen.getByTestId(`ms-tile-${row}-${column}`)));

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
// Watch phase: non-interactive; tiles flash; reproduce tiles not yet mounted.
// ---------------------------------------------------------------------------

describe('watch phase', () => {
  it('is non-interactive — no buttons exist and nothing resolves', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    // The watch grid is shown as plain cells, never buttons.
    expect(screen.getByTestId('ms-watch-tile-0-0')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Reproduce tiles are not mounted during the watch phase.
    expect(screen.queryByTestId('ms-tile-0-0')).not.toBeInTheDocument();

    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('flashes the sequence tiles in order while active', () => {
    renderCard({ now: () => 1_000 });

    // Into the first flash window: the first sequence tile (0,0) is lit.
    act(() => void vi.advanceTimersByTime(FLASH_MS / 2));
    expect(screen.getByTestId('ms-watch-tile-0-0')).toHaveAttribute('data-lit', 'true');
    expect(screen.getByTestId('ms-watch-tile-1-1')).not.toHaveAttribute('data-lit');

    // Into the second flash window: now the second sequence tile (1,1) is lit.
    act(() => void vi.advanceTimersByTime(FLASH_MS + GAP_MS));
    expect(screen.getByTestId('ms-watch-tile-1-1')).toHaveAttribute('data-lit', 'true');
    expect(screen.getByTestId('ms-watch-tile-0-0')).not.toHaveAttribute('data-lit');
  });

  it('reveals the tappable reproduce grid after the watch animation', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000; // reproduce phase begins here
    advanceWatch();

    // Reproduce tiles are now mounted as real buttons; watch cells are gone.
    expect(screen.getByTestId('ms-tile-0-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ms-watch-tile-0-0')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(4); // 2×2 grid
  });

  it('uses a compact centered grid for five-row memory boards so the last row stays visible', () => {
    renderCard({
      card: memorySequenceCard({
        rows: 5,
        columns: 4,
        sequence: [
          { row: 0, column: 0 },
          { row: 4, column: 3 },
        ],
      }),
    });

    expect(screen.getByTestId('ms-watch-grid')).toHaveStyle({
      maxWidth: '22.5rem',
      marginInline: 'auto',
      gap: 'var(--space-1)',
      padding: 'var(--space-1)',
      gridTemplateColumns: 'repeat(4, 1fr)',
    });
    expect(screen.getByTestId('ms-watch-tile-4-3')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// isActive gates the watch phase — an off-screen card does not flash or advance.
// ---------------------------------------------------------------------------

describe('isActive gating', () => {
  it('does not run the watch animation or enter reproduce while inactive', () => {
    renderCard({ now: () => 1_000, isActive: false });

    // Even after well past the watch duration, nothing has flashed…
    act(() => void vi.advanceTimersByTime(WATCH_MS * 10));
    expect(screen.getByTestId('ms-watch-tile-0-0')).not.toHaveAttribute('data-lit');
    expect(screen.getByTestId('ms-watch-tile-1-1')).not.toHaveAttribute('data-lit');
    // …and the card never transitioned to the reproduce phase.
    expect(screen.queryByTestId('ms-tile-0-0')).not.toBeInTheDocument();
  });

  it('starts the watch ONLY on activation, then reproduce works (no blank grid)', () => {
    // The feed BLOCKER repro: a slide pre-mounted off-screen (isActive=false)
    // must hold in the watch state. If it ran the sequence early, the user would
    // swipe to a blank, unsolvable reproduce grid.
    let clock = 1_000;
    const onAttempt = vi.fn();
    const onResolve = vi.fn();
    const card = memorySequenceCard();
    const props = {
      card,
      context: startContext(),
      onAttempt,
      onResolve,
      now: () => clock,
    };
    const { rerender } = render(<MemorySequenceCard {...props} isActive={false} />);

    // Pre-mounted off-screen: even past the full watch window the sequence has
    // not flashed and the card has NOT advanced to reproduce.
    act(() => void vi.advanceTimersByTime(WATCH_MS * 5));
    expect(screen.queryByTestId('ms-tile-0-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('ms-watch-tile-0-0')).not.toHaveAttribute('data-lit');

    // Becomes the active slide: the watch animation now runs from this instant.
    rerender(<MemorySequenceCard {...props} isActive />);
    act(() => void vi.advanceTimersByTime(FLASH_MS / 2));
    expect(screen.getByTestId('ms-watch-tile-0-0')).toHaveAttribute('data-lit', 'true');

    // Run the rest of the watch window → reproduce grid appears (NOT blank).
    clock = 3_000;
    act(() => void vi.advanceTimersByTime(WATCH_MS));
    expect(screen.getByTestId('ms-tile-0-0')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(4); // 2×2 grid

    // And the player can actually solve it after activation.
    clock = 3_500;
    tapTile(0, 0);
    clock = 4_000;
    tapTile(1, 1);
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(lastResolution(onResolve).resolutionType).toBe('correct');
  });
});

// ---------------------------------------------------------------------------
// Reproduce phase: collect taps; correct order resolves correct.
// ---------------------------------------------------------------------------

describe('reproducing the sequence', () => {
  it('resolves correct on an exact ordered reproduction, TTI from reproduce start', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000; // reproduce phase starts here (after the watch window)
    advanceWatch();

    clock = 3_500; // first tap: 500ms into the reproduce phase
    tapTile(0, 0);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 500 });
    expect(onResolve).not.toHaveBeenCalled(); // not done until the full length

    clock = 4_000; // second (final) tap
    tapTile(1, 1);

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('ms-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);

    // `elapsedMs` runs from card start (1_000) and INCLUDES the watch window;
    // `interactionElapsedMs` runs from the reproduce start (3_000) and EXCLUDES
    // it — the two differ by exactly the 2_000ms watch window.
    expect(resolution.elapsedMs).toBe(3_000); // 4_000 - activeAt 1_000
    expect(resolution.interactionElapsedMs).toBe(1_000); // 4_000 - reproduceStart 3_000
    expect(resolution.elapsedMs - resolution.interactionElapsedMs).toBe(2_000);

    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.sequence_length).toBe(2);
    expect(resolution.signals.errors).toBe(0);
    expect(resolution.signals.first_error_step).toBe(-1);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });

  it('fires onAttempt exactly once, on the first tap', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();

    clock = 3_200;
    tapTile(0, 0);
    clock = 3_600;
    tapTile(1, 1); // completes the card

    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves incorrect on a wrong reproduction and flags the first error', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();

    clock = 3_400;
    tapTile(0, 0); // correct first step
    clock = 3_800;
    tapTile(0, 1); // wrong second step — completes with an error

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.errors).toBe(1);
    expect(resolution.signals.first_error_step).toBe(1);
  });

  it('announces reproduction progress in a polite live region', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('');

    clock = 3_300;
    tapTile(0, 0);
    expect(screen.getByRole('status')).toHaveTextContent('Tapped 1 of 2');
  });

  it('keeps every selected tile colored and numbered during reproduction', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();
    tapTile(0, 0);

    const selected = screen.getByTestId('ms-tile-0-0');
    const untouched = screen.getByTestId('ms-tile-0-1');
    expect(selected).toHaveStyle({
      background: 'var(--accent, var(--color-accent))',
      borderColor: 'var(--accent, var(--color-accent))',
    });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveTextContent('1');
    expect(untouched).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores taps after the card has already resolved', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();

    clock = 3_200;
    tapTile(0, 0);
    clock = 3_400;
    tapTile(1, 1); // resolves correct; card is now latched
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 3_600;
    tapTile(0, 0); // inert — no second resolution, no second attempt
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer; the watch window must not consume it.
// ---------------------------------------------------------------------------

describe('reproduce-phase timeout', () => {
  it('resolves timeout via useCardTimer, with the watch window excluded', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000; // reproduce phase starts; the timer arms for timeLimitMs here
    advanceWatch();

    // Just under the reproduce time limit (8_000): if the watch window had
    // counted against `timeLimitMs`, the timeout would already have fired.
    act(() => void vi.advanceTimersByTime(7_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000; // reproduceStart 3_000 + timeLimit 8_000
    act(() => void vi.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);

    // Interaction elapsed measured from the reproduce start (excludes the watch).
    expect(resolution.interactionElapsedMs).toBe(8_000); // 11_000 - 3_000
    expect(resolution.elapsedMs).toBe(10_000); // 11_000 - activeAt 1_000
    expect(resolution.signals.taps_entered).toBe(0);
    expect(resolution.signals.time_to_interaction).toBe(-1);
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advanceWatch();

    clock = 3_200;
    tapTile(0, 0);
    clock = 3_400;
    tapTile(1, 1); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
