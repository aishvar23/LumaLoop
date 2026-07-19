import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CircuitFlowCard as CircuitFlowCardType } from '../../cards/types';
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
    vi.useFakeTimers();
    try {
      const onAttempt = vi.fn();
      render(
        <CircuitFlowCard
          card={card}
          context={context}
          onAttempt={onAttempt}
          onResolve={vi.fn()}
          now={() => 1500}
        />,
      );

      expect(screen.getByTestId('cf-demo-button')).toHaveAttribute(
        'title',
        expect.stringContaining('adds about 5 seconds'),
      );
      fireEvent.click(screen.getByTestId('cf-demo-button'));
      expect(screen.getByRole('dialog')).toHaveAccessibleName(
        'Circuit Flow demonstration',
      );
      expect(onAttempt).not.toHaveBeenCalled();
      expect(screen.getByTestId('cf-demo-source')).toHaveAttribute(
        'data-connected',
        'false',
      );

      act(() => vi.advanceTimersByTime(1200));
      expect(screen.getByTestId('cf-demo-instruction')).toHaveTextContent(
        'Rotate until neighboring wires meet.',
      );
      act(() => vi.advanceTimersByTime(1200));
      expect(screen.getByTestId('cf-demo-instruction')).toHaveTextContent(
        'Connected!',
      );
      act(() => vi.advanceTimersByTime(1200));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('cf-your-turn')).toHaveTextContent('Your turn');
      expect(screen.getByTestId('cf-tile-a')).toHaveAccessibleName(
        'Start, pulse source, tile a, rotation 3',
      );
      expect(onAttempt).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('cf-tile-a'));
      expect(screen.queryByTestId('cf-your-turn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cf-demo-button')).not.toBeInTheDocument();
      expect(onAttempt).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels and highlights the start and end anchors', () => {
    render(
      <CircuitFlowCard
        card={card}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
        now={() => 1500}
      />,
    );

    expect(screen.getByTestId('cf-start-a')).toHaveTextContent('START');
    expect(screen.getByTestId('cf-end-c')).toHaveTextContent('END');
    expect(screen.getByTestId('cf-tile-a')).toHaveAccessibleName(
      'Start, pulse source, tile a, rotation 3',
    );
    expect(screen.getByTestId('cf-tile-c')).toHaveAccessibleName(
      'End, tile c, rotation 0',
    );
  });

  it('rotates tiles and resolves a connected circuit', () => {
    const onAttempt = vi.fn();
    const onResolve = vi.fn();
    render(
      <CircuitFlowCard
        card={card}
        context={context}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => 1500}
      />,
    );
    fireEvent.click(screen.getByTestId('cf-tile-a'));
    fireEvent.click(screen.getByTestId('cf-tile-b'));
    fireEvent.click(screen.getByTestId('cf-tile-b'));
    fireEvent.click(screen.getByTestId('cf-tile-b'));
    fireEvent.click(screen.getByTestId('cf-submit'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, resolutionType: 'correct' }),
    );
  });
});
