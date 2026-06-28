import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MemoryMatchCard as MemoryMatchCardType } from '../../core/cards/types';
import type { CardResolution } from '../../core/templates/contract';
import MemoryMatchCard from './MemoryMatchCard';

/** A 2×2 board: tiles a1/a2 share pairKey 'a', b1/b2 share pairKey 'b'. */
function card(timeLimitMs = 20000): MemoryMatchCardType {
  return {
    cardId: 'mm-1',
    creatorHandle: '@memomatch',
    templateType: 'memory_match',
    category: 'working_memory',
    difficulty: 'extremely_easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Flip the tiles two at a time to find the matching pairs.',
    puzzleDna: {
      mechanic: 'pair-recall',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: { title: 'Pairs', body: 'Two tiles share a shape.' },
    config: {
      rows: 2,
      columns: 2,
      tiles: [
        { id: 'a1', pairKey: 'a', glyph: '●' },
        { id: 'b1', pairKey: 'b', glyph: '■' },
        { id: 'a2', pairKey: 'a', glyph: '●' },
        { id: 'b2', pairKey: 'b', glyph: '■' },
      ],
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

it('renders all tiles hidden ("?") at the start', () => {
  render(
    <MemoryMatchCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );
  expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('?');
});

it('keeps a matching pair shown and resolves CORRECT when the board is cleared', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <MemoryMatchCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      now={() => 1000}
    />,
  );
  fireEvent.press(screen.getByTestId('mm-tile-a1'));
  fireEvent.press(screen.getByTestId('mm-tile-a2'));
  expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('●');
  expect(onResolve).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId('mm-tile-b1'));
  fireEvent.press(screen.getByTestId('mm-tile-b2'));
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'correct',
    isCorrect: true,
    signals: { pairs: 2, total_pairs: 2 },
  });
});

it('flips a non-matching pair back after 700ms', () => {
  jest.useFakeTimers();
  try {
    render(
      <MemoryMatchCard
        card={card()}
        context={context}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
        now={() => 1000}
      />,
    );
    fireEvent.press(screen.getByTestId('mm-tile-a1'));
    fireEvent.press(screen.getByTestId('mm-tile-b1'));
    expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('●');
    expect(screen.getByTestId('mm-tile-b1')).toHaveTextContent('■');
    act(() => jest.advanceTimersByTime(700));
    expect(screen.getByTestId('mm-tile-a1')).toHaveTextContent('?');
    expect(screen.getByTestId('mm-tile-b1')).toHaveTextContent('?');
  } finally {
    jest.useRealTimers();
  }
});

it('resolves TIMEOUT when the clock runs out before the board is cleared', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    render(
      <MemoryMatchCard
        card={card(12000)}
        context={context}
        onAttempt={jest.fn()}
        onResolve={onResolve}
      />,
    );
    act(() => jest.advanceTimersByTime(12000));
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'timeout',
      isCorrect: false,
    });
  } finally {
    jest.useRealTimers();
  }
});
