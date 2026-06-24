/**
 * Tests for the native Rule Flip renderer (ADO #128). Covers the renderer-owned
 * comprehension gate (which does NOT arm the timer), the streamed stimulus cadence,
 * the rule FLIP at `flipAtStimulusIndex`, first-response `onAttempt`, evaluator-
 * scored completion, and stream timeout. Scoring correctness itself is the pure
 * evaluator's concern (separately tested); these assert the renderer drives it.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { RuleFlipCard as RuleFlipCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import RuleFlipCard from './RuleFlipCard';

const ACTIVE_AT = 1000;
const SHOW_MS = 1000;
const GAP_MS = 500;

function makeCard(overrides: Partial<RuleFlipCardType['config']> = {}): RuleFlipCardType {
  return {
    cardId: 'rf-1',
    creatorHandle: '@flipper',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 15,
    prompt: 'Apply the rule',
    puzzleDna: { mechanic: 'switch', inputMode: 'choice', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      timeLimitMs: 30000,
      stimulusDurationMs: SHOW_MS,
      interStimulusGapMs: GAP_MS,
      initialRuleLabel: 'Vowels match',
      flippedRuleLabel: 'Consonants match',
      flipAtStimulusIndex: 2,
      stimuli: [
        { id: 's0', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's1', label: 'B', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's2', label: 'C', matchesInitialRule: false, matchesFlippedRule: true },
      ],
      ...overrides,
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

it('flips the rule at flipAtStimulusIndex and resolves via the evaluator', () => {
  jest.useFakeTimers();
  try {
    const onAttempt = jest.fn();
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    const clock = () => t;
    render(
      <RuleFlipCard
        card={makeCard()}
        context={context()}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={clock}
      />,
    );

    // Gate first: the stream has not started and no stimulus is visible.
    expect(screen.getByTestId('rf-gate-rule')).toHaveTextContent(/Vowels match/);
    expect(screen.getByTestId('rf-demo-button').props.accessibilityHint).toContain(
      'adds about 5 seconds',
    );
    expect(screen.queryByTestId('rf-stimulus')).toBeNull();

    // Start the measured stream.
    act(() => {
      fireEvent.press(screen.getByTestId('rf-start'));
    });

    // Stimulus 0 (pre-flip): initial rule shown, NO flip banner yet.
    expect(screen.getByTestId('rf-stimulus')).toHaveTextContent('A');
    expect(screen.getByTestId('rf-rule')).toHaveTextContent('Rule: Vowels match');
    expect(screen.queryByTestId('rf-flip-banner')).toBeNull();

    // Respond to stimulus 0 → first response fires onAttempt exactly once.
    t = ACTIVE_AT + 300;
    fireEvent.press(screen.getByTestId('rf-match'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 300 });

    // Advance show→gap→show to stimulus 1 (still pre-flip).
    act(() => jest.advanceTimersByTime(SHOW_MS));
    act(() => jest.advanceTimersByTime(GAP_MS));
    expect(screen.getByTestId('rf-stimulus')).toHaveTextContent('B');
    expect(screen.queryByTestId('rf-flip-banner')).toBeNull();
    fireEvent.press(screen.getByTestId('rf-no-match'));

    // Advance to stimulus 2 — this is flipAtStimulusIndex, so the rule FLIPS.
    act(() => jest.advanceTimersByTime(SHOW_MS));
    act(() => jest.advanceTimersByTime(GAP_MS));
    expect(screen.getByTestId('rf-stimulus')).toHaveTextContent('C');
    expect(screen.getByTestId('rf-flip-banner')).toBeOnTheScreen();
    expect(screen.getByTestId('rf-rule')).toHaveTextContent('New rule: Consonants match');
    fireEvent.press(screen.getByTestId('rf-match'));

    // Finish the stream → resolve. All three answered correctly under the active
    // rule, so the evaluator scores it CORRECT.
    act(() => jest.advanceTimersByTime(SHOW_MS));
    act(() => jest.advanceTimersByTime(GAP_MS));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution).toMatchObject({ resolutionType: 'correct', isCorrect: true });
    expect(resolution.signals).toMatchObject({
      pre_flip_accuracy: 1,
      post_flip_accuracy: 1,
      perseveration: 0,
      failed_step: -1,
      failure_reason: '',
    });
    const actionLog = JSON.parse(resolution.signals.step_action_log as string) as Array<{
      step: number;
      correct: boolean;
    }>;
    expect(actionLog).toHaveLength(3);
    expect(actionLog.every((item) => item.correct)).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('plays a separate demo without starting the stream or attempt', () => {
  jest.useFakeTimers();
  try {
    const onAttempt = jest.fn();
    const onResolve = jest.fn<void, [CardResolution]>();
    render(
      <RuleFlipCard
        card={makeCard()}
        context={context()}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => ACTIVE_AT}
      />,
    );

    fireEvent.press(screen.getByTestId('rf-demo-button'));
    expect(screen.getByLabelText('Rule Flip demonstration')).toBeOnTheScreen();
    expect(screen.getByTestId('rf-demo-rule')).toHaveTextContent(
      /Filled circles match/,
    );
    expect(screen.getByTestId('rf-demo-answer')).toHaveTextContent(/Match/);

    act(() => jest.advanceTimersByTime(1500));
    expect(screen.getByTestId('rf-demo-rule')).toHaveTextContent(
      /outlined squares match/,
    );
    expect(screen.getByTestId('rf-demo-answer')).toHaveTextContent(/No-match/);

    act(() => jest.advanceTimersByTime(1500));
    expect(screen.getByTestId('rf-demo-stimulus')).toHaveTextContent('□');

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('rf-demo-rule')).toBeNull();
    expect(screen.getByTestId('rf-your-turn')).toHaveTextContent(/Your turn/);
    expect(screen.queryByTestId('rf-stimulus')).toBeNull();
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('does not start its stimulus stream while INACTIVE (pre-mounted off-screen) (#128)', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <RuleFlipCard
        card={makeCard()}
        context={context()}
        isActive={false}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    // Rule Flip is already activation-safe: its measured stream begins only on the
    // user's intentional "Start" tap (the comprehension gate), which is unreachable
    // on an off-screen slide. So while inactive — even as the clock runs far past
    // any stimulus/limit — it holds on the gate: no stimulus streams, nothing
    // resolves.
    expect(screen.getByTestId('rf-start')).toBeOnTheScreen();
    expect(screen.queryByTestId('rf-stimulus')).toBeNull();

    t = ACTIVE_AT + SHOW_MS * 10;
    act(() => jest.advanceTimersByTime(SHOW_MS * 10));
    expect(screen.queryByTestId('rf-stimulus')).toBeNull();
    expect(onResolve).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('resolves INCORRECT when responses are wrong under the active rule', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <RuleFlipCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    act(() => {
      fireEvent.press(screen.getByTestId('rf-start'));
    });

    // Advance one stimulus (show then gap) — separate flushes so each step's
    // effect can schedule the next timer (act batches effects to its boundary).
    const stepForward = () => {
      act(() => jest.advanceTimersByTime(SHOW_MS));
      act(() => jest.advanceTimersByTime(GAP_MS));
    };

    // Answer everything 'no_match' regardless of the rule → mostly wrong.
    fireEvent.press(screen.getByTestId('rf-no-match')); // s0 expected match → wrong
    stepForward();
    fireEvent.press(screen.getByTestId('rf-match')); // s1 expected no_match → wrong
    stepForward();
    // s2 (post-flip) expected match — leave it unanswered (omission = incorrect).
    stepForward();

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      resolutionType: 'incorrect',
      isCorrect: false,
    });
    expect(onResolve.mock.calls[0][0].signals.failed_step).toBe(1);
    expect(onResolve.mock.calls[0][0].signals.failure_reason).toContain(
      'Step 1 (A)',
    );
    expect(onResolve.mock.calls[0][0].signals.step_action_log).toContain(
      '"step":1',
    );
  } finally {
    jest.useRealTimers();
  }
});

it('fails when only one step is wrong and names that failed step', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <RuleFlipCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    act(() => {
      fireEvent.press(screen.getByTestId('rf-start'));
    });

    const stepForward = () => {
      act(() => jest.advanceTimersByTime(SHOW_MS));
      act(() => jest.advanceTimersByTime(GAP_MS));
    };

    t = ACTIVE_AT + 300;
    fireEvent.press(screen.getByTestId('rf-match')); // s0 correct
    stepForward();
    fireEvent.press(screen.getByTestId('rf-no-match')); // s1 correct pre-flip
    stepForward();
    fireEvent.press(screen.getByTestId('rf-no-match')); // s2 wrong post-flip
    stepForward();

    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.overall_accuracy).toBe(2 / 3);
    expect(resolution.signals.failed_step).toBe(3);
    expect(resolution.signals.failure_reason).toContain('Step 3 (C)');
  } finally {
    jest.useRealTimers();
  }
});

it('arms the timer at STREAM start (not the gate) and resolves TIMEOUT on expiry', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <RuleFlipCard
        card={makeCard({ timeLimitMs: 1500 })}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    // Sitting on the gate: the timer is NOT armed — advancing past the limit does
    // not time out.
    t = ACTIVE_AT + 5000;
    act(() => jest.advanceTimersByTime(5000));
    expect(onResolve).not.toHaveBeenCalled();

    // Start the stream; the timer arms from here.
    act(() => {
      fireEvent.press(screen.getByTestId('rf-start'));
    });

    t = ACTIVE_AT + 5000 + 1500;
    act(() => jest.advanceTimersByTime(1500));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.signals.timedOut).toBe(true);
    // interactionElapsedMs measures from stream start (the gate is excluded).
    expect(resolution.interactionElapsedMs).toBe(1500);
  } finally {
    jest.useRealTimers();
  }
});
