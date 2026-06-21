/**
 * Feed instrumentation for React Native (ADO #129, M5; ported from the web
 * `src/telemetry/feedTelemetry.ts`, #108). docs/FEED_DIRECTION.md §6; Technical
 * Design §10, §14.
 *
 * The single, TEMPLATE-AGNOSTIC place that turns feed lifecycle into the §6
 * telemetry events. It owns a {@link TelemetryClient} and exposes typed handlers
 * the React layer ({@link ./useFeedTelemetry}) calls from the M3 FeedScreen seam
 * callbacks and the explanation-viewed seam.
 *
 * Framework-agnostic by construction: this module imports no React and no native
 * module, so it unit-tests against a fake client. The web version had a
 * URL-based `parseTelemetrySource` (query string) which is omitted here — native
 * has no entry URL, so `source` is supplied directly (defaulting to `'direct'`).
 *
 * Template-agnostic (CLAUDE.md §6): every card field on an event is read
 * GENERICALLY off the {@link LiquidCard} (`cardId`, `cardIndex`, `templateType`,
 * `category`, `evidenceTier`, `difficulty`) — there is NO switch on `templateType`.
 * Adding a new template never touches this module.
 *
 * One feed instance per instrumentation lifetime: the endless feed has a single
 * per-mount `feedId` that backs the `sessionId` envelope field on every event.
 *
 * Exactly-once posture (Technical Design §17.1): render/effect-driven events are
 * latched so a re-render cannot double-count them —
 *   - `Session_Initialized` (feed opened) / `Return_Session_Started` once each,
 *   - `Card_Rendered` / `Card_Attempted` / `Card_Resolved` / `Card_Skipped` /
 *     `Card_Abandoned` once per card activation (by `cardIndex`),
 *   - `Card_Explanation_Viewed` once per card activation (`cardIndex`).
 * `Session_Abandoned` is built on demand for the AppState listener and is
 * best-effort/undercount (§10), latched at-most-once.
 *
 * NO PII (Technical Design §16): the only identity is the anonymous id; no names,
 * email, contacts, or device identifiers are ever attached.
 */

import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import { getAnonymousUserId as defaultGetAnonymousUserId } from './anonymousUser';
import type { TelemetryClient } from './telemetryClient';
import {
  TelemetryEventNames,
  type TelemetryEventInput,
  type TelemetryEventName,
  type TelemetryRouteKind,
  type TelemetrySource,
} from '../core/telemetry/telemetryEvents';

/** Injectable dependencies — fully faked in tests (no real client/network). */
export interface FeedTelemetryDeps {
  /** The telemetry client events are enqueued through. */
  client: TelemetryClient;
  /**
   * The per-mount feed instance id, backing the `sessionId` envelope field on
   * every event. Stable for the instrumentation lifetime.
   */
  feedId: string;
  /** Anonymous id provider. Defaults to the shared persisted id (§10). */
  getAnonymousUserId?: () => string;
  /** Clock for the client-side `timestampMs`. Defaults to `Date.now`. */
  now?: () => number;
  /** How the feed was entered. Defaults to `'session'`. */
  routeKind?: TelemetryRouteKind;
  /** Attribution source for return metrics. Defaults to `'direct'`. */
  source?: TelemetrySource;
}

/** Card fields carried by card-scoped events — derived generically off a card. */
type CardEventFields = Pick<
  TelemetryEventInput,
  'cardId' | 'cardIndex' | 'templateType' | 'category' | 'evidenceTier' | 'difficulty'
>;

/** Everything an event may carry beyond the always-present envelope fields. */
type EmitFields = Omit<
  TelemetryEventInput,
  'eventName' | 'anonymousUserId' | 'sessionId' | 'timestampMs'
>;

/**
 * The instrumentation surface consumed by the React layer. Every method is
 * idempotent where §17.1 requires exactly-once; the React wiring may safely call
 * the lifecycle methods from effects/callbacks on each relevant change.
 */
export interface FeedTelemetry {
  /**
   * The feed was opened: `Session_Initialized` (once) and, on the FIRST call
   * only, the entry `Return_Session_Started` (once).
   */
  feedOpened(): void;
  /** A game became the ACTIVE/focused card → `Card_Rendered` (once per index). */
  cardActivated(card: LiquidCard, cardIndex: number): void;
  /** The active game received its first interaction → `Card_Attempted` (once per index). */
  cardAttempted(card: LiquidCard, cardIndex: number): void;
  /** The active game resolved → `Card_Resolved`, mapped from the resolution (once per index). */
  cardResolved(card: LiquidCard, cardIndex: number, resolution: CardResolution): void;
  /** A game was swiped past WITHOUT being engaged → `Card_Skipped` (once per index). */
  cardSkipped(card: LiquidCard, cardIndex: number): void;
  /** A game was engaged then left before resolving → `Card_Abandoned` (once per index). */
  cardAbandoned(card: LiquidCard, cardIndex: number): void;
  /** The explanation step became visible for a game → `Card_Explanation_Viewed`. */
  explanationViewed(card: LiquidCard, cardIndex: number): void;
  /**
   * Build the best-effort `Session_Abandoned` event for the AppState listener, or
   * `null` when the feed was never opened (so a pre-open background emits nothing)
   * or abandonment was already recorded (at-most-once).
   */
  buildAbandonmentEvent(): TelemetryEventInput | null;
}

/**
 * Create the feed instrumentation. Each instance owns its own once-latches and
 * active-card context, so tests stay isolated and a fresh mount starts clean.
 */
export function createFeedTelemetry(deps: FeedTelemetryDeps): FeedTelemetry {
  const { client, feedId } = deps;
  const getAnonymousUserId = deps.getAnonymousUserId ?? defaultGetAnonymousUserId;
  const now = deps.now ?? Date.now;
  const routeKind: TelemetryRouteKind = deps.routeKind ?? 'session';
  const source: TelemetrySource = deps.source ?? 'direct';

  // --- Once-latches (Technical Design §17.1). -------------------------------
  let openedFired = false;
  let returnFired = false;
  const renderedCards = new Set<number>();
  const attemptedCards = new Set<number>();
  const resolvedCards = new Set<number>();
  const skippedCards = new Set<number>();
  const abandonedCards = new Set<number>();
  const explanationViewedCards = new Set<number>();
  let abandonmentFired = false;

  /** Stamp the always-present envelope and hand the event to the client. */
  function emit(eventName: TelemetryEventName, fields: EmitFields = {}): void {
    client.enqueue({
      eventName,
      anonymousUserId: getAnonymousUserId(),
      sessionId: feedId,
      timestampMs: now(),
      ...fields,
    });
  }

  /** Read the generic, template-agnostic card fields off any `LiquidCard`. */
  function cardFields(card: LiquidCard, cardIndex: number): CardEventFields {
    return {
      cardId: card.cardId,
      cardIndex,
      templateType: card.templateType,
      category: card.category,
      evidenceTier: card.evidenceTier,
      difficulty: card.difficulty,
    };
  }

  return {
    feedOpened() {
      if (!feedId) return;
      if (!openedFired) {
        openedFired = true;
        emit(TelemetryEventNames.Session_Initialized, { routeKind, source });
      }
      // Return_Session_Started: the entry event, once per feed instance —
      // the headline organic-return metric (FEED_DIRECTION §6).
      if (!returnFired) {
        returnFired = true;
        emit(TelemetryEventNames.Return_Session_Started, { routeKind, source });
      }
    },

    cardActivated(card, cardIndex) {
      if (!card) return;
      if (renderedCards.has(cardIndex)) return;
      renderedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Rendered, cardFields(card, cardIndex));
    },

    cardAttempted(card, cardIndex) {
      if (!card) return;
      if (attemptedCards.has(cardIndex)) return;
      attemptedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Attempted, cardFields(card, cardIndex));
    },

    cardResolved(card, cardIndex, resolution) {
      if (!card) return;
      if (resolvedCards.has(cardIndex)) return;
      resolvedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Resolved, {
        ...cardFields(card, cardIndex),
        resolutionType: resolution.resolutionType,
        isCorrect: resolution.isCorrect,
        elapsedMs: resolution.elapsedMs,
        interactionElapsedMs: resolution.interactionElapsedMs,
        attemptCount: resolution.attemptCount,
        // The NAMES of the signals present on the resolution (no values, no PII).
        measuredSignals: Object.keys(resolution.signals),
      });
    },

    cardSkipped(card, cardIndex) {
      if (!card) return;
      if (skippedCards.has(cardIndex)) return;
      skippedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Skipped, cardFields(card, cardIndex));
    },

    cardAbandoned(card, cardIndex) {
      if (!card) return;
      if (abandonedCards.has(cardIndex)) return;
      abandonedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Abandoned, cardFields(card, cardIndex));
    },

    explanationViewed(card, cardIndex) {
      if (!card) return;
      // Latch PER ACTIVATION (by cardIndex), consistent with Card_Rendered/
      // Resolved/Skipped/Abandoned: the endless feed replays the same cardId at
      // new indices, so a cardId-keyed latch would suppress the explanation view
      // of a repeat play and undercount it relative to its Card_Resolved.
      if (explanationViewedCards.has(cardIndex)) return;
      explanationViewedCards.add(cardIndex);
      emit(TelemetryEventNames.Card_Explanation_Viewed, cardFields(card, cardIndex));
    },

    buildAbandonmentEvent() {
      if (!openedFired || !feedId) return null;
      // At-most-once (Technical Design §10 "undercount/best-effort"). An AppState
      // listener may fire on both 'inactive' and 'background' for one departure;
      // latch so abandonment is recorded once, and a subsequent fire is a no-op.
      if (abandonmentFired) return null;
      abandonmentFired = true;
      return {
        eventName: TelemetryEventNames.Session_Abandoned,
        anonymousUserId: getAnonymousUserId(),
        sessionId: feedId,
        timestampMs: now(),
        routeKind,
      };
    },
  };
}
