import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MazePathCard as MazePathCardType } from '../../core/cards/types';
import type { CardResolution } from '../../core/templates/contract';
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

it('renders every cell', () => {
  render(
    <MazePathCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );
  expect(screen.getByTestId('maze-cell-0')).toBeOnTheScreen();
  expect(screen.getByTestId('maze-cell-8')).toBeOnTheScreen();
});

it('does NOT resolve when tapping a non-adjacent cell', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <MazePathCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={onResolve}
    />,
  );
  // index 8 is not adjacent to start index 0.
  fireEvent.press(screen.getByTestId('maze-cell-8'));
  expect(onResolve).not.toHaveBeenCalled();
});

it('resolves CORRECT after walking the path to the exit', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <MazePathCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      now={() => 1000}
    />,
  );
  // Path 0 -> 1 -> 2 -> 5 -> 8.
  fireEvent.press(screen.getByTestId('maze-cell-1'));
  fireEvent.press(screen.getByTestId('maze-cell-2'));
  fireEvent.press(screen.getByTestId('maze-cell-5'));
  fireEvent.press(screen.getByTestId('maze-cell-8'));
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'correct',
    isCorrect: true,
    signals: { reached_exit: true, steps: 4 },
  });
});

it('resolves TIMEOUT when the clock runs out before reaching the exit', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    render(
      <MazePathCard
        card={card(20000)}
        context={context}
        onAttempt={jest.fn()}
        onResolve={onResolve}
      />,
    );
    act(() => jest.advanceTimersByTime(20000));
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'timeout',
      isCorrect: false,
    });
  } finally {
    jest.useRealTimers();
  }
});
