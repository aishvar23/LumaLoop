// Ported from web `src/templates/contract.ts`; source of truth is the web app —
// keep in sync (Phase M, M2). Types only — the React renderers are rebuilt
// natively in M4. See `mobile/src/core/README.md`.
/**
 * Shared template-rendering contract (Technical Design §7).
 *
 * These are pure types only. Every template renderer implements this contract
 * so the session engine stays template-agnostic: controllers own progression,
 * renderers own only card interaction.
 *
 * NOTE: this module stays pure types only. The renderer-side timeout semantics
 * (arming a per-card `timeLimitMs` countdown and emitting a
 * `resolutionType: 'timeout'` resolution on expiry) are implemented once as a
 * shared primitive in `./useCardTimer` + `./timeoutResolution`, so every
 * renderer consumes the same behavior instead of re-deriving it.
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
 *
 * `isActive` is the feed's ACTIVATION signal: true only for the focused/active
 * slide, false for slides the feed has PRE-MOUNTED off-screen (windowing). It is
 * template-AGNOSTIC — the feed passes the same flag to every renderer regardless
 * of `templateType`, and most renderers ignore it. Renderers with a timed PRE-phase
 * (e.g. `what_changed`'s memorize preview) MUST NOT start that phase's countdown
 * until `isActive` is true, otherwise a pre-mounted slide's preview could elapse
 * before the user ever swipes to it. Omitted ≡ active, so a renderer rendered
 * standalone (tests, isolation) behaves exactly as before.
 */
export type TemplateProps<TCard extends LiquidCard> = {
  card: TCard;
  context: CardStartContext;
  isActive?: boolean;
  onAttempt: (signals?: Record<string, number | string | boolean>) => void;
  onResolve: (resolution: CardResolution) => void;
};
