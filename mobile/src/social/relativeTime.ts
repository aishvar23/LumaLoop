/**
 * Pure, dependency-free relative-time formatter for comment timestamps
 * ("just now", "5m", "3h", "2d", "4w", "Jan 5"). Compact, locale-light, and
 * tolerant of bad input (returns '' for an unparseable timestamp) so the UI
 * never crashes on a malformed `created_at`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Format an ISO timestamp relative to `nowMs` (defaults to `Date.now()`).
 * Returns '' when `iso` cannot be parsed.
 */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = nowMs - then;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  if (diff < 4 * WEEK) return `${Math.floor(diff / WEEK)}w`;
  // Older than ~a month: show an absolute, year-agnostic short date.
  try {
    return new Date(then).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
