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
});
