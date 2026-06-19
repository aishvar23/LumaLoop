/**
 * Telemetry event names and payload type (Technical Design §10).
 *
 * This module is the single source of truth for the telemetry contract:
 *   - the eleven event NAMES (as symbolic constants + a typed union), so call
 *     sites reference names symbolically rather than as bare string literals;
 *   - the on-the-wire {@link TelemetryEvent} payload shape, mirroring §10 exactly;
 *   - {@link QueuedTelemetryEvent}, the payload as actually transmitted, carrying
 *     the client-generated `eventId` used for idempotent retry de-duplication.
 *
 * NO PII (Technical Design §16): the payload intentionally has no field for
 * names, email, contacts, or device identifiers. IP/user-agent stripping happens
 * server-side at ingestion, never here. Any secret (anon/service key) stays
 * server-side; the client only POSTs the event payload below.
 */

import type {
  ChallengeCategory,
  Difficulty,
  EvidenceTier,
  TemplateType,
} from '../cards/types';
import type { ResolutionType } from '../templates/contract';

/**
 * The eleven telemetry events (Technical Design §10). Exposed as a frozen map so
 * downstream code (e.g. session instrumentation, #76) references names
 * symbolically — `TelemetryEventNames.Card_Resolved` — never as raw strings.
 */
export const TelemetryEventNames = Object.freeze({
  Session_Initialized: 'Session_Initialized',
  Card_Rendered: 'Card_Rendered',
  Card_Attempted: 'Card_Attempted',
  Card_Resolved: 'Card_Resolved',
  Card_Explanation_Viewed: 'Card_Explanation_Viewed',
  Session_Completed: 'Session_Completed',
  Session_Abandoned: 'Session_Abandoned',
  Receipt_Shared: 'Receipt_Shared',
  Exit_Clicked: 'Exit_Clicked',
  Intentional_Continue_Clicked: 'Intentional_Continue_Clicked',
  Return_Session_Started: 'Return_Session_Started',
} as const);

/** The union of every valid telemetry event name. */
export type TelemetryEventName =
  (typeof TelemetryEventNames)[keyof typeof TelemetryEventNames];

/** How the session was entered (Technical Design §10). */
export type TelemetryRouteKind = 'session' | 'card_deep_link';

/**
 * Attribution source for return/share metrics (Technical Design §10). Headline
 * return metrics use only `source: 'direct'`.
 */
export type TelemetrySource = 'direct' | 'reminder' | 'share' | 'manual_test';

/**
 * The telemetry payload, exactly per Technical Design §10. `eventName`,
 * `anonymousUserId`, `sessionId`, and `timestampMs` are always present; the rest
 * are populated only for the events that carry them.
 *
 * Reuses the domain types (`TemplateType`, `ChallengeCategory`, `EvidenceTier`,
 * `Difficulty`, `ResolutionType`) so the telemetry contract cannot drift from
 * the card/template contracts.
 */
export type TelemetryEvent = {
  eventName: TelemetryEventName;
  anonymousUserId: string;
  sessionId: string;
  timestampMs: number;
  cardId?: string;
  cardIndex?: number;
  templateType?: TemplateType;
  category?: ChallengeCategory;
  evidenceTier?: EvidenceTier;
  difficulty?: Difficulty;
  routeKind?: TelemetryRouteKind;
  source?: TelemetrySource;
  elapsedMs?: number;
  interactionElapsedMs?: number;
  isCorrect?: boolean;
  resolutionType?: ResolutionType;
  attemptCount?: number;
  measuredSignals?: string[];
};

/**
 * What a caller hands to the telemetry client. The client stamps `eventId`
 * (always) and `timestampMs` (if omitted), so callers need not supply either —
 * `timestampMs` stays optional here and is filled from the injectable clock.
 */
export type TelemetryEventInput = Omit<TelemetryEvent, 'timestampMs'> & {
  timestampMs?: number;
};

/**
 * The payload as transmitted: a {@link TelemetryEvent} plus the
 * client-generated `eventId` (an RFC-4122 v4 UUID). The server treats `eventId`
 * as the idempotency key so a retried POST of the same event de-duplicates
 * rather than double-counting.
 */
export type QueuedTelemetryEvent = TelemetryEvent & {
  eventId: string;
};
