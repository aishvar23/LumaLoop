/**
 * Integration tests for the feed telemetry wiring (Azure DevOps #108;
 * docs/FEED_DIRECTION.md §6). `FeedRoute` instantiates the telemetry client +
 * {@link useFeedTelemetry} hook and feeds the feed's #106 seam callbacks (and the
 * explanation-viewed gate) into it. Here we inject a FAKE telemetry client and a
 * deterministic feed, then drive the feed and assert each §6 event fires with the
 * right name/fields EXACTLY once — with NO real network or storage.
 *
 * jsdom ships no IntersectionObserver, so a minimal mock stands in (mirroring
 * `FeedScreen.test.tsx`); keyboard navigation drives the active index, which is
 * what fires the activation/skip/abandon seams.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiquidCard, SpotItCard } from '../cards/types';
import { createFeedRegistry } from '../ui/feedRegistry';
import type { RendererRegistry } from '../session/rendererRegistry';
import type { CardResolution, TemplateProps } from '../templates/contract';
import { useCardTimer } from '../templates/useCardTimer';
import type { TelemetryClient } from '../telemetry/telemetryClient';
import type { TelemetryEventInput } from '../telemetry/telemetryEvents';
import type { FeedBatchSource } from './feedDeck';
import FeedRoute from './FeedRoute';

// --- IntersectionObserver mock (jsdom has none) --------------------------------

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IOCallback;
  constructor(callback: IOCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// --- Deterministic feed source + stub renderer ---------------------------------

/** batch N → ['bN-0','bN-1','bN-2'] (decoded from the per-batch seed suffix). */
const fakeSource: FeedBatchSource = (seed) => {
  const n = seed.includes('#feed-') ? Number(seed.split('#feed-')[1]) : 0;
  return [`b${n}-0`, `b${n}-1`, `b${n}-2`];
};

/** Minimal valid spot_it card; only the generic §6 fields are read by telemetry. */
function makeCard(cardId: string): LiquidCard {
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

const fakeGetCardById = (cardId: string): LiquidCard | undefined => makeCard(cardId);

/** Stub renderer with an engage button (first interaction) + a resolve button. */
function StubRenderer({
  card,
  context,
  onAttempt,
  onResolve,
}: TemplateProps<SpotItCard>) {
  const timer = useCardTimer({ card, context, onResolve });
  const resolution: CardResolution = {
    cardId: card.cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 1,
    interactionElapsedMs: 1,
    attemptCount: 1,
    signals: { time_to_interaction: 1, correct: true },
  };
  return (
    <>
      <button
        type="button"
        data-testid={`engage-${card.cardId}`}
        onClick={() => {
          onAttempt({ time_to_first_tap: 1 });
          timer.markAttempt();
        }}
      >
        engage:{card.cardId}
      </button>
      <button
        type="button"
        data-testid={`resolve-${card.cardId}`}
        onClick={() => timer.resolve(resolution)}
      >
        game:{card.cardId}
      </button>
    </>
  );
}

// Wrap in the feedback gate so the explanation step (and its viewed seam) exists.
const gatedRegistry: RendererRegistry = createFeedRegistry({ spot_it: StubRenderer });

// --- Capturing fake telemetry client -------------------------------------------

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

const FEED_ID = 'feed-test';

function renderFeed(client: TelemetryClient) {
  return render(
    <FeedRoute
      telemetryClient={client}
      anonymousUserId="anon-test"
      feedId={FEED_ID}
      feedSource={fakeSource}
      registry={gatedRegistry}
      getCardById={fakeGetCardById}
    />,
  );
}

const scroller = () => screen.getByTestId('feed-scroller');
const names = (events: TelemetryEventInput[]) => events.map((e) => e.eventName);
const byName = (events: TelemetryEventInput[], name: string) =>
  events.filter((e) => e.eventName === name);

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedRoute telemetry wiring (§6)', () => {
  it('fires Session_Initialized + Return_Session_Started once on feed open (source: direct)', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    expect(byName(events, 'Session_Initialized')).toHaveLength(1);
    const ret = byName(events, 'Return_Session_Started');
    expect(ret).toHaveLength(1);
    // The headline organic-return metric defaults to direct (no `?source=`).
    expect(ret[0].source).toBe('direct');
    expect(ret[0].sessionId).toBe(FEED_ID);
    expect(ret[0].anonymousUserId).toBe('anon-test');
  });

  it('fires Card_Rendered once for the first active game, and once per game as the feed advances', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    // The first game is active on mount → one Card_Rendered.
    let rendered = byName(events, 'Card_Rendered');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      cardId: 'b0-0',
      cardIndex: 0,
      templateType: 'spot_it',
      category: 'visual_attention',
    });

    // Advancing to two more games yields two more Card_Rendered (N games → N).
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    rendered = byName(events, 'Card_Rendered');
    expect(rendered.map((e) => e.cardIndex)).toEqual([0, 1, 2]);

    // Returning to a visited game does NOT refire its Card_Rendered.
    fireEvent.keyDown(scroller(), { key: 'ArrowUp' });
    expect(byName(events, 'Card_Rendered')).toHaveLength(3);
  });

  it('fires Card_Attempted on engage', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.click(screen.getByTestId('engage-b0-0'));
    const attempted = byName(events, 'Card_Attempted');
    expect(attempted).toHaveLength(1);
    expect(attempted[0]).toMatchObject({ cardId: 'b0-0', cardIndex: 0 });
  });

  it('fires Card_Resolved (with the resolution fields) when a played game resolves', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.click(screen.getByTestId('resolve-b0-0')); // gate captures → feedback
    fireEvent.click(screen.getByTestId('feedback-next')); // gate advances → resolve

    const resolved = byName(events, 'Card_Resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      cardId: 'b0-0',
      cardIndex: 0,
      resolutionType: 'correct',
      isCorrect: true,
    });
    expect(resolved[0].measuredSignals).toEqual(['time_to_interaction', 'correct']);
  });

  it('fires Card_Explanation_Viewed via the feedback gate', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.click(screen.getByTestId('resolve-b0-0')); // feedback + explanation visible

    const viewed = byName(events, 'Card_Explanation_Viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ cardId: 'b0-0', cardIndex: 0 });
  });

  it('fires Card_Skipped (not Resolved) when a game is swiped past un-engaged', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.keyDown(scroller(), { key: 'ArrowDown' }); // leave game 0 un-engaged

    const skipped = byName(events, 'Card_Skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ cardId: 'b0-0', cardIndex: 0 });
    // A skipped game is mutually exclusive with resolved/abandoned (#106).
    expect(byName(events, 'Card_Resolved')).toHaveLength(0);
    expect(byName(events, 'Card_Abandoned')).toHaveLength(0);
  });

  it('fires Card_Abandoned (not Resolved) when a game is engaged then left before resolve', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' }); // leave engaged-but-unresolved

    const abandoned = byName(events, 'Card_Abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ cardId: 'b0-0', cardIndex: 0 });
    // An abandoned attempt is not also resolved or skipped (#106).
    expect(byName(events, 'Card_Resolved')).toHaveLength(0);
    expect(byName(events, 'Card_Skipped')).toHaveLength(0);
  });

  it('does not fire Card_Skipped for a played (resolved) game', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    fireEvent.click(screen.getByTestId('engage-b0-0'));
    fireEvent.click(screen.getByTestId('resolve-b0-0'));
    fireEvent.click(screen.getByTestId('feedback-next'));
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' }); // leave the resolved game

    expect(byName(events, 'Card_Resolved')).toHaveLength(1);
    expect(byName(events, 'Card_Skipped')).toHaveLength(0);
    expect(byName(events, 'Card_Abandoned')).toHaveLength(0);
  });

  it('emits Session_Abandoned at most once via the unload listeners', () => {
    const { client, events } = createCapturingClient();
    renderFeed(client);

    // Both visibilitychange→hidden and pagehide fire for a single page close; the
    // at-most-once latch keeps it to one undedupable Session_Abandoned.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('pagehide'));

    const abandoned = byName(events, 'Session_Abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ sessionId: FEED_ID, anonymousUserId: 'anon-test' });
  });

  it('passes the parsed attribution source through to Return_Session_Started', () => {
    const { client, events } = createCapturingClient();
    render(
      <FeedRoute
        telemetryClient={client}
        anonymousUserId="anon-test"
        feedId={FEED_ID}
        feedSource={fakeSource}
        registry={gatedRegistry}
        getCardById={fakeGetCardById}
        source="reminder"
      />,
    );

    expect(byName(events, 'Return_Session_Started')[0].source).toBe('reminder');
    // Every event carries only the anonymous id — never PII.
    for (const event of events) {
      expect(event.anonymousUserId).toBe('anon-test');
      for (const key of ['name', 'email', 'deviceId', 'ip', 'userAgent']) {
        expect(event).not.toHaveProperty(key);
      }
    }
    expect(names(events)).toContain('Session_Initialized');
  });
});
