/**
 * Tests for the framework-agnostic feed instrumentation (ADO #129, M5; ported
 * from the web #108 tests). Against a FAKE client (records `enqueue` payloads):
 * each of the 9 feed events fires with the right name + fields and EXACTLY ONCE,
 * `Card_Rendered` is once-per-activation, `Return_Session_Started` carries the
 * source, and NO PII fields ever appear.
 */
import { createFeedTelemetry } from './feedTelemetry';
import type { TelemetryClient } from './telemetryClient';
import type { LiquidCard, SpotItCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import type { TelemetryEventInput } from '../core/telemetry/telemetryEvents';

/** A fake client that records every enqueued event. */
function makeFakeClient(): TelemetryClient & { events: TelemetryEventInput[] } {
  const events: TelemetryEventInput[] = [];
  return {
    events,
    enqueue(event) {
      events.push(event);
    },
    async flush() {},
    trackAbandonment(event) {
      events.push(event);
    },
  };
}

function makeCard(cardId = 'card-1'): LiquidCard {
  const card: SpotItCard = {
    cardId,
    creatorHandle: `@creator_${cardId}`,
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'entertainment_only',
    reviewStatus: 'unreviewed',
    estimatedSeconds: 10,
    prompt: 'Find the odd one out',
    puzzleDna: { mechanic: 'scan', inputMode: 'tap', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      rows: 1,
      columns: 1,
      baseElement: 'a',
      anomalyElement: 'b',
      anomalyRow: 0,
      anomalyColumn: 0,
      timeLimitMs: 1000,
    },
  };
  return card;
}

const resolution: CardResolution = {
  cardId: 'card-1',
  resolutionType: 'incorrect',
  isCorrect: false,
  elapsedMs: 2500,
  interactionElapsedMs: 1800,
  attemptCount: 2,
  signals: { time_to_first_tap: 300, false_taps: 1 },
};

/** Fields that would constitute PII — must never appear on any event. */
const PII_KEYS = ['name', 'email', 'phone', 'contact', 'deviceId', 'ip', 'userAgent'];

function setup() {
  const client = makeFakeClient();
  const telemetry = createFeedTelemetry({
    client,
    feedId: 'feed-1',
    getAnonymousUserId: () => 'anon-1',
    now: () => 1000,
    source: 'reminder',
  });
  return { client, telemetry };
}

function byName(events: TelemetryEventInput[], name: string) {
  return events.filter((e) => e.eventName === name);
}

describe('createFeedTelemetry (RN)', () => {
  it('feedOpened fires Session_Initialized + Return_Session_Started once each, carrying source', () => {
    const { client, telemetry } = setup();
    telemetry.feedOpened();
    telemetry.feedOpened(); // idempotent

    const init = byName(client.events, 'Session_Initialized');
    const ret = byName(client.events, 'Return_Session_Started');
    expect(init).toHaveLength(1);
    expect(ret).toHaveLength(1);
    expect(init[0]).toMatchObject({ sessionId: 'feed-1', anonymousUserId: 'anon-1', source: 'reminder' });
    expect(ret[0]).toMatchObject({ source: 'reminder', routeKind: 'session' });
  });

  it('Card_Rendered fires once per activation index', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.cardActivated(card, 0);
    telemetry.cardActivated(card, 0); // latched per index
    telemetry.cardActivated(card, 1); // a new activation fires again

    const rendered = byName(client.events, 'Card_Rendered');
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      templateType: 'spot_it',
      category: 'visual_attention',
      evidenceTier: 'entertainment_only',
      difficulty: 'easy',
    });
    expect(rendered[1].cardIndex).toBe(1);
  });

  it('Card_Attempted, Card_Skipped, Card_Abandoned each fire once per index', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.cardAttempted(card, 0);
    telemetry.cardAttempted(card, 0);
    telemetry.cardSkipped(card, 1);
    telemetry.cardSkipped(card, 1);
    telemetry.cardAbandoned(card, 2);
    telemetry.cardAbandoned(card, 2);

    expect(byName(client.events, 'Card_Attempted')).toHaveLength(1);
    expect(byName(client.events, 'Card_Skipped')).toHaveLength(1);
    expect(byName(client.events, 'Card_Abandoned')).toHaveLength(1);
  });

  it('Card_Resolved carries the resolution fields + measuredSignals (names only) once', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.cardResolved(card, 0, resolution);
    telemetry.cardResolved(card, 0, resolution); // latched

    const resolved = byName(client.events, 'Card_Resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      cardId: 'card-1',
      cardIndex: 0,
      resolutionType: 'incorrect',
      isCorrect: false,
      elapsedMs: 2500,
      interactionElapsedMs: 1800,
      attemptCount: 2,
      measuredSignals: ['time_to_first_tap', 'false_taps'],
    });
    // Signal VALUES are never transmitted — only their names.
    expect(JSON.stringify(resolved[0])).not.toContain('300');
  });

  it('Card_Explanation_Viewed fires once per activation index', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.explanationViewed(card, 0);
    telemetry.explanationViewed(card, 0); // latched
    telemetry.explanationViewed(card, 3); // a replay at a new index fires again

    const viewed = byName(client.events, 'Card_Explanation_Viewed');
    expect(viewed).toHaveLength(2);
    expect(viewed[0]).toMatchObject({ cardId: 'card-1', cardIndex: 0, templateType: 'spot_it' });
    expect(viewed[1].cardIndex).toBe(3);
  });

  it('all nine feed events fire with the expected names', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.feedOpened();
    telemetry.cardActivated(card, 0);
    telemetry.cardAttempted(card, 0);
    telemetry.cardResolved(card, 0, resolution);
    telemetry.explanationViewed(card, 0);
    telemetry.cardSkipped(card, 1);
    telemetry.cardAbandoned(card, 2);
    const abandonment = telemetry.buildAbandonmentEvent();
    if (abandonment) client.trackAbandonment(abandonment);

    const names = new Set(client.events.map((e) => e.eventName));
    expect(names).toEqual(
      new Set([
        'Session_Initialized',
        'Return_Session_Started',
        'Card_Rendered',
        'Card_Attempted',
        'Card_Resolved',
        'Card_Explanation_Viewed',
        'Card_Skipped',
        'Card_Abandoned',
        'Session_Abandoned',
      ]),
    );
  });

  it('buildAbandonmentEvent is at-most-once and null before the feed is opened', () => {
    const { telemetry } = setup();
    // Not opened yet → nothing to abandon.
    expect(telemetry.buildAbandonmentEvent()).toBeNull();

    telemetry.feedOpened();
    const first = telemetry.buildAbandonmentEvent();
    expect(first).not.toBeNull();
    expect(first).toMatchObject({
      eventName: 'Session_Abandoned',
      sessionId: 'feed-1',
      anonymousUserId: 'anon-1',
    });
    // A second AppState transition emits nothing (undercount/best-effort).
    expect(telemetry.buildAbandonmentEvent()).toBeNull();
  });

  it('emits no PII fields on any event', () => {
    const { client, telemetry } = setup();
    const card = makeCard();
    telemetry.feedOpened();
    telemetry.cardActivated(card, 0);
    telemetry.cardAttempted(card, 0);
    telemetry.cardResolved(card, 0, resolution);
    telemetry.explanationViewed(card, 0);
    telemetry.cardSkipped(card, 1);
    telemetry.cardAbandoned(card, 2);

    for (const event of client.events) {
      for (const key of Object.keys(event)) {
        expect(PII_KEYS).not.toContain(key);
      }
    }
  });

  it('does not emit when feedId is empty (guard)', () => {
    const client = makeFakeClient();
    const telemetry = createFeedTelemetry({ client, feedId: '' });
    telemetry.feedOpened();
    expect(client.events).toHaveLength(0);
    expect(telemetry.buildAbandonmentEvent()).toBeNull();
  });
});
