import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CircuitFlowCard as CircuitFlowCardType } from '../../core/cards/types';
import CircuitFlowCard from './CircuitFlowCard';

const card: CircuitFlowCardType = {
  cardId: 'cf-test',
  creatorHandle: '@test',
  templateType: 'circuit_flow',
  category: 'logical_reasoning',
  difficulty: 'medium',
  evidenceTier: 'mechanic_mapped',
  reviewStatus: 'manual_reviewed',
  estimatedSeconds: 20,
  prompt: 'Connect it',
  puzzleDna: {
    mechanic: 'rotating-network',
    inputMode: 'tap',
    measuredSignals: ['accuracy'],
  },
  explanation: { title: 't', body: 'b' },
  config: {
    rows: 1,
    columns: 3,
    sourceTileId: 'a',
    tiles: [
      {
        id: 'a',
        row: 0,
        column: 0,
        connections: ['right'],
        initialRotation: 3,
      },
      {
        id: 'b',
        row: 0,
        column: 1,
        connections: ['left', 'right'],
        initialRotation: 1,
      },
      { id: 'c', row: 0, column: 2, connections: ['left'], initialRotation: 0 },
    ],
    solution: [
      { tileId: 'a', rotation: 0 },
      { tileId: 'b', rotation: 0 },
      { tileId: 'c', rotation: 0 },
    ],
    timeLimitMs: 10000,
  },
};
const context = {
  sessionId: 's',
  cardIndex: 0,
  activeAtMs: 1000,
  interactionEnabledAtMs: 1000,
};

describe('CircuitFlowCard', () => {
  it('plays a demo without starting the attempt, then returns an untouched puzzle', () => {
    jest.useFakeTimers();
    try {
      const onAttempt = jest.fn();
      render(
        <CircuitFlowCard
          card={card}
          context={context}
          onAttempt={onAttempt}
          onResolve={jest.fn()}
          now={() => 1500}
        />,
      );

      expect(screen.getByTestId('cf-demo-button').props.accessibilityHint).toContain(
        'adds about 5 seconds',
      );
      fireEvent.press(screen.getByTestId('cf-demo-button'));
      expect(screen.getByLabelText('Circuit Flow demonstration')).toBeOnTheScreen();
      expect(onAttempt).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(1200));
      expect(screen.getByTestId('cf-demo-instruction')).toHaveTextContent(
        'Rotate until neighboring wires meet.',
      );
      act(() => jest.advanceTimersByTime(1200));
      expect(screen.getByTestId('cf-demo-instruction')).toHaveTextContent(
        /Connected!/,
      );
      act(() => jest.advanceTimersByTime(1200));

      expect(screen.queryByTestId('cf-demo-instruction')).toBeNull();
      expect(screen.getByTestId('cf-your-turn')).toHaveTextContent(/Your turn/);
      expect(
        screen.getByLabelText('Start, pulse source, tile a, rotation 3'),
      ).toBeOnTheScreen();
      expect(onAttempt).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('cf-tile-a'));
      expect(screen.queryByTestId('cf-your-turn')).toBeNull();
      expect(screen.queryByTestId('cf-demo-button')).toBeNull();
      expect(onAttempt).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('labels and highlights the start and end anchors', () => {
    render(
      <CircuitFlowCard
        card={card}
        context={context}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
        now={() => 1500}
      />,
    );

    expect(screen.getByTestId('cf-start-a')).toHaveTextContent('START');
    expect(screen.getByTestId('cf-end-c')).toHaveTextContent('END');
    expect(
      screen.getByLabelText('Start, pulse source, tile a, rotation 3'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('End, tile c, rotation 0')).toBeOnTheScreen();
  });

  it('rotates and resolves a connected circuit', () => {
    const onAttempt = jest.fn();
    const onResolve = jest.fn();
    render(
      <CircuitFlowCard
        card={card}
        context={context}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => 1500}
      />,
    );
    fireEvent.press(screen.getByTestId('cf-tile-a'));
    fireEvent.press(screen.getByTestId('cf-tile-b'));
    fireEvent.press(screen.getByTestId('cf-tile-b'));
    fireEvent.press(screen.getByTestId('cf-tile-b'));
    fireEvent.press(screen.getByTestId('cf-submit'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, resolutionType: 'correct' }),
    );
  });
});
