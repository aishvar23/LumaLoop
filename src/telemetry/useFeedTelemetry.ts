/**
 * React wiring for the feed instrumentation (Azure DevOps #108).
 *
 * A THIN adapter over the framework-agnostic {@link createFeedTelemetry}: it
 * holds a single stable instrumentation instance for the feed's lifetime,
 * resolves the feed's index-based seam callbacks (#106) into the telemetry
 * factory's card-aware methods, and registers the unload abandonment listeners.
 * ALL event logic, field mapping, and once-latching live in
 * {@link createFeedTelemetry} (so they unit-test without React); this hook only
 * owns the React lifecycle plumbing and the cardId→{@link LiquidCard} resolution.
 *
 * Template-agnostic (CLAUDE.md §6): the factory derives every card field
 * generically; this hook only resolves the card and forwards it. The feed seams
 * carry a `cardId` (and the resolution carries its own `cardId`), so a single
 * injected `getCardById` reconstructs the card the factory needs — no switch on
 * `templateType` anywhere.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { getCardById as defaultGetCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import {
  createFeedTelemetry,
  type FeedTelemetry,
  type FeedTelemetryDeps,
} from './feedTelemetry';
import { registerAbandonmentListeners } from './telemetryClient';

/** Dependencies for {@link useFeedTelemetry} — the factory deps plus card lookup. */
export interface UseFeedTelemetryDeps extends FeedTelemetryDeps {
  /** Resolve a `cardId` to its card. Defaults to the authored catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
}

/** The stable handle wired into the feed's seam callbacks (#106) + the gate. */
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
  /** Gate seam — the explanation step became visible for a card. */
  onExplanationViewed: (card: LiquidCard) => void;
}

/**
 * Build the feed instrumentation and wire it to React. The instrumentation
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

  // Register best-effort abandonment delivery for the feed's lifetime.
  const client = deps.client;
  useEffect(() => {
    return registerAbandonmentListeners({
      client,
      buildEvent: () => telemetry.buildAbandonmentEvent(),
    });
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
  const onExplanationViewed = useCallback(
    (card: LiquidCard) => telemetry.explanationViewed(card),
    [telemetry],
  );

  return useMemo<FeedTelemetryHandle>(
    () => ({
      observeFeedOpened,
      onCardActive,
      onCardEngaged,
      onCardResolved,
      onCardSkipped,
      onCardAbandoned,
      onExplanationViewed,
    }),
    [
      observeFeedOpened,
      onCardActive,
      onCardEngaged,
      onCardResolved,
      onCardSkipped,
      onCardAbandoned,
      onExplanationViewed,
    ],
  );
}
