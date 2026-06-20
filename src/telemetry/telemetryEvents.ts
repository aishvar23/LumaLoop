/**
 * Telemetry event names and payload type (Technical Design §10; reworked for the
 * endless feed per docs/FEED_DIRECTION.md §6).
 *
 * This module is the single source of truth for the telemetry contract:
 *   - the event NAMES (as symbolic constants + a typed union), so call sites
 *     reference names symbolically rather than as bare string literals;
 *   - the on-the-wire {@link TelemetryEvent} payload shape, mirroring §10 exactly;
 *   - {@link QueuedTelemetryEvent}, the payload as actually transmitted, carrying
 *     the client-generated `eventId` used for idempotent retry de-duplication.
 *
 * Feed rework (FEED_DIRECTION §6): the bounded-session ceremony events
 * (`Session_Completed`, `Exit_Clicked`, `Intentional_Continue_Clicked`) and the
 * receipt's `Receipt_Shared` were RETIRED with the session flow (#107). The kept
 * envelope events were REMAPPED to feed semantics (see each constant's comment)
 * and the feed's free-scroll signals (`Card_Skipped`, `Card_Abandoned`) were
 * ADDED. The DB columns are intentionally TEXT and `event_name` is free-form, so
 * this change needs NO migration — and `ingest.ts`'s ingest whitelist DERIVES
 * from `Object.values(TelemetryEventNames)`, so it tracks this set automatically.
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
 * The feed telemetry events (Technical Design §10, reworked per FEED_DIRECTION
 * §6). Exposed as a frozen map so downstream code (feed instrumentation, #108;
 * ingest whitelist) references names symbolically — `TelemetryEventNames.
 * Card_Resolved` — never as raw strings.
 *
 * Semantics under the endless feed (FEED_DIRECTION §6); the NAMES are unchanged
 * for the kept events so no migration/analytics break, only the meaning shifts:
 *   - `Session_Initialized`     — the feed was opened (once per feed mount/visit).
 *   - `Return_Session_Started`  — a return visit; HEADLINE organic-return metric,
 *                                 filtered on `source: 'direct'`.
 *   - `Session_Abandoned`       — the user left the app/feed (best-effort via
 *                                 `visibilitychange`/`pagehide`; at-most-once).
 *   - `Card_Rendered`           — a game became ACTIVE/focused (snapped into view),
 *                                 NOT merely mounted.
 *   - `Card_Attempted`          — first interaction with the active game (engage).
 *   - `Card_Resolved`           — the active game resolved (correct/incorrect/timeout).
 *   - `Card_Explanation_Viewed` — the explanation step became visible for a game.
 *   - `Card_Skipped`            — a game was swiped past WITHOUT being engaged.
 *   - `Card_Abandoned`          — a game was engaged then left BEFORE it resolved.
 *
 * RETIRED with the bounded session (#107), intentionally absent here:
 * `Session_Completed`, `Exit_Clicked`, `Intentional_Continue_Clicked` (no session
 * ceremony), and `Receipt_Shared` (the receipt was deleted in #107). A share
 * event returns in Phase 2 (FEED_DIRECTION §10) IF/when sharing is added.
 */
export const TelemetryEventNames = Object.freeze({
  Session_Initialized: 'Session_Initialized',
  Card_Rendered: 'Card_Rendered',
  Card_Attempted: 'Card_Attempted',
  Card_Resolved: 'Card_Resolved',
  Card_Explanation_Viewed: 'Card_Explanation_Viewed',
  Card_Skipped: 'Card_Skipped',
  Card_Abandoned: 'Card_Abandoned',
  Session_Abandoned: 'Session_Abandoned',
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
