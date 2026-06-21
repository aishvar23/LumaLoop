/**
 * Tests for the native Memory Sequence renderer (ADO #140). Covers the
 * renderer-owned WATCH→REPRODUCE transition: the watch grid is non-interactive
 * and gated on `isActive` (an inactive pre-mounted slide never flashes), the
 * reproduce phase collects taps, TTI is measured from reproduce-phase start
 * (EXCLUDING the watch window), a full correct reproduction resolves CORRECT and
 * a wrong one INCORRECT via the pure evaluator (`onAttempt` fires once), and a
 * timeout after the reproduce phase begins resolves TIMEOUT.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { MemorySequenceCard as MemorySequenceCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import MemorySequenceCard from './MemorySequenceCard';

const ACTIVE_AT = 1000;
const FLASH_MS = 600;
const GAP_MS = 300;
const TIME_LIMIT_MS = 12000;

// A 3-tile diagonal on a 3×3 grid. Total watch window = 3 flashes + 3 gaps.
const WATCH_MS = 3 * FLASH_MS + 3 * GAP_MS;

function makeCard(): MemorySequenceCardType {
  return {
    cardId: 'ms-1',
    creatorHandle: '@memory',
    templateType: 'memory_sequence',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Watch, then tap them back in order.',
    puzzleDna: {
      mechanic: 'sequence-recall',
      inputMode: 'sequence',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      rows: 3,
      columns: 3,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
      ],
      flashMs: FLASH_MS,
      gapMs: GAP_MS,
      timeLimitMs: TIME_LIMIT_MS,
    },
  };
}

function context(): CardStartContext {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

/** Drive the WATCH animation to completion, advancing the injected clock. */
function runWatch(): number {
  act(() => jest.advanceTimersByTime(WATCH_MS));
  return ACTIVE_AT + WATCH_MS;
}

it('shows the non-interactive watch grid first (no tile buttons), then mounts the reproduce grid', () => {
  jest.useFakeTimers();
  try {
    let t = ACTIVE_AT;
    render(
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
        now={() => t}
      />,
    );

    // Watch phase: plain cells (watch test ids) present; reproduce buttons NOT.
    expect(screen.getByTestId('ms-watch-tile-0-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('ms-tile-0-0')).toBeNull();

    t = runWatch();

    // Reproduce phase: tappable tiles mounted, watch cells gone.
    expect(screen.getByTestId('ms-tile-2-2')).toBeOnTheScreen();
    expect(screen.queryByTestId('ms-watch-tile-0-0')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('holds the watch while INACTIVE (pre-mounted off-screen) and starts it only on activation', () => {
  jest.useFakeTimers();
  try {
    let t = ACTIVE_AT;
    const props = (isActive: boolean) => (
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        isActive={isActive}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
        now={() => t}
      />
    );

    // Mounted but NOT active: advancing well past the watch window must NOT flip
    // to the reproduce phase — the watch grid is still shown, no tile buttons.
    const { rerender } = render(props(false));
    expect(screen.getByTestId('ms-watch-tile-0-0')).toBeOnTheScreen();

    t = ACTIVE_AT + WATCH_MS * 3;
    act(() => jest.advanceTimersByTime(WATCH_MS * 3));
    expect(screen.getByTestId('ms-watch-tile-0-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('ms-tile-0-0')).toBeNull();

    // Becomes ACTIVE: the watch animation starts now, from this instant.
    rerender(props(true));
    expect(screen.queryByTestId('ms-tile-0-0')).toBeNull();

    // After the watch window FROM ACTIVATION, the reproduce phase begins.
    t = t + WATCH_MS;
    act(() => jest.advanceTimersByTime(WATCH_MS));
    expect(screen.getByTestId('ms-tile-0-0')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('collects taps and resolves CORRECT on a full ordered match, with TTI measured from reproduce start', () => {
  jest.useFakeTimers();
  try {
    const onAttempt = jest.fn();
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    const reproduceStart = runWatch();

    // First tap 300ms into the reproduce phase, then the rest at the same instant.
    t = reproduceStart + 300;
    fireEvent.press(screen.getByTestId('ms-tile-0-0'));
    fireEvent.press(screen.getByTestId('ms-tile-1-1'));
    fireEvent.press(screen.getByTestId('ms-tile-2-2'));

    // onAttempt fires exactly once, with TTI from reproduce start (excludes watch).
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 300 });

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
      interactionElapsedMs: 300,
      signals: { errors: 0, sequence_length: 3, correct: true },
    });
    // elapsedMs runs from card active (includes the watch window).
    expect(resolution.elapsedMs).toBe(WATCH_MS + 300);
  } finally {
    jest.useRealTimers();
  }
});

it('resolves INCORRECT when the reproduced order is wrong', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    t = runWatch();

    // Swap the first two taps so the order is wrong.
    fireEvent.press(screen.getByTestId('ms-tile-1-1'));
    fireEvent.press(screen.getByTestId('ms-tile-0-0'));
    fireEvent.press(screen.getByTestId('ms-tile-2-2'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'incorrect',
      isCorrect: false,
      signals: { correct: false, first_error_step: 0 },
    });

    // A further tap on a finished card is inert.
    fireEvent.press(screen.getByTestId('ms-tile-0-0'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('does not resolve until the full sequence length is entered', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    t = runWatch();

    // Only two of the three taps entered: the card stays open (non-strict UX).
    fireEvent.press(screen.getByTestId('ms-tile-0-0'));
    fireEvent.press(screen.getByTestId('ms-tile-1-1'));
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByTestId('ms-status')).toHaveTextContent('Tapped 2 of 3');
  } finally {
    jest.useRealTimers();
  }
});

it('resolves TIMEOUT when the reproduce-phase time limit elapses with no full reproduction', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <MemorySequenceCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    const reproduceStart = runWatch();
    expect(onResolve).not.toHaveBeenCalled();

    // Let the reproduce-phase time limit elapse with no taps.
    t = reproduceStart + TIME_LIMIT_MS;
    act(() => jest.advanceTimersByTime(TIME_LIMIT_MS));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    // interactionElapsedMs measures the reproduce phase only (excludes the watch).
    expect(resolution.interactionElapsedMs).toBe(TIME_LIMIT_MS);
  } finally {
    jest.useRealTimers();
  }
});
