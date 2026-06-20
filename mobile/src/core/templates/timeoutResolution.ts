// Ported from web `src/templates/timeoutResolution.ts`; source of truth is the
// web app — keep in sync (Phase M, M2). `useCardTimer` (a React hook) is NOT
// ported — RN timing is M4. See `mobile/src/core/README.md`.
/**
 * Pure builder for a TIMEOUT card resolution (Technical Design §7).
 *
 * A timeout is a *resolved incorrect* card — never a skipped or abandoned one —
 * so this helper forces the timeout-defining fields and refuses to let callers
 * override them: `resolutionType: 'timeout'`, `isCorrect: false`, and
 * `signals.timedOut: true`. Template-specific `signals` (e.g. how far the
 * player got before the clock ran out) are merged in first, then the forced
 * `timedOut` flag wins.
 *
 * Kept pure and React-free so it is independently unit-testable; the renderer
 * timeout hook (`./useCardTimer`) is its only production caller.
 */

import type { CardResolution } from './contract';

/** Per-card measurements the timer knows at expiry. */
export type TimeoutResolutionInput = {
  cardId: string;
  /** Time since the card became active (`context.activeAtMs`), at expiry. */
  elapsedMs: number;
  /** Time since input became measurable (`context.interactionEnabledAtMs`). */
  interactionElapsedMs: number;
  /** Attempts the renderer observed before the timer fired. */
  attemptCount: number;
  /** Optional template-specific signals; `timedOut` is always forced true. */
  signals?: Record<string, number | string | boolean>;
};

/**
 * Build the single `CardResolution` a renderer emits when `timeLimitMs`
 * elapses. The timeout-defining fields are forced and cannot be overridden by
 * the supplied `signals`.
 */
export function buildTimeoutResolution(
  input: TimeoutResolutionInput,
): CardResolution {
  return {
    cardId: input.cardId,
    resolutionType: 'timeout',
    isCorrect: false,
    elapsedMs: input.elapsedMs,
    interactionElapsedMs: input.interactionElapsedMs,
    attemptCount: input.attemptCount,
    // Merge template signals first, then force `timedOut: true` so a caller
    // cannot accidentally (or deliberately) report a timeout as not-timed-out.
    signals: { ...input.signals, timedOut: true },
  };
}
