import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismPathCard as PrismPathCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import PrismPathCard from './PrismPathCard';

function prismPathCard(
  overrides: Partial<PrismPathCardType['config']> = {},
): PrismPathCardType {
  return {
    cardId: 'pp-1',
    creatorHandle: '@test',
    templateType: 'prism_path',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Route the beam',
    puzzleDna: {
      mechanic: 'mirror-beam-routing',
      inputMode: 'tap',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 4,
      columns: 4,
      entry: { row: 3, column: 0 },
      entryDirection: 'right',
      target: { row: 0, column: 3 },
      mirrors: [
        { id: 'm1', row: 3, column: 2, initialOrientation: 'backslash' },
        { id: 'm2', row: 0, column: 2, initialOrientation: 'backslash' },
      ],
      blockers: [{ row: 1, column: 1 }],
      solution: [
        { mirrorId: 'm1', orientation: 'slash' },
        { mirrorId: 'm2', orientation: 'slash' },
      ],
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
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

function renderCard(opts: {
  card?: PrismPathCardType;
  context?: CardStartContext;
  now?: () => number;
} = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <PrismPathCard
      card={opts.card ?? prismPathCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const rotate = (mirrorId: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`pp-mirror-${mirrorId}`)));

const submit = () =>
  act(() => void fireEvent.click(screen.getByTestId('pp-submit')));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('PrismPathCard', () => {
  it('renders the prompt, mirror grid, and live status', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('pp-prompt')).toHaveTextContent('Route the beam');
    expect(screen.getByTestId('pp-mirror-m1')).toBeInTheDocument();
    expect(screen.getByTestId('pp-mirror-m2')).toBeInTheDocument();
    expect(screen.getByTestId('pp-description-trigger')).toHaveAttribute(
      'title',
      expect.stringContaining('Rotate mirrors to bend the beam'),
    );
    expect(screen.getByTestId('pp-demo-button')).toHaveAttribute(
      'title',
      expect.stringContaining('adds about 5 seconds'),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Beam currently');
  });

  it('plays a separate demo without starting the attempt, then returns to the puzzle', () => {
    const { onAttempt } = renderCard({ now: () => 1_000 });

    fireEvent.click(screen.getByTestId('pp-demo-button'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Prism Path demonstration',
    );
    expect(screen.getByTestId('pp-demo-board')).toBeInTheDocument();
    expect(screen.getByTestId('pp-demo-cell-2:1')).toHaveAttribute(
      'data-beam',
      'true',
    );
    expect(onAttempt).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_300));
    expect(screen.getByTestId('pp-demo-instruction')).toHaveTextContent(
      'still hits a block',
    );
    expect(screen.getByTestId('pp-demo-cell-0:0')).toHaveAttribute(
      'data-beam',
      'true',
    );

    act(() => vi.advanceTimersByTime(1_300));
    expect(screen.getByTestId('pp-demo-instruction')).toHaveTextContent(
      'reaches the star',
    );
    expect(screen.getByTestId('pp-demo-cell-0:3')).toHaveAttribute(
      'data-beam',
      'true',
    );

    act(() => vi.advanceTimersByTime(1_600));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('pp-your-turn')).toHaveTextContent('Your turn');
    expect(onAttempt).not.toHaveBeenCalled();

    rotate('m1');
    expect(screen.queryByTestId('pp-your-turn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pp-demo-button')).not.toBeInTheDocument();
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('fires onAttempt once on the first mirror rotation with TTI', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_250;
    rotate('m1');
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 250 });

    clock = 1_700;
    rotate('m2');
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves correct when the current mirror route reaches the target', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_300;
    rotate('m1');
    rotate('m2');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Beam preview reaches the star',
    );

    clock = 2_400;
    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.elapsedMs).toBe(1_400);
    expect(resolution.interactionElapsedMs).toBe(1_400);
    expect(resolution.attemptCount).toBe(1);
    expect(resolution.signals.reached_target).toBe(true);
    expect(resolution.signals.rotations_used).toBe(2);
    expect(resolution.signals.exit_reason).toBe('hit_target');
    expect(resolution.signals.time_to_interaction).toBe(300);
  });

  it('resolves incorrect when fired before the beam reaches the target', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.reached_target).toBe(false);
    expect(resolution.signals.rotations_used).toBe(0);
  });

  it('ignores late rotations after resolution', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    submit();
    expect(onResolve).toHaveBeenCalledTimes(1);

    rotate('m1');
    rotate('m2');
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('resolves timeout with the live route state', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    rotate('m1');
    act(() => void vi.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000;
    act(() => void vi.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.rotations_used).toBe(1);
    expect(resolution.signals.time_to_interaction).toBe(500);
  });
});
