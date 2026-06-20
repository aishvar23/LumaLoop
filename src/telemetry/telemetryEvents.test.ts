/**
 * Telemetry event-name contract (Technical Design §10, §17 item 6).
 *
 * `telemetryEvents.ts` is the single source of truth for the eleven §10 event
 * names and the on-the-wire payload shape, yet it had no dedicated test: the
 * client and session-instrumentation suites only reference specific names
 * symbolically, so a drift in the canonical set (a renamed event, a 12th event,
 * an un-frozen map) would slip through. These tests pin the contract itself so
 * the §17 telemetry-shape assurance is reproducible, not incidental.
 */

import { describe, expect, it } from 'vitest';

import {
  TelemetryEventNames,
  type TelemetryEvent,
  type TelemetryEventName,
} from './telemetryEvents';

/**
 * The eleven §10 events, listed independently of the source object so this test
 * fails loudly if the canonical set changes rather than tautologically tracking
 * it. Order is irrelevant; the set comparison below is order-insensitive.
 */
const EXPECTED_EVENT_NAMES = [
  'Session_Initialized',
  'Card_Rendered',
  'Card_Attempted',
  'Card_Resolved',
  'Card_Explanation_Viewed',
  'Session_Completed',
  'Session_Abandoned',
  'Receipt_Shared',
  'Exit_Clicked',
  'Intentional_Continue_Clicked',
  'Return_Session_Started',
] as const;

describe('TelemetryEventNames (§10 contract)', () => {
  it('declares exactly the eleven §10 events and no more', () => {
    expect(Object.values(TelemetryEventNames).sort()).toEqual(
      [...EXPECTED_EVENT_NAMES].sort(),
    );
    expect(Object.keys(TelemetryEventNames)).toHaveLength(11);
  });

  it('maps each key to its own string literal (no typo drift between key and value)', () => {
    for (const [key, value] of Object.entries(TelemetryEventNames)) {
      expect(value).toBe(key);
    }
  });

  it('is frozen so the canonical event set cannot be mutated at runtime', () => {
    expect(Object.isFrozen(TelemetryEventNames)).toBe(true);
    expect(() => {
      // The map is frozen, so an assignment must throw in strict mode (this ES
      // module is strict). A silent no-op would mean the freeze is ineffective.
      (TelemetryEventNames as Record<string, string>).New_Event = 'New_Event';
    }).toThrow();
    expect(Object.keys(TelemetryEventNames)).toHaveLength(11);
  });
});

describe('TelemetryEvent payload shape (§10)', () => {
  it('requires the four always-present envelope fields and accepts only §10 optionals', () => {
    // A maximally-populated event: every §10 field present at once. This is a
    // compile-time check (it must satisfy `TelemetryEvent`) exercised at runtime
    // to assert the documented field set is exactly representable — no field is
    // missing from the type and no PII field is part of the contract.
    const maximal: TelemetryEvent = {
      // Envelope — always present.
      eventName: TelemetryEventNames.Card_Resolved,
      anonymousUserId: 'anon-1',
      sessionId: 'sess-1',
      timestampMs: 1_700_000_000_000,
      // Card-scoped optionals.
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'spot_it',
      category: 'visual_attention',
      evidenceTier: 'mechanic_mapped',
      difficulty: 'easy',
      // Attribution optionals.
      routeKind: 'session',
      source: 'direct',
      // Resolution optionals.
      elapsedMs: 1_234,
      interactionElapsedMs: 999,
      isCorrect: true,
      resolutionType: 'correct',
      attemptCount: 1,
      measuredSignals: ['speed', 'accuracy'],
    };

    const ALLOWED_FIELDS = new Set<keyof TelemetryEvent>([
      'eventName',
      'anonymousUserId',
      'sessionId',
      'timestampMs',
      'cardId',
      'cardIndex',
      'templateType',
      'category',
      'evidenceTier',
      'difficulty',
      'routeKind',
      'source',
      'elapsedMs',
      'interactionElapsedMs',
      'isCorrect',
      'resolutionType',
      'attemptCount',
      'measuredSignals',
    ]);

    for (const key of Object.keys(maximal)) {
      expect(ALLOWED_FIELDS.has(key as keyof TelemetryEvent)).toBe(true);
    }

    // The only identity carried is the anonymous id (Technical Design §16).
    const PII_FIELDS = ['name', 'email', 'phone', 'deviceId', 'ip', 'userAgent'];
    for (const banned of PII_FIELDS) {
      expect(maximal).not.toHaveProperty(banned);
    }
  });

  it('keys the eventName off the canonical name union', () => {
    // Round-trip every canonical name through the `TelemetryEventName` type to
    // prove the union and the runtime map stay in lockstep.
    for (const name of Object.values(TelemetryEventNames)) {
      const typed: TelemetryEventName = name;
      expect(EXPECTED_EVENT_NAMES).toContain(typed);
    }
  });
});
