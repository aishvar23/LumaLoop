/**
 * React wiring for the session instrumentation (Azure DevOps #76).
 *
 * A THIN adapter over the framework-agnostic {@link createSessionTelemetry}: it
 * holds a single stable instrumentation instance for the component's lifetime,
 * exposes stable callbacks for the session controller + UI to subscribe to, and
 * registers the unload abandonment listeners. ALL event logic, field mapping,
 * and once-latching live in `createSessionTelemetry` (so they unit-test without
 * React); this hook only owns the React lifecycle plumbing.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import type { SessionState } from '../session/sessionTypes';
import {
  createSessionTelemetry,
  type SessionTelemetry,
  type SessionTelemetryDeps,
} from './sessionTelemetry';
import { registerAbandonmentListeners } from './telemetryClient';

/** The stable handle returned to {@link FeedSession}. */
export interface SessionTelemetryHandle {
  /** Controller callback — forwards the active card's first input. */
  onAttempt: (signals?: Record<string, number | string | boolean>) => void;
  /** Controller callback — fired after each card resolves. */
  onCardResolved: (resolution: CardResolution) => void;
  /** Controller callback — fired once the session completes. */
  onSessionCompleted: (state: SessionState) => void;
  /** Effect seam — call when the session's id is known (idempotent). */
  observeSession: (sessionId: string) => void;
  /** Effect seam — call with the active card on every activation change. */
  observeActiveCard: (
    card: LiquidCard | null,
    cardIndex: number,
    sessionId: string,
  ) => void;
  /** Fired by the feedback gate when the explanation step becomes visible. */
  onExplanationViewed: (card: LiquidCard) => void;
  /** UI action — user confirmed leaving. */
  exitClicked: () => void;
  /** UI action — user tapped keep-going. */
  continueClicked: () => void;
  /** UI action — user shared from the receipt. */
  receiptShared: () => void;
}

/**
 * Build the session instrumentation and wire it to React. The instrumentation
 * instance is created once; injected `deps` are read through a ref so the stable
 * instance always sees current values without being rebuilt.
 */
export function useSessionTelemetry(
  deps: SessionTelemetryDeps,
): SessionTelemetryHandle {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // One instance for the component lifetime — latches/active-card persist across
  // renders so exactly-once holds. `source`/`routeKind` are captured once (they
  // are stable per mount); the function deps read live via the ref.
  const telemetryRef = useRef<SessionTelemetry | null>(null);
  if (telemetryRef.current === null) {
    telemetryRef.current = createSessionTelemetry({
      client: deps.client,
      getAnonymousUserId: () => depsRef.current.getAnonymousUserId?.() ?? '',
      now: () => (depsRef.current.now ?? Date.now)(),
      routeKind: deps.routeKind,
      source: deps.source,
    });
  }
  const telemetry = telemetryRef.current;

  // Register best-effort abandonment delivery for the session's lifetime.
  const client = deps.client;
  useEffect(() => {
    return registerAbandonmentListeners({
      client,
      buildEvent: () => telemetry.buildAbandonmentEvent(),
    });
  }, [client, telemetry]);

  const onAttempt = useCallback(
    (signals?: Record<string, number | string | boolean>) =>
      telemetry.cardAttempted(signals),
    [telemetry],
  );
  const onCardResolved = useCallback(
    (resolution: CardResolution) => telemetry.cardResolved(resolution),
    [telemetry],
  );
  const onSessionCompleted = useCallback(
    (state: SessionState) => telemetry.sessionCompleted(state),
    [telemetry],
  );
  const observeSession = useCallback(
    (sessionId: string) => telemetry.sessionInitialized(sessionId),
    [telemetry],
  );
  const observeActiveCard = useCallback(
    (card: LiquidCard | null, cardIndex: number, sessionId: string) => {
      if (card) telemetry.cardActivated(card, cardIndex, sessionId);
    },
    [telemetry],
  );
  const onExplanationViewed = useCallback(
    (card: LiquidCard) => telemetry.explanationViewed(card),
    [telemetry],
  );
  const exitClicked = useCallback(() => telemetry.exitClicked(), [telemetry]);
  const continueClicked = useCallback(
    () => telemetry.continueClicked(),
    [telemetry],
  );
  const receiptShared = useCallback(
    () => telemetry.receiptShared(),
    [telemetry],
  );

  return useMemo<SessionTelemetryHandle>(
    () => ({
      onAttempt,
      onCardResolved,
      onSessionCompleted,
      observeSession,
      observeActiveCard,
      onExplanationViewed,
      exitClicked,
      continueClicked,
      receiptShared,
    }),
    [
      onAttempt,
      onCardResolved,
      onSessionCompleted,
      observeSession,
      observeActiveCard,
      onExplanationViewed,
      exitClicked,
      continueClicked,
      receiptShared,
    ],
  );
}
