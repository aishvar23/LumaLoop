/**
 * Shared renderer-side timeout primitive (Technical Design §7).
 *
 * Every template renderer (#64-67) mounts this hook to arm a per-card countdown
 * for its card's `timeLimitMs`. On expiry the hook resolves the card as a
 * TIMEOUT via the shared {@link buildTimeoutResolution} helper, so timeout
 * behavior is implemented once here instead of re-derived per renderer.
 *
 * The hook is template-AGNOSTIC: it reads only `cardId` and the card config's
 * `timeLimitMs` (both common to every {@link LiquidCard} member) plus the
 * shared contract types — never a concrete template config by name beyond
 * extracting the limit.
 *
 * Design guarantees:
 *  - Single-fire: the card resolves at most once, whether by timeout or by the
 *    renderer's own correct/incorrect resolution.
 *  - Cancellable: a renderer that resolves the card itself disarms the timer so
 *    no late timeout fires; the timer is also cleared on unmount (no leaked
 *    timer, no setState-after-unmount — the hook holds no React state).
 *  - Injectable clock: `now` (default `Date.now`) drives the `elapsedMs` /
 *    `interactionElapsedMs` math, so timing is testable under fake timers
 *    without a real wall-clock dependency.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { LiquidCard } from '../cards/types';
import type { CardResolution, CardStartContext } from './contract';
import { buildTimeoutResolution } from './timeoutResolution';

type TemplateSignals = Record<string, number | string | boolean>;

export type UseCardTimerOptions = {
  /** The active card; only `cardId` and `config.timeLimitMs` are read. */
  card: LiquidCard;
  /** Start context for the card; supplies the clock origins. */
  context: CardStartContext;
  /** Renderer's single resolution sink (from `TemplateProps`). */
  onResolve: (resolution: CardResolution) => void;
  /** Injectable clock for the elapsed-time math. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Template-specific signals merged into the timeout resolution. Provided as
   * a getter so it is read AT expiry (e.g. how far the player got). The forced
   * timeout fields (`timedOut`/`resolutionType`/`isCorrect`) always win.
   */
  timeoutSignals?: () => TemplateSignals;
};

export type CardTimerControls = {
  /** Record an observed attempt; returns the running attempt count. */
  markAttempt: () => number;
  /**
   * Resolve the card from the renderer (correct/incorrect). Disarms the timer
   * and forwards exactly once; later timeouts or resolves are no-ops. This is
   * the recommended path for a renderer's own resolution.
   */
  resolve: (resolution: CardResolution) => void;
  /**
   * Disarm the timer without resolving — escape hatch for a renderer that calls
   * `onResolve` directly. Prefer {@link resolve} to keep the single-fire
   * guarantee in one place.
   */
  cancel: () => void;
};

export function useCardTimer(options: UseCardTimerOptions): CardTimerControls {
  const { card, context } = options;
  const { cardId } = card;
  const { timeLimitMs } = card.config;

  // Latest non-timing inputs live in refs so re-arming depends only on the
  // card's timing primitives, not on callback identity churn between renders.
  const onResolveRef = useRef(options.onResolve);
  const nowRef = useRef(options.now);
  const timeoutSignalsRef = useRef(options.timeoutSignals);
  onResolveRef.current = options.onResolve;
  nowRef.current = options.now;
  timeoutSignalsRef.current = options.timeoutSignals;

  // Per-card mutable state: attempts observed and the single-fire guard.
  const attemptsRef = useRef(0);
  const resolvedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Resolve at most once, disarming the timer on the way out.
  const finish = useCallback(
    (resolution: CardResolution) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      clearTimer();
      onResolveRef.current(resolution);
    },
    [clearTimer],
  );

  const markAttempt = useCallback(() => {
    attemptsRef.current += 1;
    return attemptsRef.current;
  }, []);

  const resolve = useCallback(
    (resolution: CardResolution) => finish(resolution),
    [finish],
  );

  const cancel = useCallback(() => {
    // Latch resolved so any in-flight timeout becomes a no-op, then disarm.
    resolvedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    // Arm a fresh per-card countdown. A new card identity or active window
    // resets the single-fire guard and the attempt count.
    resolvedRef.current = false;
    attemptsRef.current = 0;

    if (!Number.isFinite(timeLimitMs)) {
      return undefined;
    }

    const id = setTimeout(() => {
      timerRef.current = null;
      if (resolvedRef.current) return;
      const now = nowRef.current ?? Date.now;
      const firedAtMs = now();
      finish(
        buildTimeoutResolution({
          cardId,
          elapsedMs: firedAtMs - context.activeAtMs,
          interactionElapsedMs: firedAtMs - context.interactionEnabledAtMs,
          attemptCount: attemptsRef.current,
          signals: timeoutSignalsRef.current?.(),
        }),
      );
    }, Math.max(0, timeLimitMs));
    timerRef.current = id;

    return () => {
      clearTimeout(id);
      timerRef.current = null;
    };
  }, [
    cardId,
    timeLimitMs,
    context.activeAtMs,
    context.interactionEnabledAtMs,
    finish,
  ]);

  return { markAttempt, resolve, cancel };
}
