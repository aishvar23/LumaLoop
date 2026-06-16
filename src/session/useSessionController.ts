/**
 * Feed/session controller (Azure DevOps #59; Technical Design §4, §8).
 *
 * The controller OWNS session progression; renderers own ONLY card interaction
 * (CLAUDE.md §4). It drives the pure {@link sessionReducer} with `useReducer`,
 * owns the wall clock and the session duration timer, presents the active card
 * through an injected {@link RendererRegistry}, and exposes a clean API for the
 * UI (#69-72) and lifecycle callbacks for telemetry (#74-76) to subscribe to.
 *
 * Why the controller owns the clock (the #58 caveat)
 * --------------------------------------------------
 * The reducer is pure: it reads no clock and `BEGIN_RESOLVE` carries no
 * timestamp, so the reducer can enforce the card-COUNT limit but CANNOT enforce
 * the DURATION limit on its own (Technical Design §8). The controller closes
 * that gap two ways:
 *   1. Before starting a NEW card it checks the clock — if the duration window
 *      has elapsed (or the cards ran out) it dispatches `COMPLETE` instead of
 *      `BEGIN_RESOLVE`.
 *   2. It arms a real `setTimeout` for the remaining window. If that fires while
 *      a card is still in flight, it dispatches `COMPLETE`: no NEW card starts,
 *      and a late `onResolve` from the in-flight card is a tolerated reducer
 *      no-op (RESOLVE_CARD is illegal from `completed`).
 *
 * Dependency inversion (CLAUDE.md §4/§6)
 * --------------------------------------
 * The controller never imports a concrete renderer or card config. It resolves
 * a renderer for the active card's `templateType` via the injected registry and
 * a `LiquidCard` via the injected `getCardById`. A missing renderer fails safe
 * (the card resolves as an error and the feed advances) rather than crashing.
 *
 * Testability
 * -----------
 * `now`, `generateSessionId`, and `getCardById` are all injectable; the duration
 * timer uses `setTimeout` so it can be driven by vitest fake timers. No module
 * here reads `Date.now()` except the documented default `now`.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { catalog } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import type { CardResolution, CardStartContext } from '../templates/contract';
import { initSession, sessionReducer } from './sessionReducer';
import type {
  SessionMode,
  SessionState,
  SessionStatus,
} from './sessionTypes';
import { resolveRenderer } from './rendererRegistry';
import type { RendererRegistry } from './rendererRegistry';

// ---------------------------------------------------------------------------
// Default injectables (all overridable for tests / non-catalog cards).
// ---------------------------------------------------------------------------

/** Catalog lookup index, built once. Backs the default `getCardById`. */
const catalogById: ReadonlyMap<string, LiquidCard> = new Map(
  catalog.map((card) => [card.cardId, card]),
);

/** Default `getCardById`: resolve a cardId against the authored catalog. */
function getCatalogCardById(cardId: string): LiquidCard | undefined {
  return catalogById.get(cardId);
}

/** Default session-id factory. Prefers `crypto.randomUUID` when available. */
function defaultGenerateSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/** A card to play: either a fully-typed card or a cardId to resolve. */
export type SessionCardInput = LiquidCard | string;

export type SessionControllerOptions = {
  /**
   * Maps each `TemplateType` to its renderer (dependency inversion).
   *
   * Must be referentially stable for the lifetime of a session: the registry is
   * captured by ref (like the other injectables) so a card's renderer is looked
   * up at render time, but a registry change ALONE does not re-resolve the
   * in-play card. Pass a module-constant (or `useMemo`/`useRef`) registry, not a
   * fresh inline object each render.
   */
  registry: RendererRegistry;
  /** Injectable wall clock. Defaults to `Date.now`. */
  now?: () => number;
  /** Injectable session-id factory. Defaults to a UUID. */
  generateSessionId?: () => string;
  /** Injectable cardId -> card resolver. Defaults to the local catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /**
   * Fired after each card resolves (including fail-safe error resolutions).
   * The telemetry layer (#74-76) subscribes here; the controller imports no
   * telemetry itself.
   */
  onCardResolved?: (resolution: CardResolution) => void;
  /** Fired once when the session reaches `completed`. */
  onSessionCompleted?: (state: SessionState) => void;
  /** Forwarded from the active renderer's first meaningful input. */
  onAttempt?: (signals?: Record<string, number | string | boolean>) => void;
};

export type SessionController = {
  /** Lifecycle status of the underlying session. */
  status: SessionStatus;
  /** The full session state (read-only view for the UI / receipt). */
  state: SessionState;
  /** The active session's mode, or `null` before the first `start`. */
  mode: SessionMode | null;
  /** The card currently in play (only during `resolving_card`), else `null`. */
  currentCard: LiquidCard | null;
  /** Rendered element for the active card, or `null` when none is in play. */
  activeCardElement: ReactNode | null;
  /** Zero-based index of the active/next card within the session. */
  index: number;
  /** Total cards composed into this session window. */
  total: number;
  /** Resolutions recorded so far this window. */
  results: readonly CardResolution[];
  /** Arm (or, after `continueSession`, re-arm) a session for `mode` + cards. */
  start: (mode: SessionMode, cards: ReadonlyArray<SessionCardInput>) => void;
  /** Wired to the active renderer's `onResolve`; records + advances the feed. */
  resolveActiveCard: (resolution: CardResolution) => void;
  /** User leaves the session (terminal). */
  exitSession: () => void;
  /** User chooses to keep playing after a completed session. */
  continueSession: () => void;
};

// ---------------------------------------------------------------------------
// Hook.
// ---------------------------------------------------------------------------

export function useSessionController(
  options: SessionControllerOptions,
): SessionController {
  const {
    registry,
    now = Date.now,
    generateSessionId = defaultGenerateSessionId,
    getCardById = getCatalogCardById,
  } = options;

  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    initSession({ sessionId: '', mode: 'one_minute_rescue' }),
  );

  // --- Latest-value refs so callbacks/effects stay stable across renders. ---
  const stateRef = useRef(state);
  stateRef.current = state;

  const nowRef = useRef(now);
  nowRef.current = now;
  const generateSessionIdRef = useRef(generateSessionId);
  generateSessionIdRef.current = generateSessionId;
  const getCardByIdRef = useRef(getCardById);
  getCardByIdRef.current = getCardById;
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const onCardResolvedRef = useRef(options.onCardResolved);
  onCardResolvedRef.current = options.onCardResolved;
  const onSessionCompletedRef = useRef(options.onSessionCompleted);
  onSessionCompletedRef.current = options.onSessionCompleted;
  const onAttemptRef = useRef(options.onAttempt);
  onAttemptRef.current = options.onAttempt;

  /** Per-session map of cards passed by value (may not live in the catalog). */
  const providedCardsRef = useRef<Map<string, LiquidCard>>(new Map());
  /** `activeAtMs` for the card currently in play (set when it begins). */
  const cardActiveAtMsRef = useRef(0);
  /** Latches `onSessionCompleted` to once-per-session-id. */
  const completedFiredForRef = useRef<string | null>(null);

  /** Resolve a cardId to its card: provided-by-value first, then injected. */
  const resolveCardById = useCallback(
    (cardId: string | undefined): LiquidCard | undefined => {
      if (!cardId) return undefined;
      return providedCardsRef.current.get(cardId) ?? getCardByIdRef.current(cardId);
    },
    [],
  );

  /** Record a resolution + notify the lifecycle callback (if a card is live). */
  const internalResolve = useCallback((resolution: CardResolution) => {
    const status = stateRef.current.status;
    // Ignore late/illegal resolves (e.g. an in-flight card resolving after the
    // duration timer already completed the session) — mirror the reducer so no
    // spurious lifecycle callback fires either.
    if (status !== 'active' && status !== 'resolving_card') return;
    dispatch({ type: 'RESOLVE_CARD', resolution, nowMs: nowRef.current() });
    onCardResolvedRef.current?.(resolution);
  }, []);

  // --- Public actions -------------------------------------------------------

  const start = useCallback(
    (mode: SessionMode, cards: ReadonlyArray<SessionCardInput>) => {
      // `START_SESSION` is a reducer no-op unless the session is `idle` or
      // `intentional_continue` (sessionReducer.ts). Gate the provided-cards
      // side effect by the SAME precondition so a stray `start()` during a live
      // session can't swap the by-value card map out from under the in-play
      // card (which would silently trip the missing-card fail-safe).
      const status = stateRef.current.status;
      if (status !== 'idle' && status !== 'intentional_continue') return;
      const provided = new Map<string, LiquidCard>();
      const cardIds = cards.map((card) => {
        if (typeof card === 'string') return card;
        provided.set(card.cardId, card);
        return card.cardId;
      });
      providedCardsRef.current = provided;
      dispatch({
        type: 'START_SESSION',
        sessionId: generateSessionIdRef.current(),
        mode,
        cardIds,
        startedAtMs: nowRef.current(),
      });
    },
    [],
  );

  const resolveActiveCard = useCallback(
    (resolution: CardResolution) => internalResolve(resolution),
    [internalResolve],
  );

  const exitSession = useCallback(() => dispatch({ type: 'EXIT' }), []);
  const continueSession = useCallback(
    () => dispatch({ type: 'INTENTIONAL_CONTINUE' }),
    [],
  );

  const handleAttempt = useCallback(
    (signals?: Record<string, number | string | boolean>) =>
      onAttemptRef.current?.(signals),
    [],
  );

  // --- Effect A: drive progression while `active`. --------------------------
  // The reducer settles to `completed` on reaching the card-COUNT limit, so a
  // status of `active` here means a card may yet start — UNLESS the duration
  // window has elapsed (the reducer can't see the clock) or the supplied cards
  // ran out. Check both, then either complete or begin the next card.
  useEffect(() => {
    if (state.status !== 'active') return;
    const durationElapsed =
      nowRef.current() - state.startedAtMs >= state.maxDurationMs;
    const outOfCards = state.currentCardIndex >= state.cardIds.length;
    const reachedCount = state.currentCardIndex >= state.maxCards;
    if (durationElapsed || outOfCards || reachedCount) {
      dispatch({ type: 'COMPLETE' });
      return;
    }
    cardActiveAtMsRef.current = nowRef.current();
    dispatch({ type: 'BEGIN_RESOLVE' });
  }, [
    state.status,
    state.currentCardIndex,
    state.startedAtMs,
    state.maxDurationMs,
    state.maxCards,
    state.cardIds.length,
  ]);

  // --- Effect B: fail safe on a missing card / renderer. --------------------
  // A template with no registered renderer (or an unresolvable cardId) must not
  // crash the feed: resolve the card as an error so progression continues.
  useEffect(() => {
    if (state.status !== 'resolving_card') return;
    const cardId = state.cardIds[state.currentCardIndex];
    const card = resolveCardById(cardId);
    const renderer = card ? resolveRenderer(registryRef.current, card) : undefined;
    if (card && renderer) return;
    internalResolve({
      cardId: cardId ?? 'unknown',
      resolutionType: 'incorrect',
      isCorrect: false,
      elapsedMs: 0,
      interactionElapsedMs: 0,
      attemptCount: 0,
      signals: { rendererMissing: true },
    });
  }, [
    state.status,
    state.currentCardIndex,
    state.cardIds,
    resolveCardById,
    internalResolve,
  ]);

  // --- Effect C: the session duration timer. --------------------------------
  // Armed once while the window is open (it does NOT reset on each card flip
  // because `windowOpen` stays true across active <-> resolving_card). If it
  // fires mid-card it force-completes: no new card starts.
  const windowOpen =
    state.status === 'active' || state.status === 'resolving_card';
  useEffect(() => {
    if (!windowOpen) return;
    const remaining =
      state.startedAtMs + state.maxDurationMs - nowRef.current();
    const id = setTimeout(
      () => dispatch({ type: 'COMPLETE' }),
      Math.max(0, remaining),
    );
    return () => clearTimeout(id);
  }, [windowOpen, state.startedAtMs, state.maxDurationMs]);

  // --- Effect D: fire `onSessionCompleted` exactly once per session. --------
  useEffect(() => {
    if (state.status !== 'completed') return;
    if (completedFiredForRef.current === state.sessionId) return;
    completedFiredForRef.current = state.sessionId;
    onSessionCompletedRef.current?.(stateRef.current);
  }, [state.status, state.sessionId]);

  // --- Derive the active card + its rendered element. -----------------------
  const { currentCard, activeCardElement } = useMemo<{
    currentCard: LiquidCard | null;
    activeCardElement: ReactNode | null;
  }>(() => {
    if (state.status !== 'resolving_card') {
      return { currentCard: null, activeCardElement: null };
    }
    const cardId = state.cardIds[state.currentCardIndex];
    const card = resolveCardById(cardId);
    if (!card) return { currentCard: null, activeCardElement: null };
    const Renderer = resolveRenderer(registryRef.current, card);
    if (!Renderer) return { currentCard: card, activeCardElement: null };

    const context: CardStartContext = {
      sessionId: state.sessionId,
      cardIndex: state.currentCardIndex,
      activeAtMs: cardActiveAtMsRef.current,
      // Preview-based offsets are a renderer concern; equal here (§7).
      interactionEnabledAtMs: cardActiveAtMsRef.current,
    };
    // Keyed by session + index so each new card is a fresh mount (per-card
    // renderer timers reset rather than carrying over).
    const element = createElement(Renderer, {
      key: `${state.sessionId}:${state.currentCardIndex}`,
      card,
      context,
      onAttempt: handleAttempt,
      onResolve: resolveActiveCard,
    });
    return { currentCard: card, activeCardElement: element };
  }, [
    state.status,
    state.sessionId,
    state.currentCardIndex,
    state.cardIds,
    resolveCardById,
    handleAttempt,
    resolveActiveCard,
  ]);

  const mode = state.status === 'idle' ? null : state.mode;

  return {
    status: state.status,
    state,
    mode,
    currentCard,
    activeCardElement,
    index: state.currentCardIndex,
    total: state.cardIds.length,
    results: state.results,
    start,
    resolveActiveCard,
    exitSession,
    continueSession,
  };
}
