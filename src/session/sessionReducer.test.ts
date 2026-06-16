import { describe, expect, it } from 'vitest';

import { initSession, sessionReducer } from './sessionReducer';
import { MODE_DEFAULTS } from './sessionTypes';
import type { SessionAction, SessionMode, SessionState } from './sessionTypes';
import type { CardResolution } from '../templates/contract';

/**
 * Pure session reducer / state machine (Technical Design §8, Azure DevOps #58).
 *
 * Every assertion below exercises the reducer as a pure function: actions carry
 * any "current time" (`nowMs`) so no test depends on the wall clock, and the
 * reducer must never mutate the state handed to it.
 */

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

/** A minimal-but-real CardResolution. `resolutionType` is the only knob tests
 *  vary; the reducer treats every resolution opaquely (template-agnostic). */
function resolution(
  cardId: string,
  resolutionType: CardResolution['resolutionType'] = 'correct',
): CardResolution {
  return {
    cardId,
    resolutionType,
    isCorrect: resolutionType === 'correct',
    elapsedMs: 1_000,
    interactionElapsedMs: 800,
    attemptCount: 1,
    signals: resolutionType === 'timeout' ? { timedOut: true } : {},
  };
}

function start(
  mode: SessionMode,
  cardIds: string[],
  startedAtMs = 0,
): Extract<SessionAction, { type: 'START_SESSION' }> {
  return { type: 'START_SESSION', sessionId: 'sess-1', mode, cardIds, startedAtMs };
}

/** Arm an active session at index 0 for the given mode. */
function activeSession(
  mode: SessionMode,
  cardIds: string[],
  startedAtMs = 0,
): SessionState {
  return sessionReducer(
    initSession({ sessionId: 'sess-1', mode }),
    start(mode, cardIds, startedAtMs),
  );
}

// ---------------------------------------------------------------------------
// Initial / idle state.
// ---------------------------------------------------------------------------

describe('initSession', () => {
  it('produces an idle state with mode defaults and no clock/id reads', () => {
    const state = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    expect(state).toEqual<SessionState>({
      sessionId: 'sess-1',
      mode: 'one_minute_rescue',
      status: 'idle',
      startedAtMs: 0,
      currentCardIndex: 0,
      cardIds: [],
      results: [],
      maxCards: 3,
      maxDurationMs: 60_000,
    });
  });

  it('applies three_minute_reset defaults', () => {
    const state = initSession({ sessionId: 'sess-2', mode: 'three_minute_reset' });
    expect(state.maxCards).toBe(7);
    expect(state.maxDurationMs).toBe(180_000);
  });
});

describe('MODE_DEFAULTS', () => {
  it('matches the prototype defaults for both modes', () => {
    expect(MODE_DEFAULTS.one_minute_rescue).toEqual({
      maxCards: 3,
      maxDurationMs: 60_000,
    });
    expect(MODE_DEFAULTS.three_minute_reset).toEqual({
      maxCards: 7,
      maxDurationMs: 180_000,
    });
  });

  it('is frozen at the top level and per mode', () => {
    expect(Object.isFrozen(MODE_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(MODE_DEFAULTS.one_minute_rescue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// START_SESSION: idle -> active.
// ---------------------------------------------------------------------------

describe('START_SESSION', () => {
  it('takes idle -> active at index 0 with the action payload applied', () => {
    const idle = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    const state = sessionReducer(idle, start('one_minute_rescue', ['a', 'b', 'c'], 5_000));
    expect(state.status).toBe('active');
    expect(state.currentCardIndex).toBe(0);
    expect(state.cardIds).toEqual(['a', 'b', 'c']);
    expect(state.startedAtMs).toBe(5_000);
    expect(state.results).toEqual([]);
  });

  it('derives maxCards/maxDurationMs from the action mode, overriding the idle default', () => {
    const idle = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    const state = sessionReducer(idle, start('three_minute_reset', ['a'], 0));
    expect(state.mode).toBe('three_minute_reset');
    expect(state.maxCards).toBe(7);
    expect(state.maxDurationMs).toBe(180_000);
  });

  it('is a no-op when the session is already active (illegal transition)', () => {
    const active = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    const result = sessionReducer(active, start('one_minute_rescue', ['x'], 999));
    expect(result).toBe(active);
  });
});

// ---------------------------------------------------------------------------
// Happy path: resolve through to `completed` at maxCards.
// ---------------------------------------------------------------------------

describe('happy path through to completed (card limit)', () => {
  it('one_minute_rescue completes after 3 cards', () => {
    let state = activeSession('one_minute_rescue', ['a', 'b', 'c']);

    // Card 1.
    state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    expect(state.status).toBe('resolving_card');
    state = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('a'),
      nowMs: 1_000,
    });
    expect(state.status).toBe('active');
    expect(state.currentCardIndex).toBe(1);

    // Card 2.
    state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    state = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('b'),
      nowMs: 2_000,
    });
    expect(state.status).toBe('active');
    expect(state.currentCardIndex).toBe(2);

    // Card 3 -> reaches maxCards -> completed.
    state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    state = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('c'),
      nowMs: 3_000,
    });
    expect(state.status).toBe('completed');
    expect(state.currentCardIndex).toBe(3);
    expect(state.results.map((r) => r.cardId)).toEqual(['a', 'b', 'c']);
  });

  it('three_minute_reset completes after 7 cards', () => {
    const cardIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let state = activeSession('three_minute_reset', cardIds);
    cardIds.forEach((id, i) => {
      state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
      state = sessionReducer(state, {
        type: 'RESOLVE_CARD',
        resolution: resolution(id),
        nowMs: (i + 1) * 1_000,
      });
    });
    expect(state.status).toBe('completed');
    expect(state.currentCardIndex).toBe(7);
    expect(state.results).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Completion by DURATION.
// ---------------------------------------------------------------------------

describe('completion by duration', () => {
  it('records the in-flight resolution but blocks a new card once the duration limit elapses', () => {
    // Started at 0; one_minute_rescue duration limit is 60_000 ms, card limit 3.
    let state = activeSession('one_minute_rescue', ['a', 'b', 'c']);

    // First card resolves well within the window -> back to active.
    state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    state = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('a'),
      nowMs: 30_000,
    });
    expect(state.status).toBe('active');
    expect(state.currentCardIndex).toBe(1);

    // Second card is in progress when the clock crosses the duration limit.
    // The resolution is STILL recorded, but no new card may start -> completed,
    // even though only 2 of 3 cards have been played.
    state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    state = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('b', 'timeout'),
      nowMs: 60_000,
    });
    expect(state.status).toBe('completed');
    expect(state.currentCardIndex).toBe(2);
    expect(state.results.map((r) => r.cardId)).toEqual(['a', 'b']);
    expect(state.results[1].resolutionType).toBe('timeout');
  });

  it('treats the duration limit as inclusive (>=)', () => {
    const state = activeSession('three_minute_reset', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const begun = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    const resolved = sessionReducer(begun, {
      type: 'RESOLVE_CARD',
      resolution: resolution('a'),
      nowMs: 180_000, // exactly the limit
    });
    expect(resolved.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// BEGIN_RESOLVE / EXIT / COMPLETE / illegal transitions.
// ---------------------------------------------------------------------------

describe('BEGIN_RESOLVE', () => {
  it('takes active -> resolving_card', () => {
    const state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    expect(sessionReducer(state, { type: 'BEGIN_RESOLVE' }).status).toBe('resolving_card');
  });

  it('is a no-op when not active', () => {
    const idle = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    expect(sessionReducer(idle, { type: 'BEGIN_RESOLVE' })).toBe(idle);
  });

  it('is a no-op from completed (no new card starts after the card limit)', () => {
    // Build the completed state via the normal reducer path: run a full
    // one_minute_rescue session (3 cards) to completion.
    let state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    ['a', 'b', 'c'].forEach((id, i) => {
      state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
      state = sessionReducer(state, {
        type: 'RESOLVE_CARD',
        resolution: resolution(id),
        nowMs: (i + 1) * 1_000,
      });
    });
    expect(state.status).toBe('completed');

    // BEGIN_RESOLVE from completed must not arm another card: same reference,
    // status stays 'completed'.
    const result = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    expect(result).toBe(state);
    expect(result.status).toBe('completed');
  });
});

describe('EXIT', () => {
  it('takes active -> exited', () => {
    const state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    expect(sessionReducer(state, { type: 'EXIT' }).status).toBe('exited');
  });

  it('is an idempotent no-op once already exited', () => {
    const exited = sessionReducer(
      activeSession('one_minute_rescue', ['a']),
      { type: 'EXIT' },
    );
    expect(sessionReducer(exited, { type: 'EXIT' })).toBe(exited);
  });
});

describe('COMPLETE', () => {
  it('force-completes an active session', () => {
    const state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    expect(sessionReducer(state, { type: 'COMPLETE' }).status).toBe('completed');
  });

  it('is a no-op from idle', () => {
    const idle = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    expect(sessionReducer(idle, { type: 'COMPLETE' })).toBe(idle);
  });
});

describe('illegal / no-op transitions', () => {
  it('RESOLVE_CARD is ignored when no card is live (e.g. completed)', () => {
    let state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    state = sessionReducer(state, { type: 'COMPLETE' });
    const result = sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('x'),
      nowMs: 1_000,
    });
    expect(result).toBe(state);
  });

  it('RESOLVE_CARD is ignored from idle', () => {
    const idle = initSession({ sessionId: 'sess-1', mode: 'one_minute_rescue' });
    const result = sessionReducer(idle, {
      type: 'RESOLVE_CARD',
      resolution: resolution('x'),
      nowMs: 1,
    });
    expect(result).toBe(idle);
  });

  it('INTENTIONAL_CONTINUE is ignored when not completed', () => {
    const active = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    expect(sessionReducer(active, { type: 'INTENTIONAL_CONTINUE' })).toBe(active);
  });
});

// ---------------------------------------------------------------------------
// completed -> intentional_continue -> active.
// ---------------------------------------------------------------------------

describe('intentional continue', () => {
  function completedSession(): SessionState {
    let state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    ['a', 'b', 'c'].forEach((id, i) => {
      state = sessionReducer(state, { type: 'BEGIN_RESOLVE' });
      state = sessionReducer(state, {
        type: 'RESOLVE_CARD',
        resolution: resolution(id),
        nowMs: (i + 1) * 1_000,
      });
    });
    return state;
  }

  it('takes completed -> intentional_continue, then START_SESSION -> active with a fresh window', () => {
    const completed = completedSession();
    expect(completed.status).toBe('completed');

    const continuing = sessionReducer(completed, { type: 'INTENTIONAL_CONTINUE' });
    expect(continuing.status).toBe('intentional_continue');

    // The intentional_continue -> active hop is the card-arming START_SESSION.
    const resumed = sessionReducer(
      continuing,
      start('one_minute_rescue', ['d', 'e', 'f'], 90_000),
    );
    expect(resumed.status).toBe('active');
    expect(resumed.currentCardIndex).toBe(0);
    expect(resumed.cardIds).toEqual(['d', 'e', 'f']);
    expect(resumed.results).toEqual([]);
    expect(resumed.startedAtMs).toBe(90_000);
  });
});

// ---------------------------------------------------------------------------
// Purity: determinism + no input mutation.
// ---------------------------------------------------------------------------

describe('reducer purity', () => {
  it('returns deep-equal output for identical inputs (deterministic)', () => {
    const a = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    const b = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    const action: SessionAction = {
      type: 'RESOLVE_CARD',
      resolution: resolution('a'),
      nowMs: 1_234,
    };
    expect(sessionReducer(a, action)).toEqual(sessionReducer(b, action));
  });

  it('does not mutate the input state', () => {
    const state = activeSession('one_minute_rescue', ['a', 'b', 'c']);
    const snapshot = structuredClone(state);
    sessionReducer(state, {
      type: 'RESOLVE_CARD',
      resolution: resolution('a'),
      nowMs: 1_000,
    });
    sessionReducer(state, { type: 'BEGIN_RESOLVE' });
    sessionReducer(state, { type: 'EXIT' });
    expect(state).toEqual(snapshot);
    expect(state.results).toHaveLength(0);
  });
});
