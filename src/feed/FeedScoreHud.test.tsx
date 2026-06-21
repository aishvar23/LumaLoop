/**
 * Tests for the feed game-points HUD (Phase 4). Asserts it shows points always,
 * the streak only once a streak builds, and uses GAME-POINTS copy (no ability /
 * trait / IQ language).
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FeedScoreHud from './FeedScoreHud';

describe('FeedScoreHud', () => {
  it('always shows the points readout', () => {
    render(<FeedScoreHud totalPoints={350} currentStreak={0} />);
    expect(screen.getByTestId('feed-hud-points')).toHaveTextContent('350');
    expect(screen.getByTestId('feed-hud-points')).toHaveTextContent('pts');
  });

  it('hides the streak pill at streak 0', () => {
    render(<FeedScoreHud totalPoints={0} currentStreak={0} />);
    expect(screen.queryByTestId('feed-hud-streak')).not.toBeInTheDocument();
  });

  it('shows the streak pill once a streak builds', () => {
    render(<FeedScoreHud totalPoints={500} currentStreak={4} />);
    expect(screen.getByTestId('feed-hud-streak')).toHaveTextContent('4');
  });

  it('uses GAME-POINTS copy only (no ability/IQ/trait language)', () => {
    const { container } = render(
      <FeedScoreHud totalPoints={500} currentStreak={4} />,
    );
    const text = container.textContent ?? '';
    for (const banned of ['IQ', 'ability', 'skill', 'trait', 'brain', 'intelligence']) {
      expect(text.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  // ── Phase 5: streak flourish (the one piece with real logic) ────────────────
  //
  // The flourish replays a one-shot keyframe by REMOUNTING the pill (a bumped
  // `key`) on each streak INCREASE — detected in a committed effect so it is
  // StrictMode-safe. A pulse therefore == a remount, asserted via element
  // identity; the `--pulse` class merely arms the keyframe once a pulse has ever
  // fired (it never fires on mount-without-growth, reset, or decrease).

  it('does NOT pulse on initial mount (no growth yet)', () => {
    render(<FeedScoreHud totalPoints={120} currentStreak={3} />);
    expect(screen.getByTestId('feed-hud-streak').className).not.toContain(
      'feed-hud__streak--pulse',
    );
  });

  it('pulses the streak pill when the streak INCREASES (remount + class)', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={100} currentStreak={2} />,
    );
    const before = screen.getByTestId('feed-hud-streak');
    rerender(<FeedScoreHud totalPoints={140} currentStreak={3} />);
    const after = screen.getByTestId('feed-hud-streak');
    // The increase remounts the pill (new key) so the keyframe replays...
    expect(after).not.toBe(before);
    // ...and the class is now armed.
    expect(after.className).toContain('feed-hud__streak--pulse');
  });

  it('does NOT remount/pulse afresh when the streak resets or decreases', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={140} currentStreak={3} />,
    );
    // A miss drops the streak to 0 → the pill disappears (no pulse).
    rerender(<FeedScoreHud totalPoints={140} currentStreak={0} />);
    expect(screen.queryByTestId('feed-hud-streak')).not.toBeInTheDocument();

    // Build a fresh streak of 5 (an increase from 0) → one pulse/remount.
    rerender(<FeedScoreHud totalPoints={200} currentStreak={5} />);
    const atFive = screen.getByTestId('feed-hud-streak');
    // A decrease (without going through 0) must NOT remount the pill again.
    rerender(<FeedScoreHud totalPoints={200} currentStreak={4} />);
    expect(screen.getByTestId('feed-hud-streak')).toBe(atFive);
  });

  it('re-fires the pulse on each successive increase (remounts via key)', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={100} currentStreak={1} />,
    );
    rerender(<FeedScoreHud totalPoints={140} currentStreak={2} />);
    const first = screen.getByTestId('feed-hud-streak');
    expect(first.className).toContain('feed-hud__streak--pulse');
    rerender(<FeedScoreHud totalPoints={190} currentStreak={3} />);
    const second = screen.getByTestId('feed-hud-streak');
    expect(second.className).toContain('feed-hud__streak--pulse');
    // The element was remounted (new key) so the one-shot keyframe replays.
    expect(second).not.toBe(first);
  });
});
