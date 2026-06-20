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

import { TelemetryEventNames, type TelemetryEvent } from './telemetryEvents';

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
  });

  it('rejects PII fields at the type level (Technical Design §16)', () => {
    // The real enforcement of "no PII in the payload" is the TYPE, not a runtime
    // key check (a hand-built literal that omits a key passes regardless). Assert
    // the contract itself: adding a PII field must be a compile error. If
    // `TelemetryEvent` ever gained `email?: string`, the `@ts-expect-error` would
    // become unused and tsc (and the typecheck gate) would fail this file.
    const withPii: TelemetryEvent = {
      eventName: TelemetryEventNames.Session_Initialized,
      anonymousUserId: 'anon-1',
      sessionId: 'sess-1',
      timestampMs: 1_700_000_000_000,
      // @ts-expect-error — `email` is not part of the §16-compliant contract.
      email: 'should-not-compile@example.com',
    };
    // Touch the value so it isn't flagged unused; the assertion above is the test.
    expect(withPii.anonymousUserId).toBe('anon-1');
  });
});
