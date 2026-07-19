/**
 * Tests for the feed registry's feedback gate (Azure DevOps #70; Design §8.2;
 * Technical Design §4, §14).
 *
 * The gate is the localized seam that inserts the uniform FEEDBACK +
 * EXPLANATION step WITHOUT touching the controller or reducer: a card's
 * resolution must pause on the feedback step and only advance the feed (fire the
 * controller's real `onResolve`) when the player taps "Next".
 */

import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LiquidCard } from '../cards/types';
import type {
  RendererRegistry,
  TemplateRenderer,
} from '../session/rendererRegistry';
import type { CardResolution, TemplateProps } from '../templates/contract';
import {
  CardReplayProvider,
  createFeedRegistry,
  withFeedbackGate,
} from './feedRegistry';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function tinyLogicCard(): LiquidCard {
  return {
    cardId: 'card-1',
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
      measuredSignals: ['correct'],
    },
    explanation: {
      title: 'Why opt-2 is right',
      body: 'All A are B, and X is A, so X must be B.',
    },
    config: {
      stem: 'If all A are B, and X is A, then X is…',
      options: [{ id: 'opt-2', label: 'B' }],
      correctOptionId: 'opt-2',
      timeLimitMs: 12_000,
    },
  };
}

function resolution(
  overrides: Partial<CardResolution> = {},
): CardResolution {
  return {
    cardId: 'card-1',
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 1_000,
    interactionElapsedMs: 1_000,
    attemptCount: 1,
    signals: {},
    ...overrides,
  };
}

/**
 * A stub inner renderer with a button per outcome. Clicking a button calls the
 * gate's captured `onResolve` — standing in for any real template renderer.
 */
function makeStubRenderer(): TemplateRenderer<LiquidCard> {
  function StubRenderer({ onAttempt, onResolve }: TemplateProps<LiquidCard>) {
    return (
      <div data-testid="stub-renderer">
        <button type="button" onClick={() => onAttempt({ touched: true })}>
          attempt
        </button>
        <button type="button" onClick={() => onResolve(resolution())}>
          resolve correct
        </button>
        <button
          type="button"
          onClick={() =>
            onResolve(
              resolution({ resolutionType: 'incorrect', isCorrect: false }),
            )
          }
        >
          resolve incorrect
        </button>
        <button
          type="button"
          onClick={() =>
            onResolve(
              resolution({
                resolutionType: 'timeout',
                isCorrect: false,
                signals: { timedOut: true },
              }),
            )
          }
        >
          resolve timeout
        </button>
      </div>
    );
  }
  return StubRenderer;
}

function renderGate() {
  const onResolve = vi.fn();
  const onAttempt = vi.fn();
  const Gate = withFeedbackGate(makeStubRenderer());
  render(
    <Gate
      card={tinyLogicCard()}
      context={{
        sessionId: 'sess-1',
        cardIndex: 0,
        activeAtMs: 0,
        interactionEnabledAtMs: 0,
      }}
      onAttempt={onAttempt}
      onResolve={onResolve}
    />,
  );
  return { onResolve, onAttempt };
}

// ---------------------------------------------------------------------------
// In play: the inner renderer shows and the feed has not advanced.
// ---------------------------------------------------------------------------

describe('FeedbackGate — while the card is in play', () => {
  it('renders the inner renderer and not the feedback step', () => {
    renderGate();

    expect(screen.getByTestId('stub-renderer')).toBeInTheDocument();
    expect(screen.queryByTestId('card-feedback')).not.toBeInTheDocument();
  });

  it('forwards onAttempt without advancing the feed', () => {
    const { onAttempt, onResolve } = renderGate();

    fireEvent.click(screen.getByText('attempt'));

    expect(onAttempt).toHaveBeenCalledWith({ touched: true });
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('forwards the feed ACTIVATION signal (isActive) to the inner renderer (#137)', () => {
    // The real renderers are wrapped by this gate, so a dropped `isActive` would
    // leave their timed pre-phase ungated in production. Probe the value the gate
    // hands the inner renderer.
    function Probe({ isActive }: TemplateProps<LiquidCard>) {
      return <span data-testid="probe">{isActive ? 'active' : 'inactive'}</span>;
    }
    const Gate = withFeedbackGate(Probe);
    const ctx = {
      sessionId: 's',
      cardIndex: 0,
      activeAtMs: 0,
      interactionEnabledAtMs: 0,
    };
    const { rerender } = render(
      <Gate
        card={tinyLogicCard()}
        context={ctx}
        isActive={false}
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('inactive');

    rerender(
      <Gate
        card={tinyLogicCard()}
        context={ctx}
        isActive
        onAttempt={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('active');
  });
});

// ---------------------------------------------------------------------------
// On resolve: pause on feedback + explanation; do NOT advance until "Next".
// ---------------------------------------------------------------------------

describe('FeedbackGate — feedback + explanation step', () => {
  it('shows the feedback + explanation and does not advance on resolve', () => {
    const { onResolve } = renderGate();

    fireEvent.click(screen.getByText('resolve correct'));

    // The card was replaced by the uniform feedback step.
    expect(screen.queryByTestId('stub-renderer')).not.toBeInTheDocument();
    const feedback = screen.getByTestId('card-feedback');
    expect(feedback).toHaveAttribute('data-outcome', 'correct');
    expect(screen.getByText('Correct')).toBeInTheDocument();
    // The outcome is announced via a polite live region (populated post-mount so
    // assistive tech hears the mutation, not silent initial content).
    const liveRegion = feedback.querySelector('[role="status"][aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent('Correct.');
    // The card's authored explanation is shown.
    expect(screen.getByText('Why opt-2 is right')).toBeInTheDocument();
    expect(
      screen.getByText('All A are B, and X is A, so X must be B.'),
    ).toBeInTheDocument();
    // The controller's onResolve has NOT fired — the feed is paused.
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('advances (fires the controller onResolve once) only on "Next"', () => {
    const { onResolve } = renderGate();

    fireEvent.click(screen.getByText('resolve correct'));
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('feedback-next'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionType: 'correct', isCorrect: true }),
    );
  });

  it('reports an incorrect resolution as "Not quite"', () => {
    const { onResolve } = renderGate();

    fireEvent.click(screen.getByText('resolve incorrect'));

    expect(screen.getByTestId('card-feedback')).toHaveAttribute(
      'data-outcome',
      'incorrect',
    );
    expect(screen.getByText('Not quite')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feedback-next'));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionType: 'incorrect', isCorrect: false }),
    );
  });

  it('reports a timeout resolution as "Time\'s up" and carries the signal', () => {
    const { onResolve } = renderGate();

    fireEvent.click(screen.getByText('resolve timeout'));

    expect(screen.getByTestId('card-feedback')).toHaveAttribute(
      'data-outcome',
      'timeout',
    );
    expect(screen.getByText("Time's up")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feedback-next'));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutionType: 'timeout',
        signals: { timedOut: true },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Play again: replay the SAME card; each replay counts as a new play.
// ---------------------------------------------------------------------------

/** A stub that calls `onMount` each time it mounts, so a remount is observable. */
function makeMountCountingRenderer(
  onMount: () => void,
): TemplateRenderer<LiquidCard> {
  function Counting({ onResolve }: TemplateProps<LiquidCard>) {
    useEffect(onMount, [onMount]);
    return (
      <button
        type="button"
        data-testid="stub-renderer"
        onClick={() => onResolve(resolution())}
      >
        resolve correct
      </button>
    );
  }
  return Counting;
}

describe('FeedbackGate — Play again (replay)', () => {
  function renderReplayGate() {
    const onResolve = vi.fn();
    const onReplayRecord = vi.fn();
    const onMount = vi.fn();
    const Gate = withFeedbackGate(makeMountCountingRenderer(onMount));
    render(
      <CardReplayProvider handler={onReplayRecord}>
        <Gate
          card={tinyLogicCard()}
          context={{
            sessionId: 'sess-1',
            cardIndex: 0,
            activeAtMs: 0,
            interactionEnabledAtMs: 0,
          }}
          onAttempt={vi.fn()}
          onResolve={onResolve}
        />
      </CardReplayProvider>,
    );
    return { onResolve, onReplayRecord, onMount };
  }

  it('records the attempt and remounts the same card on "Play again"', () => {
    const { onResolve, onReplayRecord, onMount } = renderReplayGate();
    expect(onMount).toHaveBeenCalledTimes(1); // initial mount

    fireEvent.click(screen.getByTestId('stub-renderer')); // resolve
    expect(screen.getByTestId('card-feedback')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feedback-replay'));

    // The replay was recorded as a play (the card + its resolution)…
    expect(onReplayRecord).toHaveBeenCalledTimes(1);
    expect(onReplayRecord).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1' }),
      expect.objectContaining({ resolutionType: 'correct' }),
    );
    // …the normal advance path did NOT fire (that is "Next")…
    expect(onResolve).not.toHaveBeenCalled();
    // …and the card is back in play, freshly remounted.
    expect(screen.queryByTestId('card-feedback')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-renderer')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(2); // remounted
  });

  it('still offers "Play again" but no-ops recording without a provider', () => {
    const onResolve = vi.fn();
    const Gate = withFeedbackGate(makeStubRenderer());
    render(
      <Gate
        card={tinyLogicCard()}
        context={{
          sessionId: 's',
          cardIndex: 0,
          activeAtMs: 0,
          interactionEnabledAtMs: 0,
        }}
        onAttempt={vi.fn()}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByText('resolve correct'));
    // No provider → replay must not throw and must not advance the feed.
    expect(() =>
      fireEvent.click(screen.getByTestId('feedback-replay')),
    ).not.toThrow();
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByTestId('stub-renderer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// createFeedRegistry: wraps present slots, leaves absent slots absent.
// ---------------------------------------------------------------------------

describe('createFeedRegistry', () => {
  it('wraps only the slots present in the base registry', () => {
    // The stub is typed at the LiquidCard base; the slot expects the concrete
    // per-template renderer, so cast through the same seam the registry uses.
    const base = { tiny_logic: makeStubRenderer() } as RendererRegistry;

    const decorated = createFeedRegistry(base);

    // The present slot is wrapped (a different component than the base).
    expect(decorated.tiny_logic).toBeDefined();
    expect(decorated.tiny_logic).not.toBe(base.tiny_logic);
    // Absent slots stay absent so the controller's fail-safe still applies.
    expect(decorated.spot_it).toBeUndefined();
  });
});
