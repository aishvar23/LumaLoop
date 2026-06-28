/**
 * Tests for the feed-level FeedbackGate (ADO #133). The gate wraps a template
 * renderer and, after EVERY resolution on the active slide, shows the UNIFORM
 * feedback + explanation step — correct, incorrect, AND timeout — while still
 * forwarding the resolution outward and firing the explanation-viewed seam once.
 *
 * The CORRECT/INCORRECT/TIMEOUT cases drive the REAL TinyLogicCard (which used to
 * be silent on a correct answer and revealed its own explanation only on error),
 * proving the gate makes feedback uniform and that the renderer no longer reveals
 * the explanation itself (no `tl-explanation`, shown exactly once via the gate).
 *
 * Skip/abandon: a SKIPPED card never resolves (no feedback); an ABANDONED card
 * resolves while OFF-SCREEN (`isActive={false}`) — the gate forwards it but shows
 * no feedback and fires no explanation seam.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { LiquidCard, TinyLogicCard as TinyLogicCardType } from '../core/cards/types';
import type { CardResolution, TemplateProps } from '../core/templates/contract';
import type { TemplateRenderer } from './rendererRegistry';
import { CardReplayProvider, withFeedbackGate } from './FeedbackGate';
import TinyLogicCard from './templates/TinyLogicCard';

const ACTIVE_AT = 1000;

function tinyLogicCard(): TinyLogicCardType {
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

function context() {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

/** The real TinyLogic renderer behind the gate — a template that used to be silent
 * on a correct answer and revealed its explanation only on error. */
const GatedTinyLogic = withFeedbackGate(
  TinyLogicCard as TemplateRenderer<LiquidCard>,
);

/** A minimal renderer with a single button that resolves on press — used to drive
 * the skip/abandon (off-screen) paths deterministically. */
function makeResolver(resolutionType: CardResolution['resolutionType']) {
  function TestRenderer({ card, onAttempt, onResolve }: TemplateProps<LiquidCard>) {
    return (
      <Pressable
        testID="test-resolve"
        onPress={() => {
          onAttempt();
          onResolve({
            cardId: card.cardId,
            resolutionType,
            isCorrect: resolutionType === 'correct',
            elapsedMs: 1,
            interactionElapsedMs: 1,
            attemptCount: 1,
            signals: {},
          });
        }}
      >
        <Text>play</Text>
      </Pressable>
    );
  }
  TestRenderer.displayName = 'TestRenderer';
  return TestRenderer as TemplateRenderer<LiquidCard>;
}

it('shows the uniform feedback + explanation after a CORRECT answer (previously silent)', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  render(
    <GatedTinyLogic
      card={tinyLogicCard()}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      onExplanationViewed={onExplanationViewed}
    />,
  );

  fireEvent.press(screen.getByTestId('tl-option-opt-b')); // correct pick

  // The feedback step replaces the game: a correct indicator + the explanation.
  expect(screen.getByTestId('card-feedback')).toBeOnTheScreen();
  expect(screen.getByTestId('feedback-outcome')).toHaveTextContent('Correct');
  expect(screen.getByText('Here is why')).toBeOnTheScreen();
  expect(screen.getByText('The middle one follows.')).toBeOnTheScreen();
  // The game (and its stem) is gone — only the feedback shows.
  expect(screen.queryByTestId('tl-stem')).toBeNull();

  // Resolution still forwarded outward; explanation-viewed fires exactly once.
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0]).toMatchObject({ resolutionType: 'correct' });
  expect(onExplanationViewed).toHaveBeenCalledTimes(1);
});

it('shows the uniform feedback + explanation after an INCORRECT answer', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  render(
    <GatedTinyLogic
      card={tinyLogicCard()}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={onResolve}
      onExplanationViewed={onExplanationViewed}
    />,
  );

  fireEvent.press(screen.getByTestId('tl-option-opt-c')); // wrong pick

  expect(screen.getByTestId('card-feedback')).toBeOnTheScreen();
  expect(screen.getByTestId('feedback-outcome')).toHaveTextContent('Not quite');
  // Explanation shown EXACTLY ONCE — by the gate, not the renderer (no tl-explanation).
  expect(screen.queryByTestId('tl-explanation')).toBeNull();
  expect(screen.getAllByText('Here is why')).toHaveLength(1);

  expect(onResolve.mock.calls[0][0]).toMatchObject({ resolutionType: 'incorrect' });
  expect(onExplanationViewed).toHaveBeenCalledTimes(1);
});

it('shows the uniform feedback + explanation after a TIMEOUT', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    const onExplanationViewed = jest.fn();
    render(
      <GatedTinyLogic
        card={tinyLogicCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        onExplanationViewed={onExplanationViewed}
      />,
    );

    act(() => jest.advanceTimersByTime(1000)); // elapse the time limit, no pick

    expect(screen.getByTestId('card-feedback')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-outcome')).toHaveTextContent("Time's up");
    expect(screen.getByText('Here is why')).toBeOnTheScreen();
    expect(onResolve.mock.calls[0][0]).toMatchObject({ resolutionType: 'timeout' });
    expect(onExplanationViewed).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('fires onExplanationViewed exactly once even if the parent re-renders', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  // A fresh handler identity on every render must not refire the seam.
  function Parent() {
    return (
      <GatedTinyLogic
        card={tinyLogicCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        onExplanationViewed={() => onExplanationViewed()}
      />
    );
  }
  const { rerender } = render(<Parent />);

  fireEvent.press(screen.getByTestId('tl-option-opt-b'));
  expect(onExplanationViewed).toHaveBeenCalledTimes(1);

  rerender(<Parent />);
  rerender(<Parent />);
  expect(onExplanationViewed).toHaveBeenCalledTimes(1);
});

it('a SKIPPED card (never resolved) shows no feedback', () => {
  const onExplanationViewed = jest.fn();
  const Gated = withFeedbackGate(makeResolver('correct'));
  render(
    <Gated
      card={tinyLogicCard() as LiquidCard}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
      onExplanationViewed={onExplanationViewed}
    />,
  );
  // Without a resolution (the player swiped past without resolving) there is no
  // feedback step and the explanation seam never fires.
  expect(screen.queryByTestId('card-feedback')).toBeNull();
  expect(onExplanationViewed).not.toHaveBeenCalled();
});

it('a card PLAYED while active keeps its outcome after going off-screen and back (no phantom timeout)', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    function Parent({ isActive }: { isActive: boolean }) {
      return (
        <GatedTinyLogic
          card={tinyLogicCard()}
          context={context()}
          isActive={isActive}
          onAttempt={jest.fn()}
          onResolve={onResolve}
          onExplanationViewed={jest.fn()}
        />
      );
    }
    const { rerender } = render(<Parent isActive />);

    // Answer CORRECTLY while the slide is active.
    fireEvent.press(screen.getByTestId('tl-option-opt-b'));
    expect(screen.getByTestId('feedback-outcome')).toHaveTextContent('Correct');

    // Scroll the played slide off-screen, then elapse well past the time limit:
    // the gate must NOT re-mount the renderer / re-arm its timer, so no phantom
    // timeout can overwrite the captured 'correct' outcome.
    rerender(<Parent isActive={false} />);
    act(() => jest.advanceTimersByTime(5000));
    rerender(<Parent isActive />);

    expect(screen.getByTestId('feedback-outcome')).toHaveTextContent('Correct');
    // Exactly one resolution ever forwarded — the correct one, no stray timeout.
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({ resolutionType: 'correct' });
  } finally {
    jest.useRealTimers();
  }
});

it('Play again remounts the card; the first attempt records normally, replays record off-latch', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const recordReplay = jest.fn();
  const Gated = withFeedbackGate(makeResolver('correct'));
  render(
    <CardReplayProvider handler={recordReplay}>
      <Gated
        card={tinyLogicCard() as LiquidCard}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        onExplanationViewed={jest.fn()}
      />
    </CardReplayProvider>,
  );

  // First attempt resolves → feedback shows, recorded via the normal (latched)
  // path, NOT the replay path.
  fireEvent.press(screen.getByTestId('test-resolve'));
  expect(screen.getByTestId('card-feedback')).toBeOnTheScreen();
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(recordReplay).not.toHaveBeenCalled();

  // "Play again" remounts the same card fresh (game back, feedback gone) and does
  // NOT re-record the first attempt (already recorded on resolve).
  fireEvent.press(screen.getByTestId('feedback-replay'));
  expect(screen.queryByTestId('card-feedback')).toBeNull();
  expect(screen.getByTestId('test-resolve')).toBeOnTheScreen();
  expect(recordReplay).not.toHaveBeenCalled();

  // The REPLAY attempt resolves: the feed's per-index latch would drop it, so the
  // gate records it through the replay seam instead — and not via onResolve again.
  fireEvent.press(screen.getByTestId('test-resolve'));
  expect(screen.getByTestId('card-feedback')).toBeOnTheScreen();
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(recordReplay).toHaveBeenCalledTimes(1);
  expect(recordReplay.mock.calls[0][0]).toMatchObject({ cardId: 'tl-1' });
  expect(recordReplay.mock.calls[0][1]).toMatchObject({ resolutionType: 'correct' });
});

it('an ABANDONED card (resolves while OFF-SCREEN) forwards the resolution but shows no feedback', () => {
  const onResolve = jest.fn<void, [CardResolution]>();
  const onExplanationViewed = jest.fn();
  const Gated = withFeedbackGate(makeResolver('timeout'));
  render(
    <Gated
      card={tinyLogicCard() as LiquidCard}
      context={context()}
      isActive={false} // off-screen: the slide was left before resolving
      onAttempt={jest.fn()}
      onResolve={onResolve}
      onExplanationViewed={onExplanationViewed}
    />,
  );

  fireEvent.press(screen.getByTestId('test-resolve')); // its timer fires off-screen

  // Resolution still forwarded outward (the feed dedups/classifies it as abandoned)…
  expect(onResolve).toHaveBeenCalledTimes(1);
  // …but no feedback surfaces and the explanation seam never fires off-screen.
  expect(screen.queryByTestId('card-feedback')).toBeNull();
  expect(onExplanationViewed).not.toHaveBeenCalled();
});
