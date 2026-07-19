/**
 * Tests for the Rule Flip renderer (Azure DevOps #66; Design §9.3, §21.1; Tech
 * §7, §14).
 *
 * The renderer is driven through React Testing Library with an INJECTED clock
 * and vitest fake timers, so no assertion depends on the real `Date.now()`.
 * Fake timers drive BOTH the renderer-owned stimulus cadence (the
 * show→gap→next chain on `stimulusDurationMs` / `interStimulusGapMs`) and the
 * shared `useCardTimer` overall countdown, while the injected `now` supplies the
 * measured-time math (RT, switch latency, elapsed).
 *
 * Key timing contract (Design §9.3; Tech §7): the controller sets
 * `interactionEnabledAtMs === activeAtMs`, so the RENDERER owns the comprehension
 * gate → stream transition. The per-card `timeLimitMs` and the measured timings
 * are anchored at STREAM start, not card start, so the un-timed gate never
 * consumes the time limit.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuleFlipCard as RuleFlipCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import RuleFlipCard from './RuleFlipCard';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function ruleFlipCard(
  overrides: Partial<RuleFlipCardType['config']> = {},
): RuleFlipCardType {
  return {
    cardId: 'rf-1',
    creatorHandle: '@test',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Apply the rule — it will change',
    puzzleDna: {
      mechanic: 'rule_switch',
      inputMode: 'tap',
      measuredSignals: ['pre_flip_accuracy', 'switch_latency_ms', 'perseveration'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      timeLimitMs: 15_000,
      stimulusDurationMs: 1_000,
      interStimulusGapMs: 500,
      initialRuleLabel: 'Tap red',
      flippedRuleLabel: 'Tap blue',
      flipAtStimulusIndex: 1,
      stimuli: [
        // index 0: pre-flip; initial rule expects MATCH.
        { id: 's0', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
        // index 1: flip lands here; flipped rule expects MATCH.
        { id: 's1', label: 'B', matchesInitialRule: false, matchesFlippedRule: true },
        // index 2: post-flip; flipped rule expects NO-MATCH.
        { id: 's2', label: 'C', matchesInitialRule: true, matchesFlippedRule: false },
      ],
      ...overrides,
    },
  };
}

// The controller sets `interactionEnabledAtMs === activeAtMs` for rule_flip: the
// renderer owns the gate → stream transition, so the start context carries no
// gate offset.
function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

type RenderOpts = {
  card?: RuleFlipCardType;
  context?: CardStartContext;
  now?: () => number;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <RuleFlipCard
      card={opts.card ?? ruleFlipCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const start = () => act(() => void fireEvent.click(screen.getByTestId('rf-start')));
const respondMatch = () =>
  act(() => void fireEvent.click(screen.getByTestId('rf-match')));
const respondNoMatch = () =>
  act(() => void fireEvent.click(screen.getByTestId('rf-no-match')));

const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Comprehension gate (Design §21.1, localized slice).
// ---------------------------------------------------------------------------

describe('comprehension gate', () => {
  it('shows the initial rule + a Start affordance, with no stream and no timing yet', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('rf-gate-rule')).toHaveTextContent('Rule: Tap red');
    expect(screen.getByTestId('rf-start')).toBeInTheDocument();
    expect(screen.getByTestId('rf-demo-button')).toHaveAttribute(
      'title',
      expect.stringContaining('adds about 5 seconds'),
    );

    // The measured stream is not mounted and no response controls exist yet.
    expect(screen.queryByTestId('rf-stimulus')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rf-match')).not.toBeInTheDocument();
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('plays a separate demo without starting the stream or attempt', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    fireEvent.click(screen.getByTestId('rf-demo-button'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Rule Flip demonstration',
    );
    expect(screen.getByTestId('rf-demo-rule')).toHaveTextContent(
      'Filled circles match',
    );
    expect(screen.getByTestId('rf-demo-answer')).toHaveTextContent(
      'Demo taps: Match',
    );
    expect(onAttempt).not.toHaveBeenCalled();

    advance(1_500);
    expect(screen.getByTestId('rf-demo-rule')).toHaveTextContent(
      'outlined squares match',
    );
    expect(screen.getByTestId('rf-demo-answer')).toHaveTextContent(
      'No-match',
    );

    advance(1_500);
    expect(screen.getByTestId('rf-demo-stimulus')).toHaveTextContent('□');
    expect(screen.getByTestId('rf-demo-note')).toHaveTextContent(
      'fits the new rule',
    );

    advance(2_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('rf-your-turn')).toHaveTextContent('Your turn');
    expect(screen.queryByTestId('rf-stimulus')).not.toBeInTheDocument();
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('does not arm the per-card timer until the stream begins', () => {
    // timeLimitMs is short; if the timer armed at the gate it would fire here.
    const { onResolve } = renderCard({
      now: () => 1_000,
      card: ruleFlipCard({ timeLimitMs: 2_000 }),
    });

    advance(60_000); // sit on the gate well past the time limit
    expect(onResolve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stream cadence + the rule flip.
// ---------------------------------------------------------------------------

describe('stream cadence and the rule flip', () => {
  it('streams stimuli on the configured timing and flips the rule at flipAtStimulusIndex', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 1_000;
    start();

    // First stimulus is visible under the INITIAL rule, no flip banner yet.
    expect(screen.getByTestId('rf-stimulus')).toHaveTextContent('A');
    expect(screen.getByTestId('rf-stimulus')).toHaveAttribute('data-stimulus-index', '0');
    expect(screen.getByTestId('rf-rule')).toHaveTextContent('Rule: Tap red');
    expect(screen.queryByTestId('rf-flip-banner')).not.toBeInTheDocument();

    // After stimulusDurationMs the stimulus hides into the inter-stimulus gap.
    clock = 2_000;
    advance(1_000);
    expect(screen.queryByTestId('rf-stimulus')).not.toBeInTheDocument();
    expect(screen.getByTestId('rf-gap')).toBeInTheDocument();

    // After interStimulusGapMs the next stimulus shows AND the rule flips.
    clock = 2_500;
    advance(500);
    expect(screen.getByTestId('rf-stimulus')).toHaveTextContent('B');
    expect(screen.getByTestId('rf-stimulus')).toHaveAttribute('data-stimulus-index', '1');
    expect(screen.getByTestId('rf-rule')).toHaveTextContent('New rule: Tap blue');
    // The flip is conveyed by a text+icon banner, not by colour alone.
    expect(screen.getByTestId('rf-flip-banner')).toHaveTextContent('Rule changed');
  });
});

// ---------------------------------------------------------------------------
// Response capture + onAttempt.
// ---------------------------------------------------------------------------

describe('response capture', () => {
  it('fires onAttempt exactly once on the first response and ignores a second tap on the same stimulus', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    clock = 1_200; // 200ms into the first stimulus
    respondMatch();
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 200 });

    // A second tap on the same (still-visible) stimulus is inert.
    clock = 1_300;
    respondNoMatch();
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('ignores responses during the inter-stimulus gap (no stimulus visible)', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    // Advance into the gap after the first stimulus; there is nothing to answer.
    clock = 2_000;
    advance(1_000);
    expect(screen.getByTestId('rf-gap')).toBeInTheDocument();

    respondMatch();
    expect(onAttempt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Completion — resolves once, scored through the evaluator, §9.3 signals.
// ---------------------------------------------------------------------------

describe('stream completion', () => {
  it('resolves exactly once with the §9.3 measures when the stream finishes', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    // index 0 (pre-flip, initial rule expects MATCH) — answer correctly.
    clock = 1_200;
    respondMatch();

    clock = 2_000;
    advance(1_000); // -> gap
    clock = 2_500;
    advance(500); // -> index 1 shows; rule flips

    // index 1 (post-flip, flipped rule expects MATCH) — first post-flip response.
    clock = 2_900;
    respondMatch();

    clock = 3_500;
    advance(1_000); // -> gap
    clock = 4_000;
    advance(500); // -> index 2 shows

    // index 2 (post-flip, flipped rule expects NO-MATCH) — answer correctly.
    clock = 4_300;
    respondNoMatch();

    clock = 5_000;
    advance(1_000); // -> gap
    clock = 5_500;
    advance(500); // -> done -> resolve

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('rf-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);

    // Both clocks run from streamStart (1_000) here since the gate was instant.
    expect(resolution.elapsedMs).toBe(4_500); // 5_500 - activeAt 1_000
    expect(resolution.interactionElapsedMs).toBe(4_500); // 5_500 - streamStart 1_000

    // §9.3 signals, all correct: pre-flip is index 0 (1/1), post-flip indices
    // 1-2 (2/2); switch latency is the first post-flip RT (index 1 = 400ms).
    expect(resolution.signals.pre_flip_accuracy).toBe(1);
    expect(resolution.signals.post_flip_accuracy).toBe(1);
    expect(resolution.signals.overall_accuracy).toBe(1);
    expect(resolution.signals.switch_latency_ms).toBe(400);
    expect(resolution.signals.perseveration).toBe(0);
    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.failed_step).toBe(-1);
    expect(resolution.signals.failure_reason).toBe('');
    const actionLog = JSON.parse(resolution.signals.step_action_log as string) as Array<{
      step: number;
      response: string;
      correct: boolean;
    }>;
    expect(actionLog).toHaveLength(3);
    expect(actionLog.map((item) => item.step)).toEqual([1, 2, 3]);
    expect(actionLog.every((item) => item.correct)).toBe(true);
    expect(resolution.signals.time_to_interaction).toBe(200);
  });

  it('fails the card when any one step is wrong and reports the first failed step', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    clock = 1_200;
    respondMatch(); // step 1 correct

    clock = 2_000;
    advance(1_000);
    clock = 2_500;
    advance(500);
    clock = 2_900;
    respondMatch(); // step 2 correct

    clock = 3_500;
    advance(1_000);
    clock = 4_000;
    advance(500);
    clock = 4_300;
    respondMatch(); // step 3 wrong: expected No-match

    clock = 5_000;
    advance(1_000);
    clock = 5_500;
    advance(500);

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.overall_accuracy).toBe(2 / 3);
    expect(resolution.signals.failed_step).toBe(3);
    expect(resolution.signals.failure_reason).toContain('Step 3 (C)');
    expect(resolution.signals.failure_reason).toContain('expected No-match');
    const actionLog = JSON.parse(resolution.signals.step_action_log as string) as Array<{
      step: number;
      correct: boolean;
    }>;
    expect(actionLog.at(-1)).toMatchObject({ step: 3, correct: false });
  });

  it('records perseveration when the player keeps the OLD rule after the flip', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    // index 0 (initial expects MATCH) — correct.
    clock = 1_200;
    respondMatch();

    clock = 2_000;
    advance(1_000);
    clock = 2_500;
    advance(500); // index 1 shows; rule flipped to expect MATCH for s1

    // index 1: keep the OLD rule. s1.matchesInitialRule is false, so the old
    // rule said NO-MATCH — answering NO-MATCH is wrong now but right under the
    // old rule => perseveration.
    clock = 2_700;
    respondNoMatch();

    clock = 3_500;
    advance(1_000);
    clock = 4_000;
    advance(500); // index 2 shows

    // index 2: keep the OLD rule again. s2.matchesInitialRule is true, old rule
    // said MATCH; the new rule wants NO-MATCH => perseveration.
    clock = 4_200;
    respondMatch();

    clock = 5_000;
    advance(1_000);
    clock = 5_500;
    advance(500); // done

    const resolution = lastResolution(onResolve);
    expect(resolution.signals.perseveration).toBe(2);
    expect(resolution.signals.failed_step).toBe(2);
    expect(resolution.signals.failure_reason).toContain('Step 2 (B)');
    expect(resolution.signals.post_flip_accuracy).toBe(0);
    expect(resolution.signals.pre_flip_accuracy).toBe(1);
    // Any wrong Rule Flip step fails the card.
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer; the gate must not consume the limit.
// ---------------------------------------------------------------------------

describe('overall timeout', () => {
  it('resolves via useCardTimer with timedOut=true when timeLimitMs expires mid-stream', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({
      now: () => clock,
      card: ruleFlipCard({ timeLimitMs: 2_000 }),
    });

    clock = 1_000;
    start(); // timer arms for timeLimitMs (2_000) from streamStart 1_000

    // Just under the limit: no timeout yet.
    advance(1_999);
    expect(onResolve).not.toHaveBeenCalled();

    clock = 3_000; // streamStart 1_000 + timeLimit 2_000
    advance(1);

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.interactionElapsedMs).toBe(2_000); // 3_000 - streamStart 1_000
    expect(resolution.elapsedMs).toBe(2_000); // 3_000 - activeAt 1_000
  });

  it('does not fire a late timeout after the stream resolves on its own', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_000;
    start();

    // Walk the whole stream to completion (3 stimuli × (1_000 + 500)).
    clock = 2_000;
    advance(1_000);
    clock = 2_500;
    advance(500);
    clock = 3_500;
    advance(1_000);
    clock = 4_000;
    advance(500);
    clock = 5_000;
    advance(1_000);
    clock = 5_500;
    advance(500); // done -> resolve
    expect(onResolve).toHaveBeenCalledTimes(1);

    // Far past the time limit: no second resolution.
    clock = 99_000;
    advance(60_000);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accessibility — rule state in a polite live region, never colour alone.
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  it('exposes the active rule in a polite live region that updates at the flip', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 1_000;
    start();

    const ruleRegion = screen.getByTestId('rf-rule');
    expect(ruleRegion).toHaveAttribute('aria-live', 'polite');
    expect(ruleRegion).toHaveAttribute('role', 'status');
    expect(ruleRegion).toHaveTextContent('Rule: Tap red');

    clock = 2_000;
    advance(1_000);
    clock = 2_500;
    advance(500); // flip

    expect(ruleRegion).toHaveTextContent('New rule: Tap blue');
  });

  it('uses large, labeled, real buttons for the responses', () => {
    renderCard({ now: () => 1_000 });
    start();

    const match = screen.getByTestId('rf-match');
    const noMatch = screen.getByTestId('rf-no-match');
    expect(match.tagName).toBe('BUTTON');
    expect(noMatch.tagName).toBe('BUTTON');
    expect(match).toHaveTextContent('Match');
    expect(noMatch).toHaveTextContent('No-match');
  });
});
