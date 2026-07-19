import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MatrixReasoningCard as MatrixReasoningCardType } from '../../cards/types';
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

describe('MatrixReasoningCard', () => {
  it('renders the grid with a labelled missing cell and the options', () => {
    render(
      <MatrixReasoningCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mx-blank')).toBeInTheDocument();
    expect(screen.getByTestId('mx-option-opt-a')).toBeInTheDocument();
    expect(screen.getByTestId('mx-option-opt-c')).toBeInTheDocument();
  });

  it('resolves CORRECT when the completing option is picked', () => {
    const onResolve = vi.fn();
    render(
      <MatrixReasoningCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('mx-option-opt-a'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'correct',
      isCorrect: true,
    });
  });

  it('resolves INCORRECT and records the distractor on a wrong pick', () => {
    const onResolve = vi.fn();
    render(
      <MatrixReasoningCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('mx-option-opt-b'));
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'incorrect',
      isCorrect: false,
      signals: { distractor_option_id: 'opt-b' },
    });
  });

  it('only the FIRST pick resolves (later taps are inert)', () => {
    const onResolve = vi.fn();
    render(
      <MatrixReasoningCard
        card={card()}
        context={context}
        onAttempt={vi.fn()}
        onResolve={onResolve}
        now={() => 1000}
      />,
    );
    fireEvent.click(screen.getByTestId('mx-option-opt-a'));
    fireEvent.click(screen.getByTestId('mx-option-opt-c'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('resolves TIMEOUT when the clock runs out with no pick', () => {
    vi.useFakeTimers();
    try {
      const onResolve = vi.fn();
      render(
        <MatrixReasoningCard
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
