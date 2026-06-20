/**
 * Telemetry ingestion logic (Azure DevOps #45, Technical Design §10 / §16).
 *
 * Runtime-agnostic core for the `POST /api/event` endpoint: it validates an
 * incoming telemetry payload, maps it to the `telemetry_events` table row, and
 * exposes a thin request handler. The Vercel Edge function in `api/event.ts` is
 * a wiring shell around {@link createIngestHandler} — all logic lives here so it
 * unit-tests without a server (CLAUDE.md §3).
 *
 * Privacy (§16): the mapping is a strict WHITELIST — only the known §10 fields
 * are copied to columns, so any injected `ip`/`userAgent`/`email`/etc. is
 * silently dropped, never persisted. The endpoint also never reads the request
 * IP or User-Agent into the row. No PII reaches the database.
 *
 * Integrity: `eventId` (a client-generated UUID) is the table PRIMARY KEY, so a
 * retried POST of the same event de-duplicates server-side (the persist layer
 * uses on-conflict-do-nothing). The categorical fields that are STABLE
 * (`eventName`, `source`, `resolutionType`) are validated against their §10
 * value sets; the open-ended categoricals (`templateType`, `category`,
 * `difficulty`, `evidenceTier`) are type-checked but not enumerated — the DB
 * columns are intentionally TEXT so adding a new game needs no migration
 * (CLAUDE.md §6, mirrored in supabase/migrations/0001_telemetry_events.sql).
 */

import { TelemetryEventNames } from './telemetryEvents';

/** The §10 event names, as a runtime set for validation. */
const VALID_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(TelemetryEventNames),
);

/** Stable §10 attribution sources. */
const VALID_SOURCES: ReadonlySet<string> = new Set([
  'direct',
  'reminder',
  'share',
  'manual_test',
]);

/** Stable resolution outcomes (mirrors `ResolutionType` in templates/contract). */
const VALID_RESOLUTION_TYPES: ReadonlySet<string> = new Set([
  'correct',
  'incorrect',
  'timeout',
]);

/** RFC-4122 UUID (any version) — `event_id` is a Postgres `uuid` column. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A validated row ready for `public.telemetry_events` (snake_case columns).
 * Optional columns are omitted (not `null`) when the payload didn't carry them.
 */
export interface TelemetryEventRow {
  event_id: string;
  event_name: string;
  anonymous_user_id: string;
  session_id: string;
  timestamp_ms: number;
  card_id?: string;
  card_index?: number;
  template_type?: string;
  category?: string;
  evidence_tier?: string;
  difficulty?: string;
  route_kind?: string;
  source?: string;
  elapsed_ms?: number;
  interaction_elapsed_ms?: number;
  is_correct?: boolean;
  resolution_type?: string;
  attempt_count?: number;
  measured_signals?: string[];
}

/** Result of validating + mapping an untrusted payload. */
export type ValidationResult =
  | { ok: true; row: TelemetryEventRow }
  | { ok: false; error: string };

/** Outcome of persisting a row (returned by the injected persist function). */
export interface PersistResult {
  ok: boolean;
  /** Upstream status, for logging/observability; never surfaced to the client. */
  status?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validate an untrusted telemetry payload and map it to a {@link TelemetryEventRow}.
 * Returns a typed error (never throws) so the handler can answer `400` with a
 * safe, shape-only message. Unknown keys are ignored by construction.
 */
export function validateAndMapTelemetryEvent(payload: unknown): ValidationResult {
  if (!isPlainObject(payload)) {
    return { ok: false, error: 'payload must be a JSON object' };
  }

  // --- Required envelope (Technical Design §10). ---
  const { eventId, eventName, anonymousUserId, sessionId, timestampMs } = payload;

  if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) {
    return { ok: false, error: 'eventId must be a UUID' };
  }
  if (typeof eventName !== 'string' || !VALID_EVENT_NAMES.has(eventName)) {
    return { ok: false, error: 'eventName is not a known telemetry event' };
  }
  if (typeof anonymousUserId !== 'string' || anonymousUserId.length === 0) {
    return { ok: false, error: 'anonymousUserId must be a non-empty string' };
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: false, error: 'sessionId must be a non-empty string' };
  }
  if (!isFiniteInteger(timestampMs)) {
    return { ok: false, error: 'timestampMs must be an integer' };
  }

  const row: TelemetryEventRow = {
    event_id: eventId,
    event_name: eventName,
    anonymous_user_id: anonymousUserId,
    session_id: sessionId,
    timestamp_ms: timestampMs,
  };

  // --- Optional fields: present ⇒ must be the right type (else 400). Absent or
  // explicitly null/undefined ⇒ simply omitted. Unknown keys never reach here. ---
  const stringCols: ReadonlyArray<[keyof TelemetryEventRow, unknown]> = [
    ['card_id', payload.cardId],
    ['template_type', payload.templateType],
    ['category', payload.category],
    ['evidence_tier', payload.evidenceTier],
    ['difficulty', payload.difficulty],
    ['route_kind', payload.routeKind],
  ];
  for (const [col, value] of stringCols) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { ok: false, error: `${col} must be a string` };
    (row[col] as string) = value;
  }

  const intCols: ReadonlyArray<[keyof TelemetryEventRow, unknown]> = [
    ['card_index', payload.cardIndex],
    ['elapsed_ms', payload.elapsedMs],
    ['interaction_elapsed_ms', payload.interactionElapsedMs],
    ['attempt_count', payload.attemptCount],
  ];
  for (const [col, value] of intCols) {
    if (value === undefined || value === null) continue;
    if (!isFiniteInteger(value)) return { ok: false, error: `${col} must be an integer` };
    (row[col] as number) = value;
  }

  if (payload.isCorrect !== undefined && payload.isCorrect !== null) {
    if (typeof payload.isCorrect !== 'boolean') {
      return { ok: false, error: 'isCorrect must be a boolean' };
    }
    row.is_correct = payload.isCorrect;
  }

  if (payload.source !== undefined && payload.source !== null) {
    if (typeof payload.source !== 'string' || !VALID_SOURCES.has(payload.source)) {
      return { ok: false, error: 'source is not a known attribution source' };
    }
    row.source = payload.source;
  }

  if (payload.resolutionType !== undefined && payload.resolutionType !== null) {
    if (
      typeof payload.resolutionType !== 'string' ||
      !VALID_RESOLUTION_TYPES.has(payload.resolutionType)
    ) {
      return { ok: false, error: 'resolutionType is not a known resolution' };
    }
    row.resolution_type = payload.resolutionType;
  }

  if (payload.measuredSignals !== undefined && payload.measuredSignals !== null) {
    const signals = payload.measuredSignals;
    if (!Array.isArray(signals) || !signals.every((s) => typeof s === 'string')) {
      return { ok: false, error: 'measuredSignals must be an array of strings' };
    }
    row.measured_signals = signals;
  }

  return { ok: true, row };
}

/** Small JSON `Response` helper (no CORS — the client posts same-origin). */
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Build the `POST /api/event` request handler. `persist` is injected (the Edge
 * function supplies a Supabase REST writer; tests supply a fake), so this is
 * fully unit-testable. The handler never throws and never leaks upstream detail:
 *   - non-POST            → 405
 *   - unparseable body    → 400
 *   - invalid payload     → 400 (shape-only message)
 *   - persist failure     → 502
 *   - unexpected error    → 500
 *   - success             → 204 (no body)
 */
export function createIngestHandler(deps: {
  persist: (row: TelemetryEventRow) => Promise<PersistResult>;
}): (request: Request) => Promise<Response> {
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }

    let parsed: unknown;
    try {
      const text = await request.text();
      parsed = JSON.parse(text) as unknown;
    } catch {
      return jsonResponse(400, { error: 'body must be valid JSON' });
    }

    const result = validateAndMapTelemetryEvent(parsed);
    if (!result.ok) {
      return jsonResponse(400, { error: result.error });
    }

    try {
      const persisted = await deps.persist(result.row);
      if (!persisted.ok) {
        return jsonResponse(502, { error: 'telemetry store rejected the event' });
      }
      return new Response(null, { status: 204 });
    } catch {
      return jsonResponse(500, { error: 'internal error' });
    }
  };
}
