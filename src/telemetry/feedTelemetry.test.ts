/**
 * Unit tests for the framework-agnostic feed instrumentation (Azure DevOps #108;
 * docs/FEED_DIRECTION.md §6; Technical Design §10, §17.1).
 *
 * These exercise {@link createFeedTelemetry} and {@link parseTelemetrySource}
 * directly against a FAKE {@link TelemetryClient} — no React, no network — so the
 * event mapping, once-latching, and source attribution are proven in isolation.
 * The React wiring (and the skip/resolved + abandon/resolved exclusivity the feed
 * guarantees, #106) is covered end-to-end in `FeedRoute.test.tsx`.
 */

import { describe, expect, it } from 'vitest';

import type { LiquidCard, TinyLogicCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import { createFeedTelemetry, parseTelemetrySource } from './feedTelemetry';
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

/** A fully-typed tiny_logic card — only the generic fields are read by §6/§10. */
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

const FIXED_NOW = 1_700_000_000_000;
const FEED_ID = 'feed-1';
const baseDeps = {
  feedId: FEED_ID,
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

describe('createFeedTelemetry', () => {
  it('fires Session_Initialized + Return_Session_Started on feed open, with source/routeKind', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
      source: 'reminder',
    });

    telemetry.feedOpened();

    expect(events.map((e) => e.eventName)).toEqual([
      'Session_Initialized',
      'Return_Session_Started',
    ]);
    for (const event of events) {
      expect(event.sessionId).toBe(FEED_ID);
      expect(event.anonymousUserId).toBe('anon-test');
      expect(event.timestampMs).toBe(FIXED_NOW);
      expect(event.routeKind).toBe('session');
      expect(event.source).toBe('reminder');
    }
  });

  it('emits Session_Initialized + Return_Session_Started exactly once even when reopened', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.feedOpened();
    telemetry.feedOpened(); // re-render / re-effect: no double count

    const names = events.map((e) => e.eventName);
    expect(names.filter((n) => n === 'Session_Initialized')).toHaveLength(1);
    expect(names.filter((n) => n === 'Return_Session_Started')).toHaveLength(1);
  });

  it('fires Card_Rendered once per activation with the generic card fields', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.cardActivated(makeCard('card-1'), 0); // re-render: latched

    const rendered = events.filter((e) => e.eventName === 'Card_Rendered');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      category: 'logical_reasoning',
      evidenceTier: 'mechanic_mapped',
      difficulty: 'easy',
      sessionId: FEED_ID,
    });
  });

  it('advancing N games yields N Card_Rendered events', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.cardActivated(makeCard('card-2'), 1);
    telemetry.cardActivated(makeCard('card-3'), 2);

    const rendered = events.filter((e) => e.eventName === 'Card_Rendered');
    expect(rendered.map((e) => e.cardIndex)).toEqual([0, 1, 2]);
  });

  it('maps Card_Attempted to the engaged game, once per index', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.cardAttempted(makeCard('card-1'), 0);
    telemetry.cardAttempted(makeCard('card-1'), 0); // latched per index

    const attempted = events.filter((e) => e.eventName === 'Card_Attempted');
    expect(attempted).toHaveLength(1);
    expect(attempted[0]).toMatchObject({ cardId: 'card-1', cardIndex: 0 });
  });

  it('maps Card_Resolved from the resolution (type/correctness/timing/signals)', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.cardResolved(
      makeCard('card-1'),
      0,
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

  it('fires Card_Skipped once per index with the generic card fields', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardSkipped(makeCard('card-1'), 0);
    telemetry.cardSkipped(makeCard('card-1'), 0); // latched per index

    const skipped = events.filter((e) => e.eventName === 'Card_Skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      category: 'logical_reasoning',
      evidenceTier: 'mechanic_mapped',
      difficulty: 'easy',
      sessionId: FEED_ID,
    });
  });

  it('fires Card_Abandoned once per index with the generic card fields', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.cardAbandoned(makeCard('card-2'), 1);
    telemetry.cardAbandoned(makeCard('card-2'), 1); // latched per index

    const abandoned = events.filter((e) => e.eventName === 'Card_Abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({
      cardId: 'card-2',
      cardIndex: 1,
      templateType: 'tiny_logic',
      sessionId: FEED_ID,
    });
  });

  it('fires Card_Explanation_Viewed once per card, stamping the active index', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.feedOpened();
    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.explanationViewed(makeCard('card-1'));
    telemetry.explanationViewed(makeCard('card-1')); // latched

    const viewed = events.filter((e) => e.eventName === 'Card_Explanation_Viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'tiny_logic',
      sessionId: FEED_ID,
    });
  });

  it('re-fires Card_Explanation_Viewed when the same card replays at a new index (per-activation)', () => {
    // The endless feed cycles the catalog, so the same cardId reappears at a new
    // index. Explanation views latch per cardIndex (like the other card events),
    // so a replay's explanation is counted, not suppressed — keeping it
    // consistent with the replay's Card_Resolved.
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.feedOpened();
    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.explanationViewed(makeCard('card-1'));
    // Same card replays at index 7 (a later batch).
    telemetry.cardActivated(makeCard('card-1'), 7);
    telemetry.explanationViewed(makeCard('card-1'));

    const viewed = events.filter((e) => e.eventName === 'Card_Explanation_Viewed');
    expect(viewed).toHaveLength(2);
    expect(viewed.map((e) => e.cardIndex)).toEqual([0, 7]);
  });

  it('builds an abandonment event only after the feed has been opened', () => {
    const { client } = createCapturingClient();
    const telemetry = createFeedTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
    });

    // Feed never opened → nothing to abandon.
    expect(telemetry.buildAbandonmentEvent()).toBeNull();

    telemetry.feedOpened();
    const event = telemetry.buildAbandonmentEvent();
    expect(event).toMatchObject({
      eventName: 'Session_Abandoned',
      sessionId: FEED_ID,
      anonymousUserId: 'anon-test',
      timestampMs: FIXED_NOW,
      routeKind: 'session',
    });
  });

  it('emits Session_Abandoned at most once (visibilitychange + pagehide both fire)', () => {
    const { client } = createCapturingClient();
    const telemetry = createFeedTelemetry({
      ...baseDeps,
      client,
      routeKind: 'session',
    });

    telemetry.feedOpened();
    // The first unload signal yields the event...
    expect(telemetry.buildAbandonmentEvent()).toMatchObject({
      eventName: 'Session_Abandoned',
      sessionId: FEED_ID,
    });
    // ...a second signal for the SAME page close (registerAbandonmentListeners
    // binds both visibilitychange→hidden and pagehide) is suppressed, so the
    // server is not handed duplicate, undedupable events.
    expect(telemetry.buildAbandonmentEvent()).toBeNull();
  });

  it('attaches only the anonymous id — never any PII field', () => {
    const { client, events } = createCapturingClient();
    const telemetry = createFeedTelemetry({ ...baseDeps, client });

    telemetry.feedOpened();
    telemetry.cardActivated(makeCard('card-1'), 0);
    telemetry.cardResolved(makeCard('card-1'), 0, makeResolution());
    telemetry.cardSkipped(makeCard('card-2'), 1);

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
