/**
 * Pure session reducer + state factory (Technical Design §8).
 *
 * PURITY CONTRACT (critical, CLAUDE.md §3/§4): this reducer is pure and
 * deterministic. It never calls `Date.now()` / `Math.random()` and never
 * generates ids. The only "current time" it uses — for the duration-based
 * completion check — arrives on the action payload (`RESOLVE_CARD.nowMs`).
 * Id/cardId generation and clock reads are the caller's job (the controller,
 * a later task), and are passed in. The reducer never mutates its inputs; it
 * returns the same reference unchanged for illegal/no-op transitions and a
 * fresh object for every real transition.
 *
 * TEMPLATE-AGNOSTIC (CLAUDE.md §4/§6): the reducer knows only `cardIds` and the
 * shared `CardResolution` contract — never card configs, renderers, evaluators,
 * or telemetry.
 *
 * Transitions (Technical Design §8):
 *   idle -> active -> resolving_card -> active -> completed -> exited
 *   completed -> intentional_continue -> active
 */

import { MODE_DEFAULTS } from './sessionTypes';
import type {
  ModeLimits,
  SessionAction,
  SessionMode,
  SessionState,
} from './sessionTypes';

/** Exhaustiveness guard for the action union — proves every case is handled. */
function assertNever(value: never): never {
  throw new Error(
    `sessionReducer: unhandled action ${JSON.stringify(value)}`,
  );
}

/**
 * The completion predicate (Technical Design §8). A session is over when the
 * card limit is reached OR the duration limit has elapsed:
 *
 *   currentCardIndex >= maxCards   OR   nowMs - startedAtMs >= maxDurationMs
 *
 * `nowMs` is injected by the caller so this stays pure and testable.
 */
function isSessionOver(
  state: Pick<
    SessionState,
    'currentCardIndex' | 'maxCards' | 'startedAtMs' | 'maxDurationMs'
  >,
  nowMs: number,
): boolean {
  const cardLimitReached = state.currentCardIndex >= state.maxCards;
  const durationElapsed = nowMs - state.startedAtMs >= state.maxDurationMs;
  return cardLimitReached || durationElapsed;
}

function limitsFor(mode: SessionMode): ModeLimits {
  return MODE_DEFAULTS[mode];
}

/**
 * Build the initial `idle` session state. No clock read and no id generation
 * here — `sessionId` is supplied by the caller. `startedAtMs` stays 0 until a
 * START_SESSION action arms the active window with a real clock value.
 */
export function initSession(params: {
  sessionId: string;
  mode: SessionMode;
}): SessionState {
  const { maxCards, maxDurationMs } = limitsFor(params.mode);
  return {
    sessionId: params.sessionId,
    mode: params.mode,
    status: 'idle',
    startedAtMs: 0,
    currentCardIndex: 0,
    cardIds: [],
    results: [],
    maxCards,
    maxDurationMs,
  };
}

/**
 * Pure reducer. Returns `state` unchanged for any transition not legal from the
 * current `status` (the illegal-transition no-op is explicit and tested).
 */
export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'START_SESSION': {
      // Arm (or re-arm after an intentional continue) the active window.
      // Legal only from `idle` or `intentional_continue`; ignored otherwise.
      if (state.status !== 'idle' && state.status !== 'intentional_continue') {
        return state;
      }
      const { maxCards, maxDurationMs } = limitsFor(action.mode);
      return {
        ...state,
        sessionId: action.sessionId,
        mode: action.mode,
        status: 'active',
        startedAtMs: action.startedAtMs,
        currentCardIndex: 0,
        cardIds: action.cardIds,
        results: [],
        maxCards,
        maxDurationMs,
      };
    }

    case 'BEGIN_RESOLVE': {
      // A card moves into play. Legal only from `active`; in particular the
      // `completed` no-op enforces the card-COUNT limit (no new card starts
      // once maxCards is reached).
      //
      // DURATION-LIMIT CAVEAT (Technical Design §8): BEGIN_RESOLVE carries no
      // `nowMs`, so the reducer CANNOT stop a new card from starting after the
      // duration window has elapsed — it only enforces the card-count limit.
      // The controller (Azure DevOps #59) MUST check the clock before
      // dispatching BEGIN_RESOLVE, or dispatch COMPLETE on timer expiry, to
      // honor the duration limit.
      if (state.status !== 'active') {
        return state;
      }
      return { ...state, status: 'resolving_card' };
    }

    case 'RESOLVE_CARD': {
      // A card resolves. Legal only while a card is live (`active` or
      // `resolving_card`); any other status is a no-op.
      if (state.status !== 'active' && state.status !== 'resolving_card') {
        return state;
      }
      // RESOLVE_CARD ALWAYS records the in-flight resolution and advances the
      // index — a card already in progress may finish.
      const nextIndex = state.currentCardIndex + 1;
      const advanced: SessionState = {
        ...state,
        currentCardIndex: nextIndex,
        results: [...state.results, action.resolution],
      };
      // ...but NO new card may start once a limit is reached: after recording,
      // settle to `completed` instead of `active`.
      return {
        ...advanced,
        status: isSessionOver(advanced, action.nowMs) ? 'completed' : 'active',
      };
    }

    case 'COMPLETE': {
      // Force-complete the live window. Legal from `active` / `resolving_card`.
      if (state.status !== 'active' && state.status !== 'resolving_card') {
        return state;
      }
      return { ...state, status: 'completed' };
    }

    case 'EXIT': {
      // The user leaves. Terminal; idempotent no-op once already `exited`.
      if (state.status === 'exited') {
        return state;
      }
      return { ...state, status: 'exited' };
    }

    case 'INTENTIONAL_CONTINUE': {
      // The user chose to keep playing after finishing. Legal only from
      // `completed`. Re-arming with fresh cards is a subsequent START_SESSION.
      if (state.status !== 'completed') {
        return state;
      }
      return { ...state, status: 'intentional_continue' };
    }

    default:
      return assertNever(action);
  }
}
