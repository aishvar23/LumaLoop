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
import { withFeedbackGate } from './FeedbackGate';
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
