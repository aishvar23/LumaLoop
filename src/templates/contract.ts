/**
 * Shared template-rendering contract (Technical Design §7).
 *
 * These are pure types only. Every template renderer implements this contract
 * so the session engine stays template-agnostic: controllers own progression,
 * renderers own only card interaction.
 *
 * NOTE: timeout/timer behavior is intentionally NOT defined here. This module
 * is types only; the renderer-side timeout semantics (emitting
 * `resolutionType: 'timeout'` on `timeLimitMs` expiry, etc.) are owned by a
 * later task that implements the renderers.
 */

import type { LiquidCard } from '../cards/types';

/**
 * Context handed to a renderer when its card becomes the active/focused card.
 * `interactionEnabledAtMs` marks when input becomes measurable — it can be
 * later than `activeAtMs` for preview-based templates (e.g. `what_changed`).
 */
export type CardStartContext = {
  sessionId: string;
  cardIndex: number;
  activeAtMs: number;
  interactionEnabledAtMs: number;
};

/**
 * How a card was resolved. A timeout is a resolved incorrect card, not a
 * skipped or abandoned one (Technical Design §7).
 */
export type ResolutionType = 'correct' | 'incorrect' | 'timeout';

/**
 * The single result a renderer emits (exactly once) when its card resolves.
 * `signals` carries template-specific measurements for the session receipt and
 * telemetry; on timeout it must include `timedOut: true`.
 */
export type CardResolution = {
  cardId: string;
  resolutionType: ResolutionType;
  isCorrect: boolean;
  elapsedMs: number;
  interactionElapsedMs: number;
  attemptCount: number;
  signals: Record<string, number | string | boolean>;
};

/**
 * Props every template renderer accepts, generic over its concrete card type.
 * The renderer must not advance the feed; it calls `onAttempt` on the first
 * meaningful input and `onResolve` exactly once.
 */
export type TemplateProps<TCard extends LiquidCard> = {
  card: TCard;
  context: CardStartContext;
  onAttempt: (signals?: Record<string, number | string | boolean>) => void;
  onResolve: (resolution: CardResolution) => void;
};
