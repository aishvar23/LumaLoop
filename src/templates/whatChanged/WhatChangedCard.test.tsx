/**
 * Tests for the What Changed renderer (Azure DevOps #65; Design §9.2; Tech §7,
 * §10, §14).
 *
 * The renderer is driven through React Testing Library with an INJECTED clock
 * and vitest fake timers, so no assertion depends on the real `Date.now()`.
 * Fake timers drive BOTH phase machinery the renderer owns (the preview→answer
 * transition after `previewMs`) and the shared `useCardTimer` countdown, while
 * the injected `now` supplies the measured-time math.
 *
 * The key timing contract under test (Design §9.2; Tech §7, §10): the controller
 * sets `interactionEnabledAtMs === activeAtMs`, so the RENDERER owns the
 * preview→answer transition. Time-to-interaction (TTI) and `interactionElapsedMs`
 * must therefore be measured from the renderer's OWN answer-phase start — they
 * must EXCLUDE the preview window — and `timeLimitMs` must cover the answer phase
 * only, not the preview.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WhatChangedCard as WhatChangedCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import WhatChangedCard from './WhatChangedCard';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function whatChangedCard(
  overrides: Partial<WhatChangedCardType['config']> = {},
): WhatChangedCardType {
  return {
    cardId: 'wc-1',
    creatorHandle: '@test',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 8,
    prompt: 'What changed?',
    puzzleDna: {
      mechanic: 'pattern_change_recall',
      inputMode: 'choice',
      measuredSignals: ['time_to_interaction', 'correct', 'elapsed_ms'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      previewMs: 2_000,
      timeLimitMs: 8_000,
      beforePattern: ['A', 'B', 'C'],
      afterPattern: ['A', 'X', 'C'],
      options: [
        { id: 'opt-1', label: 'First changed' },
        { id: 'opt-2', label: 'Second changed' },
        { id: 'opt-3', label: 'Third changed' },
      ],
      correctOptionId: 'opt-2',
      ...overrides,
    },
  };
}

// The controller sets `interactionEnabledAtMs === activeAtMs` for what_changed:
// the renderer owns the preview→answer transition, so the start context carries
// no preview offset. Keeping them equal makes the "TTI excludes preview"
// assertions meaningful — a renderer that wrongly measured from the context
// origins would include the whole preview window.
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
  card?: WhatChangedCardType;
  context?: CardStartContext;
  now?: () => number;
  isActive?: boolean;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  const card = opts.card ?? whatChangedCard();
  const context = opts.context ?? startContext();
  const now = opts.now;
  const { rerender } = render(
    <WhatChangedCard
      card={card}
      context={context}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={now}
      isActive={opts.isActive}
    />,
  );
  const setActive = (isActive: boolean) =>
    rerender(
      <WhatChangedCard
        card={card}
        context={context}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={now}
        isActive={isActive}
      />,
    );
  return { onAttempt, onResolve, setActive };
}

/** Drive the renderer-owned preview→answer transition by `previewMs`. */
const advancePreview = (previewMs: number) =>
  act(() => void vi.advanceTimersByTime(previewMs));

const selectOption = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`wc-option-${id}`)));

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
// Preview phase: beforePattern shown, options not yet mounted.
// ---------------------------------------------------------------------------

describe('preview phase', () => {
  it('shows beforePattern and NOT the options during the preview', () => {
    renderCard({ now: () => 1_000 });

    // beforePattern tiles are visible…
    expect(screen.getByTestId('wc-before-0')).toHaveTextContent('A');
    expect(screen.getByTestId('wc-before-1')).toHaveTextContent('B');
    expect(screen.getByTestId('wc-before-2')).toHaveTextContent('C');

    // …while the afterPattern and the options are not even mounted yet.
    expect(screen.queryByTestId('wc-after-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wc-option-opt-2')).not.toBeInTheDocument();
  });

  it('treats the preview phase as non-interactive (no option to commit)', () => {
    const { onAttempt, onResolve } = renderCard({ now: () => 1_000 });

    // There is no committable option during preview, so a player cannot resolve
    // or even register an attempt — the options simply do not exist yet.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('advances to afterPattern + options after config.previewMs', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000; // answer phase begins 2_000ms (previewMs) after card start
    advancePreview(2_000);

    // afterPattern is now shown and the options are mounted and committable.
    expect(screen.getByTestId('wc-after-1')).toHaveTextContent('X');
    expect(screen.getByTestId('wc-option-opt-1')).toBeInTheDocument();
    expect(screen.getByTestId('wc-option-opt-2')).toBeInTheDocument();
    expect(screen.getByTestId('wc-option-opt-3')).toBeInTheDocument();

    // The before-pattern strip is gone once the answer phase begins.
    expect(screen.queryByTestId('wc-before-0')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// isActive gates the preview — a pre-mounted (off-screen) slide must HOLD in the
// preview and not advance until it becomes the focused slide (feed BLOCKER repro).
// ---------------------------------------------------------------------------

describe('isActive gating', () => {
  it('does not advance the preview while inactive', () => {
    renderCard({ now: () => 1_000, isActive: false });

    // Even well past `previewMs`, a pre-mounted slide stays in the preview and
    // never reveals the options — so the working-memory mechanic is preserved.
    act(() => void vi.advanceTimersByTime(2_000 * 10));
    expect(screen.getByTestId('wc-before-0')).toBeInTheDocument();
    expect(screen.queryByTestId('wc-option-opt-2')).not.toBeInTheDocument();
  });

  it('runs the preview ONLY on activation, then TTI still excludes the preview', () => {
    let clock = 1_000;
    const { onAttempt, onResolve, setActive } = renderCard({
      now: () => clock,
      isActive: false,
    });

    // Pre-mounted off-screen: the preview countdown has not started.
    act(() => void vi.advanceTimersByTime(2_000 * 5));
    expect(screen.queryByTestId('wc-option-opt-2')).not.toBeInTheDocument();

    // Becomes the active slide: the preview countdown now arms from this instant.
    clock = 5_000; // activation instant — preview origin
    setActive(true);
    clock = 7_000; // answer phase begins 2_000ms (previewMs) after activation
    advancePreview(2_000);
    expect(screen.getByTestId('wc-option-opt-2')).toBeInTheDocument();

    // Selecting after activation: TTI is measured from the answer-phase start, so
    // it EXCLUDES the preview window even though the slide was mounted earlier.
    clock = 8_000; // 1_000ms into the answer phase
    selectOption('opt-2');
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 1_000 });
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.interactionElapsedMs).toBe(1_000); // 8_000 - answerStart 7_000
  });
});

// ---------------------------------------------------------------------------
// Correct selection — TTI measured from the answer-phase start (excludes preview).
// ---------------------------------------------------------------------------

describe('selecting the correct option', () => {
  it('resolves correct with TTI measured from answer-phase start (excludes preview)', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000; // answer phase starts here (after the 2_000ms preview)
    advancePreview(2_000);

    clock = 4_500; // 1_500ms into the ANSWER phase
    selectOption('opt-2');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.cardId).toBe('wc-1');
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.attemptCount).toBe(1);

    // `elapsedMs` runs from card start (activeAtMs 1_000) and so INCLUDES the
    // preview, but `interactionElapsedMs` runs from the answer-phase start and
    // EXCLUDES it — the two differ by exactly the 2_000ms preview window.
    expect(resolution.elapsedMs).toBe(3_500); // 4_500 - activeAt 1_000
    expect(resolution.interactionElapsedMs).toBe(1_500); // 4_500 - answerStart 3_000
    expect(resolution.elapsedMs - resolution.interactionElapsedMs).toBe(2_000);

    expect(resolution.signals.correct).toBe(true);
    expect(resolution.signals.selected_option_id).toBe('opt-2');
    expect(resolution.signals.time_to_interaction).toBe(1_500);
    expect(resolution.signals.elapsed).toBe(1_500);
  });

  it('fires onAttempt exactly once with the answer-phase TTI', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    clock = 3_900; // 900ms into the answer phase
    selectOption('opt-2');

    expect(onAttempt).toHaveBeenCalledTimes(1);
    // TTI is the answer-phase offset (900ms), NOT 2_900ms from card start.
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 900 });
  });
});

// ---------------------------------------------------------------------------
// Accessibility — selection is conveyed by aria-pressed + a polite live region,
// never by colour alone (Tech §14, parity with the Spot It renderer).
// ---------------------------------------------------------------------------

describe('selection accessibility', () => {
  it('starts the answer phase with an empty polite live region', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('');
  });

  it('announces the committed choice in the live region when an option is selected', () => {
    let clock = 1_000;
    renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    clock = 4_000;
    selectOption('opt-2');

    // The chosen option's label is announced, and the button reports its pressed
    // state — selection is conveyed without relying on colour.
    expect(screen.getByRole('status')).toHaveTextContent('Selected: Second changed');
    expect(screen.getByTestId('wc-option-opt-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('wc-option-opt-1')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ---------------------------------------------------------------------------
// Wrong selection — single-choice resolves incorrect on the first commit.
// ---------------------------------------------------------------------------

describe('selecting a wrong option', () => {
  it('resolves incorrect and records the wrong choice as the error type', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    clock = 4_000; // 1_000ms into the answer phase
    selectOption('opt-1'); // wrong — single choice resolves immediately

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);

    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.interactionElapsedMs).toBe(1_000);
    expect(resolution.signals.correct).toBe(false);
    // The wrong option id is recorded as the "Error type" signal (Design §9.2).
    expect(resolution.signals.selected_option_id).toBe('opt-1');
  });

  it('ignores selections after the card has already resolved', () => {
    let clock = 1_000;
    const { onAttempt, onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    clock = 4_000;
    selectOption('opt-1'); // resolves incorrect; card is now latched
    expect(onResolve).toHaveBeenCalledTimes(1);

    // A later tap on the correct option must be inert — no second resolution,
    // no second attempt.
    clock = 5_000;
    selectOption('opt-2');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout — delegated to useCardTimer; preview must not consume the answer time.
// ---------------------------------------------------------------------------

describe('answer-phase timeout', () => {
  it('resolves via useCardTimer, and the preview does NOT consume the time limit', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000; // answer phase starts; the timer arms for timeLimitMs here
    advancePreview(2_000);

    // Advance to JUST under the answer time limit (8_000). If the 2_000ms
    // preview had counted against `timeLimitMs`, the timeout would already have
    // fired — proving the timer's origin is the answer phase, not card start.
    act(() => void vi.advanceTimersByTime(7_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000; // answerStart 3_000 + timeLimit 8_000
    act(() => void vi.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);

    // `interactionElapsedMs` is measured from the answer-phase start (3_000),
    // so it equals the full answer time limit and EXCLUDES the preview, while
    // `elapsedMs` from card start includes it.
    expect(resolution.interactionElapsedMs).toBe(8_000); // 11_000 - 3_000
    expect(resolution.elapsedMs).toBe(10_000); // 11_000 - activeAt 1_000
    expect(resolution.signals.correct).toBe(false);
    expect(resolution.signals.time_to_interaction).toBe(-1); // never interacted
  });

  it('does not fire a late timeout after a correct resolution', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 3_000;
    advancePreview(2_000);

    clock = 4_000;
    selectOption('opt-2'); // correct — disarms the timer
    expect(onResolve).toHaveBeenCalledTimes(1);

    clock = 99_000;
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onResolve).toHaveBeenCalledTimes(1); // no second resolution
  });
});
