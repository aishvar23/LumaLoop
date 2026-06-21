/**
 * Tests for the RN feed-telemetry hook (ADO #129, M5). Drives a FAKE AppState to
 * verify that backgrounding fires `Session_Abandoned` at-most-once through the
 * client, and that the index-based feed seams map to the right events via an
 * injected card resolver. No native modules, no real client.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { AppStateStatus } from 'react-native';

import { useFeedTelemetry, type AppStateLike } from './useFeedTelemetry';
import type { TelemetryClient } from './telemetryClient';
import type { LiquidCard, SpotItCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import type { TelemetryEventInput } from '../core/telemetry/telemetryEvents';

function makeFakeClient(): TelemetryClient & {
  enqueued: TelemetryEventInput[];
  abandonments: TelemetryEventInput[];
} {
  const enqueued: TelemetryEventInput[] = [];
  const abandonments: TelemetryEventInput[] = [];
  return {
    enqueued,
    abandonments,
    enqueue(event) {
      enqueued.push(event);
    },
    async flush() {},
    trackAbandonment(event) {
      abandonments.push(event);
    },
  };
}

/** A fake AppState whose `change` listener we can drive. */
function makeAppState(): AppStateLike & { emit(state: AppStateStatus): void } {
  let listener: ((s: AppStateStatus) => void) | undefined;
  return {
    addEventListener(_type, l) {
      listener = l;
      return {
        remove() {
          listener = undefined;
        },
      };
    },
    emit(state) {
      listener?.(state);
    },
  };
}

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

function setup() {
  const client = makeFakeClient();
  const appState = makeAppState();
  const { result } = renderHook(() =>
    useFeedTelemetry({
      client,
      feedId: 'feed-1',
      getAnonymousUserId: () => 'anon-1',
      getCardById: (id) => makeCard(id),
      now: () => 1000,
      source: 'direct',
      appState,
    }),
  );
  return { client, appState, result };
}

describe('useFeedTelemetry (RN)', () => {
  it('AppState → background fires Session_Abandoned at-most-once', () => {
    const { client, appState, result } = setup();
    act(() => result.current.observeFeedOpened());

    act(() => appState.emit('background'));
    expect(client.abandonments).toHaveLength(1);
    expect(client.abandonments[0].eventName).toBe('Session_Abandoned');

    // A later 'inactive'/'background' for the same feed instance emits nothing.
    act(() => appState.emit('inactive'));
    act(() => appState.emit('background'));
    expect(client.abandonments).toHaveLength(1);
  });

  it('does not fire abandonment on a return to active', () => {
    const { client, appState, result } = setup();
    act(() => result.current.observeFeedOpened());
    act(() => appState.emit('active'));
    expect(client.abandonments).toHaveLength(0);
  });

  it('maps the feed seams to the right events via the injected resolver', () => {
    const { client, result } = setup();
    const resolution: CardResolution = {
      cardId: 'c-0',
      resolutionType: 'correct',
      isCorrect: true,
      elapsedMs: 10,
      interactionElapsedMs: 5,
      attemptCount: 1,
      signals: {},
    };

    act(() => {
      result.current.observeFeedOpened();
      result.current.onCardActive(0, 'c-0');
      result.current.onCardEngaged(0, 'c-0');
      result.current.onCardResolved(0, resolution);
      result.current.onCardExplanationViewed(0, 'c-0');
      result.current.onCardSkipped(1, 'c-1');
      result.current.onCardAbandoned(2, 'c-2');
    });

    const names = client.enqueued.map((e) => e.eventName);
    expect(names).toEqual([
      'Session_Initialized',
      'Return_Session_Started',
      'Card_Rendered',
      'Card_Attempted',
      'Card_Resolved',
      'Card_Explanation_Viewed',
      'Card_Skipped',
      'Card_Abandoned',
    ]);
    // Card-scoped events carry the resolved card's generic fields.
    const rendered = client.enqueued.find((e) => e.eventName === 'Card_Rendered');
    expect(rendered).toMatchObject({ cardId: 'c-0', cardIndex: 0, templateType: 'spot_it' });
  });

  it('detaches the AppState listener on unmount', () => {
    const client = makeFakeClient();
    const appState = makeAppState();
    const { result, unmount } = renderHook(() =>
      useFeedTelemetry({
        client,
        feedId: 'feed-1',
        getAnonymousUserId: () => 'anon-1',
        getCardById: (id) => makeCard(id),
        appState,
      }),
    );
    act(() => result.current.observeFeedOpened());
    unmount();
    // After unmount the listener is removed → emit is a no-op.
    act(() => appState.emit('background'));
    expect(client.abandonments).toHaveLength(0);
  });
});
