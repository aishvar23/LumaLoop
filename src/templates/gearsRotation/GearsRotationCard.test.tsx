import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GearsRotationCard as GearsRotationCardType } from '../../cards/types';
import GearsRotationCard from './GearsRotationCard';

function card(): GearsRotationCardType {
  return {
    cardId: 'gears-1',
    creatorHandle: '@test',
    templateType: 'gears_rotation',
    category: 'pattern_recognition',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Which way does the last gear spin?',
    puzzleDna: {
      mechanic: 'gear-direction',
      inputMode: 'choice',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 'Gears', body: 'Meshed gears alternate direction.' },
    config: {
      // gearCount 3, drive cw → 2 meshes (even) → last gear is cw.
      gearCount: 3,
      driveDirection: 'cw',
      options: [
        { id: 'cw', label: 'Clockwise' },
        { id: 'ccw', label: 'Counter-clockwise' },
      ],
      correctOptionId: 'cw',
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

describe('GearsRotationCard', () => {
  it('renders the gear chain with the unknown last gear and the options', () => {
    render(
      <GearsRotationCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId('gr-driver')).toBeInTheDocument();
    expect(screen.getByTestId('gr-last')).toBeInTheDocument();
    expect(screen.getByTestId('gr-option-cw')).toBeInTheDocument();
    expect(screen.getByTestId('gr-option-ccw')).toBeInTheDocument();
  });

  it('resolves CORRECT when the right direction is picked', () => {
    const onResolve = vi.fn();
    render(
      <GearsRotationCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('gr-option-cw'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
    });
  });

  it('resolves INCORRECT and records the distractor on a wrong pick', () => {
    const onResolve = vi.fn();
    render(
      <GearsRotationCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('gr-option-ccw'));
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'incorrect',
      isCorrect: false,
      signals: { distractor_option_id: 'ccw' },
    });
  });

  it('only the FIRST pick resolves (later taps are inert)', () => {
    const onResolve = vi.fn();
    render(
      <GearsRotationCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('gr-option-cw'));
    fireEvent.click(screen.getByTestId('gr-option-ccw'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('resolves TIMEOUT when the clock runs out with no pick', () => {
    vi.useFakeTimers();
    try {
      const onResolve = vi.fn();
      render(
        <GearsRotationCard
          card={card()}
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
