import { formatRelativeTime } from './relativeTime';

const NOW = Date.parse('2026-06-21T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('returns "just now" for under a minute', () => {
    expect(formatRelativeTime('2026-06-21T11:59:30.000Z', NOW)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime('2026-06-21T11:55:00.000Z', NOW)).toBe('5m');
  });

  it('formats hours', () => {
    expect(formatRelativeTime('2026-06-21T09:00:00.000Z', NOW)).toBe('3h');
  });

  it('formats days', () => {
    expect(formatRelativeTime('2026-06-19T12:00:00.000Z', NOW)).toBe('2d');
  });

  it('formats weeks', () => {
    expect(formatRelativeTime('2026-06-07T12:00:00.000Z', NOW)).toBe('2w');
  });

  it('falls back to a short date for older comments', () => {
    const out = formatRelativeTime('2026-01-05T12:00:00.000Z', NOW);
    expect(out).not.toBe('');
    expect(out).not.toContain('w');
  });

  it('returns "" for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});
