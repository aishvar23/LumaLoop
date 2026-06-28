import { fireEvent, render, screen } from '@testing-library/react';

import CardFeedback from './CardFeedback';
import type { CardResolution, ResolutionType } from '../templates/contract';

function makeResolution(resolutionType: ResolutionType): CardResolution {
  return {
    cardId: 'c1',
    resolutionType,
    isCorrect: resolutionType === 'correct',
    elapsedMs: 1000,
    interactionElapsedMs: 800,
    attemptCount: 1,
    signals: {},
  };
}

const explanation = { title: 'Why', body: 'Because of the rule.' };

describe('CardFeedback', () => {
  it('shows the outcome WORD for each resolution (meaning never colour-only)', () => {
    const cases: Array<[ResolutionType, string]> = [
      ['correct', 'Correct'],
      ['incorrect', 'Not quite'],
      ['timeout', "Time's up"],
    ];
    for (const [type, word] of cases) {
      const { unmount } = render(
        <CardFeedback
          resolution={makeResolution(type)}
          explanation={explanation}
          onContinue={() => {}}
        />,
      );
      expect(screen.getByText(word)).toBeInTheDocument();
      unmount();
    }
  });

  it('shows "Play again" only when onReplay is provided, and fires it', () => {
    const onReplay = vi.fn();
    const { rerender } = render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );
    // Omitted by default (standalone renders/tests).
    expect(screen.queryByTestId('feedback-replay')).not.toBeInTheDocument();

    rerender(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={() => {}}
        onReplay={onReplay}
      />,
    );
    fireEvent.click(screen.getByTestId('feedback-replay'));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('exposes the machine-readable outcome on the card (data-outcome)', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByTestId('card-feedback')).toHaveAttribute(
      'data-outcome',
      'correct',
    );
  });

  it('renders the authored explanation copy', () => {
    render(
      <CardFeedback
        resolution={makeResolution('incorrect')}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText('Why')).toBeInTheDocument();
    expect(screen.getByText('Because of the rule.')).toBeInTheDocument();
  });

  it('renders a renderer-supplied failure reason above the authored explanation', () => {
    render(
      <CardFeedback
        resolution={{
          ...makeResolution('incorrect'),
          signals: {
            failure_reason:
              'Step 2 (B) was answered Match, but "Tap blue" expected No-match.',
          },
        }}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );

    expect(screen.getByTestId('card-failure-reason')).toHaveTextContent(
      'What went wrong',
    );
    expect(screen.getByTestId('card-failure-reason')).toHaveTextContent(
      'Step 2 (B)',
    );
  });

  it('announces the outcome via a polite live region after mount', async () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );
    // The live region is populated post-mount with the heading + detail.
    expect(await screen.findByText(/Correct\. Nice/)).toBeInTheDocument();
  });

  it('advances only via the Next affordance', () => {
    const onContinue = vi.fn();
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByTestId('feedback-next'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  // ── Phase 4: the GAME-POINTS chip ──────────────────────────────────────────
  it('omits the score chip when no score is supplied (standalone render)', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        onContinue={() => {}}
      />,
    );
    expect(screen.queryByTestId('card-score')).not.toBeInTheDocument();
  });

  it('shows points earned and the streak on a correct resolution', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        cardScore={{ points: 132, correct: true, streak: 3, combo: 1.2 }}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText('+132 pts')).toBeInTheDocument();
    expect(screen.getByTestId('card-score-streak')).toHaveTextContent('3 streak');
    expect(screen.getByTestId('card-score-streak')).toHaveTextContent('×1.2 combo');
  });

  it('does not show a streak/combo line at streak 1', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        cardScore={{ points: 100, correct: true, streak: 1, combo: 1 }}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText('+100 pts')).toBeInTheDocument();
    expect(screen.queryByTestId('card-score-streak')).not.toBeInTheDocument();
  });

  it('shows a neutral "Streak reset" on a miss, with no points (guardrail-safe)', () => {
    render(
      <CardFeedback
        resolution={makeResolution('incorrect')}
        explanation={explanation}
        cardScore={{ points: 0, correct: false, streak: 0, combo: 1 }}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByTestId('card-score-reset')).toHaveTextContent('Streak reset');
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });
});
