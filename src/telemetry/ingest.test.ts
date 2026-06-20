/**
 * Tests for the telemetry ingestion core (#45). Exercises validation/mapping and
 * the injected-persist request handler with no server — fake persist, real
 * `Request`/`Response` (available in the test runtime).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createIngestHandler,
  validateAndMapTelemetryEvent,
  type PersistResult,
  type TelemetryEventRow,
} from './ingest';

const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** A maximally-populated, valid §10 payload (camelCase, as the client sends). */
function fullPayload(): Record<string, unknown> {
  return {
    eventId: VALID_UUID,
    eventName: 'Card_Resolved',
    anonymousUserId: 'anon-1',
    sessionId: 'sess-1',
    timestampMs: 1_700_000_000_000,
    cardId: 'card-1',
    cardIndex: 2,
    templateType: 'spot_it',
    category: 'visual_attention',
    evidenceTier: 'mechanic_mapped',
    difficulty: 'easy',
    routeKind: 'session',
    source: 'direct',
    elapsedMs: 1234,
    interactionElapsedMs: 999,
    isCorrect: true,
    resolutionType: 'correct',
    attemptCount: 1,
    measuredSignals: ['speed', 'accuracy'],
  };
}

function minimalPayload(): Record<string, unknown> {
  return {
    eventId: VALID_UUID,
    eventName: 'Session_Initialized',
    anonymousUserId: 'anon-1',
    sessionId: 'sess-1',
    timestampMs: 1_700_000_000_000,
  };
}

describe('validateAndMapTelemetryEvent', () => {
  it('maps a full payload to snake_case columns', () => {
    const result = validateAndMapTelemetryEvent(fullPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual<TelemetryEventRow>({
      event_id: VALID_UUID,
      event_name: 'Card_Resolved',
      anonymous_user_id: 'anon-1',
      session_id: 'sess-1',
      timestamp_ms: 1_700_000_000_000,
      card_id: 'card-1',
      card_index: 2,
      template_type: 'spot_it',
      category: 'visual_attention',
      evidence_tier: 'mechanic_mapped',
      difficulty: 'easy',
      route_kind: 'session',
      source: 'direct',
      elapsed_ms: 1234,
      interaction_elapsed_ms: 999,
      is_correct: true,
      resolution_type: 'correct',
      attempt_count: 1,
      measured_signals: ['speed', 'accuracy'],
    });
  });

  it('accepts a minimal payload (envelope only) and omits absent columns', () => {
    const result = validateAndMapTelemetryEvent(minimalPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual({
      event_id: VALID_UUID,
      event_name: 'Session_Initialized',
      anonymous_user_id: 'anon-1',
      session_id: 'sess-1',
      timestamp_ms: 1_700_000_000_000,
    });
    expect('card_id' in result.row).toBe(false);
  });

  it('STRIPS unknown / PII keys (§16) — they never reach a column', () => {
    const result = validateAndMapTelemetryEvent({
      ...minimalPayload(),
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      email: 'a@b.com',
      name: 'Real Name',
      extra: { nested: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const banned of ['ip', 'userAgent', 'email', 'name', 'extra']) {
      expect(banned in result.row).toBe(false);
    }
    expect(Object.keys(result.row)).toEqual([
      'event_id',
      'event_name',
      'anonymous_user_id',
      'session_id',
      'timestamp_ms',
    ]);
  });

  it.each([
    ['eventId', { eventId: 'not-a-uuid' }, 'eventId must be a UUID'],
    ['eventId missing', { eventId: undefined }, 'eventId must be a UUID'],
    ['eventName', { eventName: 'Bogus_Event' }, 'eventName is not a known telemetry event'],
    ['anonymousUserId', { anonymousUserId: '' }, 'anonymousUserId must be a non-empty string'],
    ['sessionId', { sessionId: 123 }, 'sessionId must be a non-empty string'],
    ['timestampMs', { timestampMs: 1.5 }, 'timestampMs must be an integer'],
    ['timestampMs NaN', { timestampMs: Number.NaN }, 'timestampMs must be an integer'],
  ])('rejects a bad required field: %s', (_label, override, expectedError) => {
    const result = validateAndMapTelemetryEvent({ ...minimalPayload(), ...override });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(expectedError);
  });

  it('rejects a non-object payload (array / null / primitive)', () => {
    for (const bad of [[], null, 'x', 42, true]) {
      expect(validateAndMapTelemetryEvent(bad).ok).toBe(false);
    }
  });

  it('rejects wrong-typed optionals', () => {
    expect(validateAndMapTelemetryEvent({ ...minimalPayload(), cardIndex: '2' }).ok).toBe(false);
    expect(validateAndMapTelemetryEvent({ ...minimalPayload(), isCorrect: 'yes' }).ok).toBe(false);
    expect(validateAndMapTelemetryEvent({ ...minimalPayload(), templateType: 7 }).ok).toBe(false);
    expect(
      validateAndMapTelemetryEvent({ ...minimalPayload(), measuredSignals: [1, 2] }).ok,
    ).toBe(false);
  });

  it('rejects unknown stable categoricals (source / resolutionType)', () => {
    expect(validateAndMapTelemetryEvent({ ...minimalPayload(), source: 'spam' }).ok).toBe(false);
    expect(
      validateAndMapTelemetryEvent({ ...minimalPayload(), resolutionType: 'maybe' }).ok,
    ).toBe(false);
  });

  it('allows open-ended categoricals as any string (extensible TEXT columns)', () => {
    const result = validateAndMapTelemetryEvent({
      ...minimalPayload(),
      templateType: 'estimate_fast', // a not-yet-shipped game must still ingest
      category: 'some_new_category',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.template_type).toBe('estimate_fast');
    expect(result.row.category).toBe('some_new_category');
  });
});

describe('createIngestHandler', () => {
  function postRequest(body: unknown): Request {
    return new Request('https://example.com/api/event', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('persists a valid event and returns 204', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => ({ ok: true, status: 201 }));
    const handler = createIngestHandler({ persist });

    const res = await handler(postRequest(fullPayload()));

    expect(res.status).toBe(204);
    expect(persist).toHaveBeenCalledTimes(1);
    const row = persist.mock.calls[0][0];
    expect(row.event_id).toBe(VALID_UUID);
    expect(row.event_name).toBe('Card_Resolved');
  });

  it('rejects a non-POST method with 405 + Allow', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => ({ ok: true }));
    const handler = createIngestHandler({ persist });

    const res = await handler(
      new Request('https://example.com/api/event', { method: 'GET' }),
    );

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns 400 on unparseable JSON (and does not persist)', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => ({ ok: true }));
    const handler = createIngestHandler({ persist });

    const res = await handler(postRequest('{not json'));

    expect(res.status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid payload (and does not persist)', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => ({ ok: true }));
    const handler = createIngestHandler({ persist });

    const res = await handler(postRequest({ ...minimalPayload(), eventName: 'nope' }));

    expect(res.status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns 502 when the store rejects the event', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => ({ ok: false, status: 500 }));
    const handler = createIngestHandler({ persist });

    const res = await handler(postRequest(minimalPayload()));

    expect(res.status).toBe(502);
  });

  it('returns 500 (never throws) when persist throws', async () => {
    const persist = vi.fn(async (_row: TelemetryEventRow): Promise<PersistResult> => {
      throw new Error('network down');
    });
    const handler = createIngestHandler({ persist });

    const res = await handler(postRequest(minimalPayload()));

    expect(res.status).toBe(500);
  });
});
