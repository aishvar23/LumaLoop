import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MatrixReasoningCard as MatrixReasoningCardType } from '../../core/cards/types';
import type { CardResolution } from '../../core/templates/contract';
import MatrixReasoningCard from './MatrixReasoningCard';

function card(): MatrixReasoningCardType {
  return {
    cardId: 'matrix-1',
    creatorHandle: '@test',
    templateType: 'matrix_reasoning',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Pick the shape that completes the pattern.',
    puzzleDna: {
      mechanic: 'visual-pattern-completion',
      inputMode: 'choice',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 'Pattern', body: 'Each row adds one shape.' },
    config: {
      grid: ['●', '●●', '●●●', '■', '■■', '■■■', '▲', '▲▲', null],
      options: [
        { id: 'opt-a', glyph: '▲▲▲' },
        { id: 'opt-b', glyph: '▲▲' },
        { id: 'opt-c', glyph: '●●●' },
      ],
      correctOptionId: 'opt-a',
      timeLimitMs: 20000,
    },
  };
}

const context = {
  sessionId: 's',
  cardIndex: 0,
  activeAtMs: 0,
  interactionEnabledAtMs: 0,
};

it('renders the grid with a missing cell and the options', () => {
  render(
    <MatrixReasoningCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );
  expect(screen.getByTestId('mx-blank')).toBeOnTheScreen();
  expect(screen.getByTestId('mx-option-opt-a')).toBeOnTheScreen();
});

it('resolves CORRECT when the completing option is picked', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <MatrixReasoningCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      now={() => 1000}
    />,
  );
  fireEvent.press(screen.getByTestId('mx-option-opt-a'));
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'correct',
    isCorrect: true,
  });
});

it('resolves INCORRECT and records the distractor on a wrong pick', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <MatrixReasoningCard
      card={card()}
      context={context}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      now={() => 1000}
    />,
  );
  fireEvent.press(screen.getByTestId('mx-option-opt-b'));
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'incorrect',
    signals: { distractor_option_id: 'opt-b' },
  });
});

it('resolves TIMEOUT when the clock runs out with no pick', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    render(
      <MatrixReasoningCard
        card={card()}
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
