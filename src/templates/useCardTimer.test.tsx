/**
 * Tests for the shared renderer-side timeout primitive (Azure DevOps #60;
 * Technical Design §7).
 *
 * The hook is exercised through a tiny test-only STUB renderer — never a real
 * template renderer (#64-67) — so the template-agnostic boundary stays honest.
 * The clock is always injected and the countdown is driven by vitest fake
 * timers, so no assertion depends on the real `Date.now()`.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TinyLogicCard } from '../cards/types';
import type { CardResolution, CardStartContext, TemplateProps } from './contract';
import { buildTimeoutResolution } from './timeoutResolution';
import { useCardTimer } from './useCardTimer';

// ---------------------------------------------------------------------------
// Test card + context factories.
// ---------------------------------------------------------------------------

function tinyLogicCard(cardId: string, timeLimitMs: number): TinyLogicCard {
  return {
    cardId,
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'stub',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['accuracy'] },
    explanation: { title: 't', body: 'b' },
    config: {
      stem: 'stub?',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      correctOptionId: 'a',
      timeLimitMs,
    },
  };
}

function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_200,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stub renderer — drives the hook via buttons. NOT a real template renderer.
// ---------------------------------------------------------------------------

type StubProps = TemplateProps<TinyLogicCard> & {
  now?: () => number;
  timeoutSignals?: () => Record<string, number | string | boolean>;
};

function TimedStub({ card, context, onResolve, now, timeoutSignals }: StubProps) {
  const timer = useCardTimer({ card, context, onResolve, now, timeoutSignals });
  return (
    <div>
      <button type="button" onClick={() => timer.markAttempt()}>
        attempt
      </button>
      <button
        type="button"
        onClick={() =>
          timer.resolve({
            cardId: card.cardId,
            resolutionType: 'correct',
            isCorrect: true,
            elapsedMs: 5,
            interactionElapsedMs: 4,
            attemptCount: 1,
            signals: {},
          })
        }
      >
        resolve
      </button>
      <button type="button" onClick={() => timer.cancel()}>
        cancel
      </button>
    </div>
  );
}

type Harness = { onResolve: ReturnType<typeof vi.fn>; unmount: () => void };

function renderStub(opts: {
  timeLimitMs?: number;
  context?: CardStartContext;
  now?: () => number;
  timeoutSignals?: () => Record<string, number | string | boolean>;
  cardId?: string;
}): Harness {
  const onResolve = vi.fn();
  const card = tinyLogicCard(opts.cardId ?? 'c0', opts.timeLimitMs ?? 10_000);
  const { unmount } = render(
    <TimedStub
      card={card}
      context={opts.context ?? startContext()}
      onResolve={onResolve}
      onAttempt={() => {}}
      now={opts.now}
      timeoutSignals={opts.timeoutSignals}
    />,
  );
  return { onResolve, unmount };
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const click = (label: string) =>
  act(() => void fireEvent.click(screen.getByText(label)));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure helper.
// ---------------------------------------------------------------------------

describe('buildTimeoutResolution', () => {
  it('forces the timeout-defining fields and passes through measurements', () => {
    const resolution = buildTimeoutResolution({
      cardId: 'c0',
      elapsedMs: 10_000,
      interactionElapsedMs: 9_800,
      attemptCount: 2,
      signals: { progress: 3 },
    });

    expect(resolution).toEqual<CardResolution>({
      cardId: 'c0',
      resolutionType: 'timeout',
      isCorrect: false,
      elapsedMs: 10_000,
      interactionElapsedMs: 9_800,
      attemptCount: 2,
      signals: { progress: 3, timedOut: true },
    });
  });

  it('forces timedOut: true even when signals try to set it false', () => {
    const resolution = buildTimeoutResolution({
      cardId: 'c0',
      elapsedMs: 1,
      interactionElapsedMs: 1,
      attemptCount: 0,
      signals: { timedOut: false },
    });
    expect(resolution.signals.timedOut).toBe(true);
  });

  it('defaults signals to just the forced timedOut flag', () => {
    const resolution = buildTimeoutResolution({
      cardId: 'c0',
      elapsedMs: 1,
      interactionElapsedMs: 1,
      attemptCount: 0,
    });
    expect(resolution.signals).toEqual({ timedOut: true });
  });
});

// ---------------------------------------------------------------------------
// The hook.
// ---------------------------------------------------------------------------

describe('useCardTimer', () => {
  it('fires a timeout resolution at exactly timeLimitMs off the injected clock', () => {
    let clock = 1_000;
    const { onResolve } = renderStub({
      timeLimitMs: 10_000,
      context: startContext({ activeAtMs: 1_000, interactionEnabledAtMs: 1_200 }),
      now: () => clock,
      cardId: 'c-timeout',
    });

    // One tick short of the limit: nothing fires.
    advance(9_999);
    expect(onResolve).not.toHaveBeenCalled();

    // At the limit the clock has advanced to activeAt + timeLimit.
    clock = 11_000;
    advance(1);

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0] as CardResolution;
    expect(resolution.cardId).toBe('c-timeout');
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.elapsedMs).toBe(10_000); // 11_000 - 1_000
    expect(resolution.interactionElapsedMs).toBe(9_800); // 11_000 - 1_200
  });

  it('disarms when the renderer resolves before expiry (no late timeout)', () => {
    let clock = 1_000;
    const { onResolve } = renderStub({ timeLimitMs: 10_000, now: () => clock });

    clock = 4_000;
    click('resolve');
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect((onResolve.mock.calls[0][0] as CardResolution).resolutionType).toBe('correct');

    // Advancing well past the limit must not produce a second resolution.
    clock = 99_000;
    advance(50_000);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('cancel() disarms the timer without resolving', () => {
    const { onResolve } = renderStub({ timeLimitMs: 10_000, now: () => 1_000 });

    click('cancel');
    advance(20_000);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('reflects the observed attempt count on the timeout resolution', () => {
    const { onResolve } = renderStub({ timeLimitMs: 10_000, now: () => 11_000 });

    click('attempt');
    click('attempt');
    advance(10_000);

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect((onResolve.mock.calls[0][0] as CardResolution).attemptCount).toBe(2);
  });

  it('merges template signals but cannot override the forced timeout fields', () => {
    const { onResolve } = renderStub({
      timeLimitMs: 10_000,
      now: () => 11_000,
      // A misbehaving template tries to claim the card was not timed out.
      timeoutSignals: () => ({ timedOut: false, progress: 3, lastChoice: 'b' }),
    });

    advance(10_000);

    const resolution = onResolve.mock.calls[0][0] as CardResolution;
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true); // forced
    expect(resolution.signals.progress).toBe(3); // merged
    expect(resolution.signals.lastChoice).toBe('b'); // merged
  });

  it('leaves no armed timer and fires nothing after unmount', () => {
    const { onResolve, unmount } = renderStub({ timeLimitMs: 10_000, now: () => 1_000 });

    act(() => unmount());
    expect(vi.getTimerCount()).toBe(0);

    advance(20_000);
    expect(onResolve).not.toHaveBeenCalled();
  });
});
