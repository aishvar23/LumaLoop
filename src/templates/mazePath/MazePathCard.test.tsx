import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MazePathCard as MazePathCardType } from '../../cards/types';
import MazePathCard from './MazePathCard';

/** A 3×3 all-open maze: start top-left (0), exit bottom-right (8). */
function card(timeLimitMs = 20000): MazePathCardType {
  return {
    cardId: 'maze-1',
    creatorHandle: '@mazerunner',
    templateType: 'maze_path',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Tap your way through the open squares from the start to the exit.',
    puzzleDna: {
      mechanic: 'route-finding',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: { title: 'Route', body: 'Step to an adjacent open square.' },
    config: {
      rows: 3,
      columns: 3,
      cells: [
        'open',
        'open',
        'open',
        'open',
        'open',
        'open',
        'open',
        'open',
        'open',
      ],
      startIndex: 0,
      exitIndex: 8,
      timeLimitMs,
    },
  };
}

const context = {
  sessionId: 's',
  cardIndex: 0,
  activeAtMs: 0,
  interactionEnabledAtMs: 0,
};

describe('MazePathCard', () => {
  it('renders every cell and starts on the start cell', () => {
    render(
      <MazePathCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId('maze-cell-0')).toBeInTheDocument();
    expect(screen.getByTestId('maze-cell-8')).toBeInTheDocument();
    expect(screen.getByTestId('maze-cell-0')).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('moves to an adjacent open cell when tapped', () => {
    render(
      <MazePathCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('maze-cell-1'));
    expect(screen.getByTestId('maze-cell-1')).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('does NOT move or resolve when tapping a non-adjacent cell', () => {
    const onResolve = vi.fn();
    render(
      <MazePathCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
      />,
    );
    // index 8 is not adjacent to start index 0.
    fireEvent.click(screen.getByTestId('maze-cell-8'));
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByTestId('maze-cell-0')).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('fires onAttempt once on the first tap', () => {
    const onAttempt = vi.fn();
    render(
      <MazePathCard
        card={card()}
        context={context}
        onAttempt={onAttempt}
        onResolve={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('maze-cell-1'));
    fireEvent.click(screen.getByTestId('maze-cell-2'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves CORRECT after walking the path to the exit', () => {
    const onResolve = vi.fn();
    render(
      <MazePathCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    // Path 0 -> 1 -> 2 -> 5 -> 8.
    fireEvent.click(screen.getByTestId('maze-cell-1'));
    fireEvent.click(screen.getByTestId('maze-cell-2'));
    fireEvent.click(screen.getByTestId('maze-cell-5'));
    fireEvent.click(screen.getByTestId('maze-cell-8'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
      signals: { reached_exit: true, steps: 4 },
    });
  });

  it('resolves TIMEOUT when the clock runs out before reaching the exit', () => {
    vi.useFakeTimers();
    try {
      const onResolve = vi.fn();
      render(
        <MazePathCard
          card={card(20000)}
          context={context}
          onAttempt={vi.fn()}
          onResolve={onResolve}
        />,
      );
      act(() => vi.advanceTimersByTime(20000));
      expect(onResolve.mock.calls[0][0]).toMatchObject({
        resolutionType: 'timeout',
        isCorrect: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
