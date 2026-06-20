/**
 * Session instrumentation (Azure DevOps #76; Technical Design §10, §14).
 *
 * The single, TEMPLATE-AGNOSTIC place that turns app/session lifecycle into the
 * eleven §10 telemetry events. It owns a {@link TelemetryClient} and exposes
 * typed handlers the React layer (`useSessionTelemetry` + `SessionRoute`) calls
 * from the controller callbacks and UI actions.
 *
 * Template-agnostic by construction (CLAUDE.md §6): every card field on an event
 * is read GENERICALLY off the active {@link LiquidCard} (`cardId`, `templateType`,
 * `category`, `evidenceTier`, `difficulty`) — there is NO switch on
 * `templateType`. Adding a new template never touches this module.
 *
 * Exactly-once posture (Technical Design §17.1): render/effect-driven events are
 * latched so a re-render cannot double-count them —
 *   - `Session_Initialized` / `Return_Session_Started` per sessionId,
 *   - `Card_Rendered` / `Card_Attempted` / `Card_Resolved` per card activation
 *     (`sessionId:cardIndex`),
 *   - `Card_Explanation_Viewed` per card (`sessionId:cardId`),
 *   - `Session_Completed` per sessionId.
 * User-action events (`Exit_Clicked`, `Intentional_Continue_Clicked`,
 * `Receipt_Shared`) fire per explicit tap — a click handler is not re-invoked by
 * a re-render, so they need no latch. `Session_Abandoned` is built on demand for
 * the unload listener and is best-effort/undercount (§10).
 *
 * Return vs Initialized (documented decision): both are distinct §10 events and
 * may BOTH fire for the entry window — they are not the same logical event.
 * `Session_Initialized` fires for EVERY armed window (including each intentional
 * continue, which mints a fresh sessionId), marking a session being armed.
 * `Return_Session_Started` carries the entry `source` and fires ONCE per
 * instrumentation lifetime — for the FIRST window only — so an intentional
 * continue (a deliberate re-arm, not a re-entry) is never miscounted as a return.
 * Headline return metrics filter on `source: 'direct'`, so we always stamp the
 * real parsed source.
 *
 * NO PII (Technical Design §16): the only identity is the anonymous id; no names,
 * email, contacts, or device identifiers are ever attached.
 */

import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import type { SessionState } from '../session/sessionTypes';
import { getAnonymousUserId as defaultGetAnonymousUserId } from './anonymousUser';
import type { TelemetryClient } from './telemetryClient';
import {
  TelemetryEventNames,
  type TelemetryEventInput,
  type TelemetryEventName,
  type TelemetryRouteKind,
  type TelemetrySource,
} from './telemetryEvents';

/** The §10 attribution sources, used to validate a `?source=` query param. */
const VALID_SOURCES: readonly TelemetrySource[] = [
  'direct',
  'reminder',
  'share',
  'manual_test',
];

/**
 * Parse the `source` attribution from a URL query string (`?source=…`),
 * validating against the §10 union and defaulting to `'direct'`. Never throws:
 * a malformed/absent param degrades to `'direct'` (Technical Design §10 —
 * headline return metrics use only `source: 'direct'`).
 */
export function parseTelemetrySource(search: string | undefined): TelemetrySource {
  try {
    const raw = new URLSearchParams(search ?? '').get('source');
    if (raw !== null && (VALID_SOURCES as readonly string[]).includes(raw)) {
      return raw as TelemetrySource;
    }
  } catch {
    // Malformed query string → fall through to the default.
  }
  return 'direct';
}

/** Injectable dependencies — fully faked in tests (no real client/network). */
export interface SessionTelemetryDeps {
  /** The telemetry client events are enqueued through. */
  client: TelemetryClient;
  /** Anonymous id provider. Defaults to the shared persisted id (§10). */
  getAnonymousUserId?: () => string;
  /** Clock for the client-side `timestampMs`. Defaults to `Date.now`. */
  now?: () => number;
  /** How the session was entered. Defaults to `'session'`. */
  routeKind?: TelemetryRouteKind;
  /** Attribution source for return/share metrics. Defaults to `'direct'`. */
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
 * the `observe`/lifecycle methods from effects on each relevant change.
 */
export interface SessionTelemetry {
  /**
   * Mark a session window armed (`Session_Initialized`, once per sessionId) and,
   * on the FIRST window only, the entry (`Return_Session_Started`, once).
   */
  sessionInitialized(sessionId: string): void;
  /** A card became the ACTIVE/focused card → `Card_Rendered` (once per activation). */
  cardActivated(card: LiquidCard, cardIndex: number, sessionId: string): void;
  /** The active card received its first meaningful input → `Card_Attempted`. */
  cardAttempted(signals?: Record<string, number | string | boolean>): void;
  /** The active card resolved → `Card_Resolved`, mapped from the resolution. */
  cardResolved(resolution: CardResolution): void;
  /** The explanation step became visible for a card → `Card_Explanation_Viewed`. */
  explanationViewed(card: LiquidCard): void;
  /** The session reached its bounded end → `Session_Completed` (once per sessionId). */
  sessionCompleted(state: SessionState): void;
  /** The user confirmed leaving → `Exit_Clicked`. */
  exitClicked(): void;
  /** The user tapped keep-going → `Intentional_Continue_Clicked`. */
  continueClicked(): void;
  /** The user shared from the receipt → `Receipt_Shared`. */
  receiptShared(): void;
  /**
   * Build the best-effort `Session_Abandoned` event for the unload listener, or
   * `null` when no session is in progress (so a hidden receipt/start screen does
   * not emit a spurious abandonment).
   */
  buildAbandonmentEvent(): TelemetryEventInput | null;
}

/**
 * Create the session instrumentation. Each instance owns its own once-latches
 * and active-card context, so tests stay isolated and a fresh mount starts clean.
 */
export function createSessionTelemetry(
  deps: SessionTelemetryDeps,
): SessionTelemetry {
  const { client } = deps;
  const getAnonymousUserId = deps.getAnonymousUserId ?? defaultGetAnonymousUserId;
  const now = deps.now ?? Date.now;
  const routeKind: TelemetryRouteKind = deps.routeKind ?? 'session';
  const source: TelemetrySource = deps.source ?? 'direct';

  // --- Once-latches (Technical Design §17.1). -------------------------------
  const initializedSessions = new Set<string>();
  const renderedCards = new Set<string>();
  const attemptedCards = new Set<string>();
  const resolvedCards = new Set<string>();
  const explanationViewedCards = new Set<string>();
  const completedSessions = new Set<string>();
  const abandonedSessions = new Set<string>();
  let returnFired = false;

  // --- Live context. --------------------------------------------------------
  /** The active/focused card and its position, set on `cardActivated`. */
  let activeCard: { card: LiquidCard; cardIndex: number; sessionId: string } | null =
    null;
  /** The latest sessionId — backs user-action + abandonment context. */
  let currentSessionId = '';
  /** Whether a session is in flight (gates the abandonment event). */
  let inProgress = false;

  /** Stamp the always-present envelope and hand the event to the client. */
  function emit(
    eventName: TelemetryEventName,
    sessionId: string,
    fields: EmitFields = {},
  ): void {
    client.enqueue({
      eventName,
      anonymousUserId: getAnonymousUserId(),
      sessionId,
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
    sessionInitialized(sessionId) {
      if (!sessionId) return;
      currentSessionId = sessionId;
      inProgress = true;
      if (initializedSessions.has(sessionId)) return;
      initializedSessions.add(sessionId);
      emit(TelemetryEventNames.Session_Initialized, sessionId, {
        routeKind,
        source,
      });
      // Return_Session_Started: the entry event, once per instrumentation life —
      // an intentional continue re-arms (new sessionId) but is NOT a re-entry.
      if (!returnFired) {
        returnFired = true;
        emit(TelemetryEventNames.Return_Session_Started, sessionId, {
          routeKind,
          source,
        });
      }
    },

    cardActivated(card, cardIndex, sessionId) {
      if (!card || !sessionId) return;
      // Refresh the active-card context even if already latched, so a later
      // attempt/resolve always reads the current card.
      activeCard = { card, cardIndex, sessionId };
      currentSessionId = sessionId;
      const key = `${sessionId}:${cardIndex}`;
      if (renderedCards.has(key)) return;
      renderedCards.add(key);
      emit(TelemetryEventNames.Card_Rendered, sessionId, cardFields(card, cardIndex));
    },

    cardAttempted() {
      // The attempt is timed by the renderer from interaction-enabled (§10/§14);
      // here we only carry the active card's context, once per card activation.
      if (!activeCard) return;
      const { card, cardIndex, sessionId } = activeCard;
      const key = `${sessionId}:${cardIndex}`;
      if (attemptedCards.has(key)) return;
      attemptedCards.add(key);
      emit(TelemetryEventNames.Card_Attempted, sessionId, cardFields(card, cardIndex));
    },

    cardResolved(resolution) {
      if (!activeCard) return;
      const { card, cardIndex, sessionId } = activeCard;
      const key = `${sessionId}:${cardIndex}`;
      if (resolvedCards.has(key)) return;
      resolvedCards.add(key);
      emit(TelemetryEventNames.Card_Resolved, sessionId, {
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

    explanationViewed(card) {
      if (!card) return;
      const sessionId = currentSessionId;
      if (!sessionId) return;
      const key = `${sessionId}:${card.cardId}`;
      if (explanationViewedCards.has(key)) return;
      explanationViewedCards.add(key);
      // Index from the active card when it matches (it does during the gate's
      // feedback step); omitted otherwise rather than guessed.
      const cardIndex =
        activeCard && activeCard.card.cardId === card.cardId
          ? activeCard.cardIndex
          : undefined;
      emit(TelemetryEventNames.Card_Explanation_Viewed, sessionId, {
        cardId: card.cardId,
        cardIndex,
        templateType: card.templateType,
        category: card.category,
        evidenceTier: card.evidenceTier,
        difficulty: card.difficulty,
      });
    },

    sessionCompleted(state) {
      const sessionId = state.sessionId;
      if (!sessionId) return;
      currentSessionId = sessionId;
      inProgress = false;
      if (completedSessions.has(sessionId)) return;
      completedSessions.add(sessionId);
      // The §10 payload has no session-aggregate count fields; per-card counts
      // are reconstructable server-side from Card_Resolved. We emit the standard
      // session envelope + routeKind.
      emit(TelemetryEventNames.Session_Completed, sessionId, { routeKind });
    },

    exitClicked() {
      const sessionId = currentSessionId;
      inProgress = false;
      if (!sessionId) return;
      emit(TelemetryEventNames.Exit_Clicked, sessionId, { routeKind });
    },

    continueClicked() {
      const sessionId = currentSessionId;
      if (!sessionId) return;
      emit(TelemetryEventNames.Intentional_Continue_Clicked, sessionId, {
        routeKind,
      });
    },

    receiptShared() {
      const sessionId = currentSessionId;
      if (!sessionId) return;
      emit(TelemetryEventNames.Receipt_Shared, sessionId, { routeKind });
    },

    buildAbandonmentEvent() {
      if (!inProgress || !currentSessionId) return null;
      // At-most-once per session (Technical Design §10 "undercount/best-effort").
      // `registerAbandonmentListeners` binds BOTH `visibilitychange→hidden` and
      // `pagehide`, so a single page close (and any tab-backgrounding) would
      // otherwise emit duplicate Session_Abandoned events with distinct eventIds
      // that the server cannot dedup. Latch on the sessionId so abandonment is
      // recorded once; a subsequent fire is a no-op.
      if (abandonedSessions.has(currentSessionId)) return null;
      abandonedSessions.add(currentSessionId);
      return {
        eventName: TelemetryEventNames.Session_Abandoned,
        anonymousUserId: getAnonymousUserId(),
        sessionId: currentSessionId,
        timestampMs: now(),
        routeKind,
      };
    },
  };
}
