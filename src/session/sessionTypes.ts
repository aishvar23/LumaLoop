/**
 * Session state machine — types, mode defaults, and action union
 * (Technical Design §8).
 *
 * This module is template-agnostic by design (CLAUDE.md §4/§6): the session
 * only ever knows `cardIds` and the shared `CardResolution` contract. It must
 * never import card configs, renderers, evaluators, or telemetry. Controllers
 * own progression; renderers own card interaction.
 *
 * The reducer that consumes these types (`sessionReducer.ts`) is pure and
 * deterministic: it never reads the clock or generates ids. Any "current time"
 * needed for the duration-based completion check arrives on the action payload
 * (`nowMs`); id/cardId generation and clock reads happen in the caller.
 */

import type { CardResolution } from '../templates/contract';

/** The two prototype session lengths (Technical Design §8). */
export type SessionMode = 'one_minute_rescue' | 'three_minute_reset';

/**
 * Lifecycle status of a session.
 *
 * Transitions (Technical Design §8):
 *   idle -> active -> resolving_card -> active -> completed -> exited
 *   completed -> intentional_continue -> active
 */
export type SessionStatus =
  | 'idle'
  | 'active'
  | 'resolving_card'
  | 'completed'
  | 'exited'
  | 'intentional_continue';

/**
 * The full, serializable session state. Within one active window
 * `results.length` equals `currentCardIndex`: each recorded resolution
 * advances the index by one.
 */
export type SessionState = {
  sessionId: string;
  mode: SessionMode;
  status: SessionStatus;
  startedAtMs: number;
  currentCardIndex: number;
  cardIds: string[];
  results: CardResolution[];
  maxCards: number;
  maxDurationMs: number;
};

/** Per-mode limits. A session ends at whichever limit is hit first (§8). */
export type ModeLimits = {
  maxCards: number;
  maxDurationMs: number;
};

/**
 * Prototype defaults (Technical Design §8):
 *   one_minute_rescue:  3 cards or 60 seconds
 *   three_minute_reset: 7 cards or 180 seconds
 *
 * Frozen so this source-of-truth cannot be mutated at runtime. `satisfies`
 * keeps the literal checked against the contract while preserving the type.
 */
export const MODE_DEFAULTS: Readonly<Record<SessionMode, ModeLimits>> =
  Object.freeze({
    one_minute_rescue: Object.freeze({ maxCards: 3, maxDurationMs: 60_000 }),
    three_minute_reset: Object.freeze({ maxCards: 7, maxDurationMs: 180_000 }),
  }) satisfies Readonly<Record<SessionMode, ModeLimits>>;

/**
 * Human-readable label for each session mode (Design §8.1). Single source of
 * truth so the start-screen choice and any downstream surface (in-session,
 * receipt) can never show divergent copy for the same mode.
 */
export const MODE_LABELS: Readonly<Record<SessionMode, string>> = Object.freeze({
  one_minute_rescue: '1-minute rescue',
  three_minute_reset: '3-minute reset',
});

/**
 * Actions the reducer understands (typed discriminated union — no
 * `Record<string, unknown>`). Clock reads and id generation happen in the
 * caller; the reducer only consumes the values handed to it.
 *
 * - START_SESSION         arms/re-arms an active window from `idle` or
 *                         `intentional_continue`: sets cardIds, mode (and the
 *                         derived maxCards/maxDurationMs), startedAtMs;
 *                         currentCardIndex 0; results []; status `active`.
 * - BEGIN_RESOLVE         `active` -> `resolving_card` (a card is being played).
 * - RESOLVE_CARD          records a `CardResolution` and advances the index;
 *                         then -> `active` for the next card, or `completed`
 *                         if a session limit is reached. `nowMs` drives the
 *                         duration check (see completion rules in the reducer).
 * - COMPLETE              force-completes the active window -> `completed`.
 * - EXIT                  user leaves -> `exited` (terminal).
 * - INTENTIONAL_CONTINUE  `completed` -> `intentional_continue`: the user chose
 *                         to keep playing. Re-arming with fresh cards is then a
 *                         START_SESSION (the only card-arming action), which
 *                         realizes the `intentional_continue -> active` hop.
 */
export type SessionAction =
  | {
      type: 'START_SESSION';
      sessionId: string;
      mode: SessionMode;
      cardIds: string[];
      startedAtMs: number;
    }
  | { type: 'BEGIN_RESOLVE' }
  | { type: 'RESOLVE_CARD'; resolution: CardResolution; nowMs: number }
  | { type: 'COMPLETE' }
  | { type: 'EXIT' }
  | { type: 'INTENTIONAL_CONTINUE' };
