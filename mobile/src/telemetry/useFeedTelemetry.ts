/**
 * React Native wiring for the feed instrumentation (ADO #129, M5; the RN
 * counterpart of the web `src/telemetry/useFeedTelemetry.ts`, #108).
 *
 * A THIN adapter over the framework-agnostic {@link createFeedTelemetry}: it holds
 * a single stable instrumentation instance for the feed's lifetime, resolves the
 * M3 FeedScreen index-based seam callbacks into the factory's card-aware methods,
 * and registers the AppState abandonment listener. ALL event logic, field
 * mapping, and once-latching live in {@link createFeedTelemetry} (so they unit-test
 * without React); this hook only owns the RN lifecycle plumbing and the
 * cardId→{@link LiquidCard} resolution.
 *
 * RN abandonment (Technical Design §10): there is no `visibilitychange`/`pagehide`/
 * `sendBeacon`. Instead we subscribe to React Native {@link AppState}; a transition
 * to `'background'` or `'inactive'` fires the best-effort, at-most-once
 * `Session_Abandoned` through the client's normal `fetch` transport. The AppState
 * source is injectable so tests drive it with a fake (no native module).
 *
 * Template-agnostic (CLAUDE.md §6): the factory derives every card field
 * generically; this hook only resolves the card and forwards it. The feed seams
 * carry a `cardId` (and the resolution carries its own `cardId`), so a single
 * injected `getCardById` reconstructs the card the factory needs — no switch on
 * `templateType` anywhere.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getCardById as defaultGetCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import {
  createFeedTelemetry,
  type FeedTelemetry,
  type FeedTelemetryDeps,
} from './feedTelemetry';

/**
 * Minimal AppState surface the hook subscribes to — the RN `AppState.addEventListener`
 * shape. Injectable so tests drive transitions with a fake.
 */
export interface AppStateLike {
  addEventListener(
    type: 'change',
    listener: (state: AppStateStatus) => void,
  ): { remove(): void };
}

/** Dependencies for {@link useFeedTelemetry} — the factory deps plus card lookup. */
export interface UseFeedTelemetryDeps extends FeedTelemetryDeps {
  /** Resolve a `cardId` to its card. Defaults to the authored catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** AppState source for abandonment. Defaults to RN's {@link AppState}. */
  appState?: AppStateLike;
}

/** The stable handle wired into the M3 FeedScreen seam callbacks + the gate. */
export interface FeedTelemetryHandle {
  /** Effect seam — call once when the feed is opened (idempotent). */
  observeFeedOpened: () => void;
  /** Feed seam — a game became the active/focused card (`onCardActive`). */
  onCardActive: (index: number, cardId: string) => void;
  /** Feed seam — the active game was first engaged (`onCardEngaged`). */
  onCardEngaged: (index: number, cardId: string) => void;
  /** Feed seam — the active game resolved (`onCardResolved`). */
  onCardResolved: (index: number, resolution: CardResolution) => void;
  /** Feed seam — a game was swiped past un-engaged (`onCardSkipped`). */
  onCardSkipped: (index: number, cardId: string) => void;
  /** Feed seam — a game was engaged then left before resolving (`onCardAbandoned`). */
  onCardAbandoned: (index: number, cardId: string) => void;
  /** Feed seam — the explanation step became visible for a card. */
  onCardExplanationViewed: (index: number, cardId: string) => void;
}

/**
 * Build the feed instrumentation and wire it to React Native. The instrumentation
 * instance is created once; injected `deps` are read through a ref so the stable
 * instance always sees current values without being rebuilt.
 */
export function useFeedTelemetry(
  deps: UseFeedTelemetryDeps,
): FeedTelemetryHandle {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // One instance for the feed's lifetime — latches/active-card persist across
  // renders so exactly-once holds. `feedId`/`source`/`routeKind` are captured
  // once (stable per mount); the function deps read live via the ref.
  const telemetryRef = useRef<FeedTelemetry | null>(null);
  if (telemetryRef.current === null) {
    telemetryRef.current = createFeedTelemetry({
      client: deps.client,
      feedId: deps.feedId,
      getAnonymousUserId: () => depsRef.current.getAnonymousUserId?.() ?? '',
      now: () => (depsRef.current.now ?? Date.now)(),
      routeKind: deps.routeKind,
      source: deps.source,
    });
  }
  const telemetry = telemetryRef.current;

  /** Resolve a cardId through the live (injectable) lookup. */
  const resolveCard = useCallback(
    (cardId: string): LiquidCard | undefined =>
      (depsRef.current.getCardById ?? defaultGetCardById)(cardId),
    [],
  );

  // Register best-effort abandonment delivery for the feed's lifetime. A move to
  // background/inactive is the RN abandonment signal; the emitter latches it
  // at-most-once, so a later 'active' return (and re-background) emits nothing
  // for this feed instance.
  const client = deps.client;
  useEffect(() => {
    const source = depsRef.current.appState ?? AppState;
    const subscription = source.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        try {
          const event = telemetry.buildAbandonmentEvent();
          if (event) client.trackAbandonment(event);
        } catch {
          // Best-effort: never let a lifecycle handler throw.
        }
      }
    });
    return () => subscription.remove();
  }, [client, telemetry]);

  const observeFeedOpened = useCallback(
    () => telemetry.feedOpened(),
    [telemetry],
  );
  const onCardActive = useCallback(
    (index: number, cardId: string) => {
      const card = resolveCard(cardId);
      if (card) telemetry.cardActivated(card, index);
    },
    [telemetry, resolveCard],
  );
  const onCardEngaged = useCallback(
    (index: number, cardId: string) => {
      const card = resolveCard(cardId);
      if (card) telemetry.cardAttempted(card, index);
    },
    [telemetry, resolveCard],
  );
  const onCardResolved = useCallback(
    (index: number, resolution: CardResolution) => {
      const card = resolveCard(resolution.cardId);
      if (card) telemetry.cardResolved(card, index, resolution);
    },
    [telemetry, resolveCard],
  );
  const onCardSkipped = useCallback(
    (index: number, cardId: string) => {
      const card = resolveCard(cardId);
      if (card) telemetry.cardSkipped(card, index);
    },
    [telemetry, resolveCard],
  );
  const onCardAbandoned = useCallback(
    (index: number, cardId: string) => {
      const card = resolveCard(cardId);
      if (card) telemetry.cardAbandoned(card, index);
    },
    [telemetry, resolveCard],
  );
  const onCardExplanationViewed = useCallback(
    (index: number, cardId: string) => {
      const card = resolveCard(cardId);
      if (card) telemetry.explanationViewed(card, index);
    },
    [telemetry, resolveCard],
  );

  return useMemo<FeedTelemetryHandle>(
    () => ({
      observeFeedOpened,
      onCardActive,
      onCardEngaged,
      onCardResolved,
      onCardSkipped,
      onCardAbandoned,
      onCardExplanationViewed,
    }),
    [
      observeFeedOpened,
      onCardActive,
      onCardEngaged,
      onCardResolved,
      onCardSkipped,
      onCardAbandoned,
      onCardExplanationViewed,
    ],
  );
}
