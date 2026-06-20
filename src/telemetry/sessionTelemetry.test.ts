/**
 * Unit tests for the framework-agnostic session instrumentation (Azure DevOps
 * #76; Technical Design §10, §17.1).
 *
 * These exercise {@link createSessionTelemetry} and {@link parseTelemetrySource}
 * directly against a FAKE {@link TelemetryClient} — no React, no network — so the
 * event mapping, once-latching, and source attribution are proven in isolation.
 * The React wiring is covered end-to-end in `SessionRoute.test.tsx`.
 */

import { describe, expect, it } from 'vitest';

import type { LiquidCard, TinyLogicCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import type { SessionState } from '../session/sessionTypes';
import {
  createSessionTelemetry,
  parseTelemetrySource,
} from './sessionTelemetry';
import type { TelemetryClient } from './telemetryClient';
import type { TelemetryEventInput } from './telemetryEvents';

// ---------------------------------------------------------------------------
// Fakes / fixtures.
// ---------------------------------------------------------------------------

/** A capturing fake client: records every enqueued event, no transport. */
function createCapturingClient(): {
  client: TelemetryClient;
  events: TelemetryEventInput[];
} {
  const events: TelemetryEventInput[] = [];
  const client: TelemetryClient = {
    enqueue: (event) => {
      events.push(event);
    },
    flush: async () => {},
    trackAbandonment: (event) => {
      events.push(event);
    },
  };
  return { client, events };
}

/** A fully-typed tiny_logic card — only the generic fields are read by §10. */
function makeCard(cardId: string): TinyLogicCard {
  return {
    cardId,
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Pick the correct answer',
    puzzleDna: {
      mechanic: 'one_move_logic_choice',
      inputMode: 'choice',
      measuredSignals: ['correct'],
    },
    explanation: { title: `${cardId} title`, body: `${cardId} body` },
    config: {
      stem: `${cardId} stem`,
      options: [{ id: 'a', label: 'A' }],
      correctOptionId: 'a',
      timeLimitMs: 12_000,
    },
  };
}

function makeResolution(overrides: Partial<CardResolution> = {}): CardResolution {
  return {
    cardId: 'card-1',
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 1_200,
    interactionElapsedMs: 900,
    attemptCount: 1,
    signals: { time_to_interaction: 400, correct: true },
    ...overrides,
  };
}

/** Minimal completed session state (only `sessionId` is read by §10). */
function completedState(sessionId: string): SessionState {
  return { sessionId } as unknown as SessionState;
}

const FIXED_NOW = 1_700_000_000_000;
const baseDeps = {
  getAnonymousUserId: () => 'anon-test',
  now: () => FIXED_NOW,
} as const;

// ---------------------------------------------------------------------------
// parseTelemetrySource (§10 attribution).
// ---------------------------------------------------------------------------

describe('parseTelemetrySource', () => {
  it('defaults to direct when the param is absent', () => {
    expect(parseTelemetrySource('')).toBe('direct');
    expect(parseTelemetrySource(undefined)).toBe('direct');
    expect(parseTelemetrySource('?foo=bar')).toBe('direct');
  });

  it('maps each valid §10 source', () => {
    expect(parseTelemetrySource('?source=direct')).toBe('direct');
    expect(parseTelemetrySource('?source=reminder')).toBe('reminder');
    expect(parseTelemetrySource('?source=share')).toBe('share');
    expect(parseTelemetrySource('?source=manual_test')).toBe('manual_test');
  });

  it('degrades an invalid/unknown source to direct', () => {
    expect(parseTelemetrySource('?source=phishing')).toBe('direct');
    expect(parseTelemetrySource('?source=')).toBe('direct');
  });
});

// ---------------------------------------------------------------------------
// Event mapping + once-latching (§17.1).
// ---------------------------------------------------------------------------

describe('createSessionTelemetry', () => {
  it('fires Session_Initialized + Return_Session_Started on the first window, with source/routeKind', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
      source: 'reminder',
    });

    telemetry.sessionInitialized('sess-1');

    expect(events.map((e) => e.eventName)).toEqual([
      'Session_Initialized',
      'Return_Session_Started',
    ]);
    for (const event of events) {
      expect(event.sessionId).toBe('sess-1');
      expect(event.anonymousUserId).toBe('anon-test');
      expect(event.timestampMs).toBe(FIXED_NOW);
      expect(event.routeKind).toBe('session');
      expect(event.source).toBe('reminder');
    }
  });

  it('emits Session_Initialized once per id; Return_Session_Started only once ever', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.sessionInitialized('sess-1');
    telemetry.sessionInitialized('sess-1'); // re-render: no double count
    telemetry.sessionInitialized('sess-2'); // intentional continue: new id

    const names = events.map((e) => e.eventName);
    expect(names.filter((n) => n === 'Session_Initialized')).toHaveLength(2);
    // Return fires ONLY for the first window — a continue is not a re-entry.
    expect(names.filter((n) => n === 'Return_Session_Started')).toHaveLength(1);
    expect(events.find((e) => e.eventName === 'Return_Session_Started')?.sessionId).toBe(
      'sess-1',
    );
  });

  it('fires Card_Rendered once per activation with the generic card fields', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1'); // re-render: latched

    const rendered = events.filter((e) => e.eventName === 'Card_Rendered');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      category: 'logical_reasoning',
      evidenceTier: 'mechanic_mapped',
      difficulty: 'easy',
      sessionId: 'sess-1',
    });
  });

  it('advancing N cards yields N Card_Rendered events', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.cardActivated(makeCard('card-2'), 1, 'sess-1');
    telemetry.cardActivated(makeCard('card-3'), 2, 'sess-1');

    const rendered = events.filter((e) => e.eventName === 'Card_Rendered');
    expect(rendered.map((e) => e.cardIndex)).toEqual([0, 1, 2]);
  });

  it('maps Card_Attempted to the active card, once per activation', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.cardAttempted();
    telemetry.cardAttempted(); // latched per card

    const attempted = events.filter((e) => e.eventName === 'Card_Attempted');
    expect(attempted).toHaveLength(1);
    expect(attempted[0]).toMatchObject({ cardId: 'card-1', cardIndex: 0 });
  });

  it('maps Card_Resolved from the resolution (type/correctness/timing/signals)', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.cardResolved(
      makeResolution({
        resolutionType: 'incorrect',
        isCorrect: false,
        interactionElapsedMs: 750,
        attemptCount: 2,
        signals: { time_to_interaction: 300, correct: false },
      }),
    );

    const resolved = events.filter((e) => e.eventName === 'Card_Resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      category: 'logical_reasoning',
      resolutionType: 'incorrect',
      isCorrect: false,
      interactionElapsedMs: 750,
      attemptCount: 2,
    });
    // measuredSignals are the NAMES present on the resolution — no values, no PII.
    expect(resolved[0].measuredSignals).toEqual(['time_to_interaction', 'correct']);
  });

  it('fires Card_Explanation_Viewed once per card, stamping the active index', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.sessionInitialized('sess-1');
    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.explanationViewed(makeCard('card-1'));
    telemetry.explanationViewed(makeCard('card-1')); // latched

    const viewed = events.filter((e) => e.eventName === 'Card_Explanation_Viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      sessionId: 'sess-1',
    });
  });

  it('fires Session_Completed once per session with routeKind', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
    });

    telemetry.sessionInitialized('sess-1');
    telemetry.sessionCompleted(completedState('sess-1'));
    telemetry.sessionCompleted(completedState('sess-1')); // latched

    const completed = events.filter((e) => e.eventName === 'Session_Completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ sessionId: 'sess-1', routeKind: 'session' });
  });

  it('fires the user-action events on each tap (no latch)', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.sessionInitialized('sess-1');
    telemetry.exitClicked();
    telemetry.continueClicked();
    telemetry.receiptShared();

    const names = events.map((e) => e.eventName);
    expect(names).toContain('Exit_Clicked');
    expect(names).toContain('Intentional_Continue_Clicked');
    expect(names).toContain('Receipt_Shared');
    for (const name of ['Exit_Clicked', 'Receipt_Shared']) {
      expect(events.find((e) => e.eventName === name)?.sessionId).toBe('sess-1');
    }
  });

  it('builds an abandonment event only while a session is in progress', () => {
    const { client } = createCapturingClient();
    const telemetry = createSessionTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
    });

    // No session yet → nothing to abandon.
    expect(telemetry.buildAbandonmentEvent()).toBeNull();

    telemetry.sessionInitialized('sess-1');
    const event = telemetry.buildAbandonmentEvent();
    expect(event).toMatchObject({
      eventName: 'Session_Abandoned',
      sessionId: 'sess-1',
      anonymousUserId: 'anon-test',
      timestampMs: FIXED_NOW,
      routeKind: 'session',
    });

    // After completion the session is no longer in progress → suppressed.
    telemetry.sessionCompleted(completedState('sess-1'));
    expect(telemetry.buildAbandonmentEvent()).toBeNull();
  });

  it('attaches only the anonymous id — never any PII field', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createSessionTelemetry({ ...baseDeps, client });

    telemetry.sessionInitialized('sess-1');
    telemetry.cardActivated(makeCard('card-1'), 0, 'sess-1');
    telemetry.cardResolved(makeResolution());

    const card: LiquidCard = makeCard('card-1');
    const piiKeys = ['name', 'email', 'phone', 'deviceId', 'ip', 'userAgent'];
    for (const event of events) {
      for (const key of piiKeys) {
        expect(event).not.toHaveProperty(key);
      }
      expect(event.anonymousUserId).toBe('anon-test');
    }
    // sanity: the card itself carries no identity we forwarded
    expect(card.cardId).toBe('card-1');
  });
});
