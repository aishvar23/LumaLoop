/**
 * Tests for the RN result card's GAME-POINTS chip (Phase 4). The rest of
 * CardFeedback (outcome word, explanation) is covered via FeedbackGate.test.tsx;
 * here we focus on the new score chip — shown only when a score is supplied, with
 * GAME-POINTS copy (no ability/IQ/trait language).
 */

import { render, screen } from '@testing-library/react-native';

import CardFeedback from './CardFeedback';
import type { CardResolution, ResolutionType } from '../core/templates/contract';

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

describe('CardFeedback score chip (RN)', () => {
  it('omits the chip when no score is supplied', () => {
    render(
      <CardFeedback resolution={makeResolution('correct')} explanation={explanation} />,
    );
    expect(screen.queryByTestId('card-score')).toBeNull();
  });

  it('shows points + streak/combo on a correct resolution', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        cardScore={{ points: 132, correct: true, streak: 3, combo: 1.2 }}
      />,
    );
    expect(screen.getByText('+132 pts')).toBeTruthy();
    const streak = screen.getByTestId('card-score-streak');
    expect(streak.props.children).toContain('3 streak');
    expect(streak.props.children).toContain('×1.2 combo');
  });

  it('omits the streak line at streak 1', () => {
    render(
      <CardFeedback
        resolution={makeResolution('correct')}
        explanation={explanation}
        cardScore={{ points: 100, correct: true, streak: 1, combo: 1 }}
      />,
    );
    expect(screen.getByText('+100 pts')).toBeTruthy();
    expect(screen.queryByTestId('card-score-streak')).toBeNull();
  });

  it('shows a neutral "Streak reset" on a miss, with no points', () => {
    render(
      <CardFeedback
        resolution={makeResolution('incorrect')}
        explanation={explanation}
        cardScore={{ points: 0, correct: false, streak: 0, combo: 1 }}
      />,
    );
    expect(screen.getByTestId('card-score-reset')).toBeTruthy();
    expect(screen.queryByText(/pts/)).toBeNull();
  });
});
