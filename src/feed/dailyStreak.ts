/**
 * Pure daily-streak core (engagement — the consecutive-days-played habit loop).
 *
 * SOURCE OF TRUTH for the streak layer. This module is the web copy;
 * `mobile/src/core/feed/dailyStreak.ts` is a byte-faithful port (header-only
 * diff). It folds "the player recorded a play today" into a small, serializable
 * {@link StreakState} — a current consecutive-days count, an all-time longest,
 * and the last local play date. It is PURE (no clock, no storage): the caller
 * supplies today's local date string, so the same input always yields the same
 * output and the logic is trivially testable.
 *
 * ── POSITIONING GUARDRAIL (Design §7 / §21.8) ────────────────────────────────
 * This is a GAME engagement counter — "days played in a row". It is NOT a skill
 * / ability / IQ / performance measure and MUST NEVER be presented as one, and
 * carries NO shame/loss framing. Missing a day simply restarts the count at 1.
 *
 * NO PII (Technical Design §16): the persisted shape is two non-negative
 * integers and one local calendar date ('YYYY-MM-DD'). No identifiers, no times.
 */

/** The serializable streak snapshot. */
export type StreakState = {
  /** Consecutive days played, including today once a play is recorded. */
  current: number;
  /** All-time longest streak. */
  longest: number;
  /** The last local date a play was recorded, 'YYYY-MM-DD', or null. */
  lastPlayedDate: string | null;
};

/** A zeroed snapshot — also the fallback when storage is empty/unavailable. */
export const INITIAL_STREAK_STATE: StreakState = {
  current: 0,
  longest: 0,
  lastPlayedDate: null,
};

/** Zero-pad a number to two digits ('5' → '05'). */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format a Date as a local 'YYYY-MM-DD' (local calendar day, not UTC). */
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

/** Parse a 'YYYY-MM-DD' string to a local-midnight Date. */
function parseLocalIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
}

/** One calendar day, in milliseconds. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when `todayIso` is exactly one calendar day after `previousIso` (both
 * 'YYYY-MM-DD'). Compares local-midnight dates so DST shifts never miscount.
 */
function isNextDay(previousIso: string, todayIso: string): boolean {
  const previous = parseLocalIsoDate(previousIso);
  const today = parseLocalIsoDate(todayIso);
  const diffMs = today.getTime() - previous.getTime();
  // Round to whole days so a DST-induced ±1h offset still reads as exactly 1 day.
  return Math.round(diffMs / ONE_DAY_MS) === 1;
}

/**
 * Fold "played on `todayIso`" into the streak. Pure.
 *
 * - Same day as `lastPlayedDate` → unchanged (idempotent per day).
 * - Exactly the day after → `current + 1`.
 * - Otherwise (a gap, or the first ever play) → `current` resets to 1.
 *
 * `longest` becomes `max(longest, current)`; `lastPlayedDate` becomes `todayIso`.
 */
export function recordPlay(state: StreakState, todayIso: string): StreakState {
  if (state.lastPlayedDate === todayIso) {
    // Already counted today — nothing changes.
    return state;
  }
  const current =
    state.lastPlayedDate !== null && isNextDay(state.lastPlayedDate, todayIso)
      ? state.current + 1
      : 1;
  return {
    current,
    longest: Math.max(state.longest, current),
    lastPlayedDate: todayIso,
  };
}
