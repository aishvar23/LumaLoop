/**
 * Tests for the Tiny Logic renderer (Azure DevOps #67; Design §9.4; Tech §7,
 * §14).
 *
 * The renderer is driven through React Testing Library with an INJECTED clock
 * and vitest fake timers, so no assertion depends on the real `Date.now()`.
 * Fake timers drive the shared `useCardTimer` countdown while the injected `now`
 * supplies the measured-time math.
 *
 * Tiny Logic is the single-phase template: there is no preview and no stream, so
 * the controller sets `interactionEnabledAtMs === activeAtMs` and `elapsedMs`
 * and `interactionElapsedMs` share the same origin. The committed-choice
 * semantics are the focus here: the FIRST selection resolves the card, a wrong
 * commit reveals the explanation (explanation-after-error), and the chosen
 * distractor is reported in the signals.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TinyLogicCard as TinyLogicCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import TinyLogicCard from './TinyLogicCard';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function tinyLogicCard(
  overrides: Partial<TinyLogicCardType['config']> = {},
): TinyLogicCardType {
  return {
    cardId: 'tl-1',
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Pick the correct answer',
    puzzleDna: {
      mechanic: 'one_move_logic_choice',
      inputMode: 'choice',
      measuredSignals: ['time_to_interaction', 'correct', 'elapsed_ms'],
    },
    explanation: {
      title: 'Why opt-2 is right',
      body: 'All A are B, and X is A, so X must be B.',
    },
    config: {
      stem: 'If all A are B, and X is A, then X is…',
      options: [
        { id: 'opt-1', label: 'Not B' },
        { id: 'opt-2', label: 'B' },
        { id: 'opt-3', label: 'Maybe B' },
      ],
      correctOptionId: 'opt-2',
      timeLimitMs: 12_000,
      ...overrides,
    },
  };
}

// Tiny Logic is single-phase, so the controller sets
// `interactionEnabledAtMs === activeAtMs`: interaction is enabled at card start,
// and the two clock origins coincide.
function startContext(
  overrides: Partial<CardStartContext> = {},
): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

type RenderOpts = {
  card?: TinyLogicCardType;
  context?: CardStartContext;
  now?: () => number;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <TinyLogicCard
      card={opts.card ?? tinyLogicCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const selectOption = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`tl-option-${id}`)));

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
// Initial render: stem + every option mount immediately (single phase).
// ---------------------------------------------------------------------------

describe('initial render', () => {
  it('renders the stem and all options at card start', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('tl-stem')).toHaveTextContent(
      'If all A are B, and X is A, then X is…',
    );
    expect(screen.getByTestId('tl-option-opt-1')).toHaveTextContent('Not B');
    expect(screen.getByTestId('tl-option-opt-2')).toHaveTextContent('B');
    expect(screen.getByTestId('tl-option-opt-3')).toHaveTextContent('Maybe B');

    // The explanation is NOT shown before any selection.
    expect(screen.queryByTestId('tl-explanation')).not.toBeInTheDocument();
  });

  it('starts with an empty polite live region and nothing resolved', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('');
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Correct selection — single-phase, so elapsed and interactionElapsed coincide.
// ---------------------------------------------------------------------------

describe('selecting the correct option', () => {
  it('resolves correct with the right signals', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 2_500; // 1_500ms after card start
    selectOption('opt-2');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('tl-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);

    // Single phase: both clocks share the activeAt/interactionEnabledAt origin.
    expect(resolution.elapsedMs).toBe(1_500);
    expect(resolution.interactionElapsedMs).toBe(1_500);

    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.selected_option_id).toBe('opt-2');
    expect(resolution.signals.time_to_interaction).toBe(1_500);
    expect(resolution.signals.elapsed).toBe(1_500);
    // A correct choice has no distractor.
    expect(resolution.signals.distractor_option_id).toBe('');

    // Explanation-after-error: a correct choice resolves silently.
    expect(screen.queryByTestId('tl-explanation')).not.toBeInTheDocument();
  });

  it('fires onAttempt exactly once with the time-to-interaction', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_900; // 900ms after card start
    selectOption('opt-2');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 900 });
  });

  it('announces the committed choice in the live region', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 2_000;
    selectOption('opt-2');

    expect(screen.getByRole('status')).toHaveTextContent('Correct: B');
    expect(screen.getByTestId('tl-option-opt-2')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('tl-option-opt-1')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

// ---------------------------------------------------------------------------
// Wrong selection — resolves incorrect, reveals the explanation, names the
// chosen distractor (Design §9.4).
// ---------------------------------------------------------------------------

describe('selecting a wrong option', () => {
  it('resolves incorrect and reports the chosen distractor', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000; // 2_000ms after card start
    selectOption('opt-1'); // wrong — single choice resolves immediately

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.interactionElapsedMs).toBe(2_000);
    expect(resolution.signals.correct).toBe(false);
    expect(resolution.signals.selected_option_id).toBe('opt-1');
    // The chosen wrong option is recorded as the distractor choice (Design §9.4).
    expect(resolution.signals.distractor_option_id).toBe('opt-1');
  });

  it('reveals the explanation ONLY after a wrong answer, never before', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    // Not present before any selection.
    expect(screen.queryByTestId('tl-explanation')).not.toBeInTheDocument();

    clock = 2_000;
    selectOption('opt-3'); // wrong

    const explanation = screen.getByTestId('tl-explanation');
    expect(explanation).toHaveTextContent('Why opt-2 is right');
    expect(explanation).toHaveTextContent(
      'All A are B, and X is A, so X must be B.',
    );
    // The corrective feedback is itself announced, not just visually revealed.
    expect(explanation).toHaveAttribute('aria-live', 'polite');
  });

  it('ignores selections after the card has already resolved', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 2_000;
    selectOption('opt-1'); // resolves incorrect; card is now latched
    expect(onResolve).toHaveBeenCalledTimes(1);

    // A later tap on the correct option must be inert — no second resolution,
    // no second attempt.
    clock = 3_000;
    selectOption('opt-2');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer (Tech §7).
// ---------------------------------------------------------------------------

describe('timeout', () => {
  it('resolves via useCardTimer with timedOut true when no choice is made', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    // Just under the time limit: nothing resolves yet.
    act(() => void vi.advanceTimersByTime(11_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 13_000; // activeAt 1_000 + timeLimit 12_000
    act(() => void vi.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.correct).toBe(false);
    // Never interacted: TTI is the sentinel and no distractor was chosen.
    expect(resolution.signals.time_to_interaction).toBe(-1);
    expect(resolution.signals.distractor_option_id).toBe('');

    // Single phase: both clocks measure the full limit from the shared origin.
    expect(resolution.elapsedMs).toBe(12_000);
    expect(resolution.interactionElapsedMs).toBe(12_000);

    // A timeout is not an attempt — onAttempt never fired.
    expect(onAttempt).not.toHaveBeenCalled();

    // No explanation on a timeout (no committed wrong choice).
    expect(screen.queryByTestId('tl-explanation')).not.toBeInTheDocument();
  });

  it('does not fire a late timeout after a resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 2_000;
    selectOption('opt-2'); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1); // no second resolution
  });
});
