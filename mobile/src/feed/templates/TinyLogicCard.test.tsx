/**
 * Tests for the native Tiny Logic renderer (ADO #128; #133). Single-phase multiple
 * choice: a correct pick resolves CORRECT, a wrong pick resolves INCORRECT and
 * records the distractor, `onAttempt` fires once with TTI, and the time limit
 * resolves TIMEOUT. Correctness + distractor come from the pure evaluator.
 *
 * #133: the renderer NO LONGER reveals the card's explanation itself (that is the
 * feed-level FeedbackGate's uniform job now), so no `tl-explanation` and no
 * `onExplanationViewed` from the renderer on any outcome.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { TinyLogicCard as TinyLogicCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import TinyLogicCard from './TinyLogicCard';

const ACTIVE_AT = 1000;

function makeCard(): TinyLogicCardType {
  return {
    cardId: 'tl-1',
    creatorHandle: '@logic',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Solve it',
    puzzleDna: { mechanic: 'deduce', inputMode: 'choice', measuredSignals: [] },
    explanation: { title: 'Here is why', body: 'The middle one follows.' },
    config: {
      stem: 'Which comes next?',
      options: [
        { id: 'opt-a', label: 'Alpha' },
        { id: 'opt-b', label: 'Beta' },
        { id: 'opt-c', label: 'Gamma' },
      ],
      correctOptionId: 'opt-b',
      timeLimitMs: 1000,
    },
  };
}

function context(): CardStartContext {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

it('resolves CORRECT (no in-renderer explanation) and fires onAttempt once with TTI', () => {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  let t = ACTIVE_AT;
  render(
    <TinyLogicCard
      card={makeCard()}
      context={context()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      onExplanationViewed={onExplanationViewed}
      now={() => t}
    />,
  );

  t = ACTIVE_AT + 350;
  fireEvent.press(screen.getByTestId('tl-option-opt-b'));

  expect(onAttempt).toHaveBeenCalledTimes(1);
  expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 350 });
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'correct',
    isCorrect: true,
    signals: { selected_option_id: 'opt-b', distractor_option_id: '' },
  });
  // The renderer never reveals the explanation itself, nor fires the seam (#133) —
  // the feed-level FeedbackGate owns the uniform explanation step.
  expect(screen.queryByTestId('tl-explanation')).toBeNull();
  expect(onExplanationViewed).not.toHaveBeenCalled();
});

it('resolves INCORRECT on a wrong pick, records the distractor, and shows no in-renderer explanation', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  let t = ACTIVE_AT;
  render(
    <TinyLogicCard
      card={makeCard()}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      onExplanationViewed={onExplanationViewed}
      now={() => t}
    />,
  );

  fireEvent.press(screen.getByTestId('tl-option-opt-c'));

  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({
    resolutionType: 'incorrect',
    isCorrect: false,
    signals: { selected_option_id: 'opt-c', distractor_option_id: 'opt-c' },
  });
  // #133: the renderer no longer reveals the explanation or fires the seam — that
  // is the uniform FeedbackGate's job now (covered in FeedbackGate.test.tsx).
  expect(screen.queryByTestId('tl-explanation')).toBeNull();
  expect(screen.queryByText('Here is why')).toBeNull();
  expect(onExplanationViewed).not.toHaveBeenCalled();

  // A second tap on a finished card is inert.
  fireEvent.press(screen.getByTestId('tl-option-opt-b'));
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onExplanationViewed).not.toHaveBeenCalled();
});

it('resolves TIMEOUT when the time limit elapses with no selection', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <TinyLogicCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    t = ACTIVE_AT + 1000;
    act(() => jest.advanceTimersByTime(1000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
