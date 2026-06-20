/**
 * Telemetry event-name contract (Technical Design §10, §17 item 6; reworked for
 * the endless feed per docs/FEED_DIRECTION.md §6).
 *
 * `telemetryEvents.ts` is the single source of truth for the feed event names and
 * the on-the-wire payload shape, yet it had no dedicated test: the client and
 * feed-instrumentation suites only reference specific names symbolically, so a
 * drift in the canonical set (a renamed event, an extra event, an un-frozen map)
 * would slip through. These tests pin the contract itself so the §17 telemetry-
 * shape assurance is reproducible, not incidental — including that the retired
 * session-ceremony events are GONE so `ingest.ts` (whose whitelist derives from
 * this set) rejects them.
 */

import { describe, expect, it } from 'vitest';

import { TelemetryEventNames, type TelemetryEvent } from './telemetryEvents';

/**
 * The nine feed events (FEED_DIRECTION §6), listed independently of the source
 * object so this test fails loudly if the canonical set changes rather than
 * tautologically tracking it. Order is irrelevant; the comparison below is
 * order-insensitive.
 */
const EXPECTED_EVENT_NAMES = [
  'Session_Initialized',
  'Card_Rendered',
  'Card_Attempted',
  'Card_Resolved',
  'Card_Explanation_Viewed',
  'Card_Skipped',
  'Card_Abandoned',
  'Session_Abandoned',
  'Return_Session_Started',
] as const;

/**
 * The bounded-session ceremony events retired with the session flow (#107,
 * FEED_DIRECTION §6). They must NOT reappear in the canonical set, so the ingest
 * whitelist (derived from it) rejects any straggler POST using these names.
 */
const RETIRED_EVENT_NAMES = [
  'Session_Completed',
  'Exit_Clicked',
  'Intentional_Continue_Clicked',
  'Receipt_Shared',
] as const;

describe('TelemetryEventNames (FEED_DIRECTION §6 contract)', () => {
  it('declares exactly the nine feed events and no more', () => {
    expect(Object.values(TelemetryEventNames).sort()).toEqual(
      [...EXPECTED_EVENT_NAMES].sort(),
    );
    expect(Object.keys(TelemetryEventNames)).toHaveLength(9);
  });

  it('no longer declares any retired session-ceremony event', () => {
    const names = new Set<string>(Object.values(TelemetryEventNames));
    for (const retired of RETIRED_EVENT_NAMES) {
      expect(names.has(retired)).toBe(false);
    }
  });

  it('declares the feed free-scroll events added for the endless feed', () => {
    expect(TelemetryEventNames.Card_Skipped).toBe('Card_Skipped');
    expect(TelemetryEventNames.Card_Abandoned).toBe('Card_Abandoned');
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
    expect(Object.keys(TelemetryEventNames)).toHaveLength(9);
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
