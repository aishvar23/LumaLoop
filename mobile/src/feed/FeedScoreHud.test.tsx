/**
 * Tests for the RN feed game-points HUD (Phase 4). Asserts points always show,
 * the streak only once a streak builds, and GAME-POINTS copy (no ability/IQ/trait).
 *
 * The HUD is decorative chrome hidden from the a11y tree (its numbers are mirrored
 * by no spoken label — the swipe surface owns navigation), so queries opt into
 * hidden elements to inspect what is rendered on screen.
 */

import { render, screen } from '@testing-library/react-native';

import FeedScoreHud from './FeedScoreHud';

const opts = { includeHiddenElements: true } as const;

describe('FeedScoreHud (RN)', () => {
  it('always shows the points readout', () => {
    render(<FeedScoreHud totalPoints={350} currentStreak={0} topInset={0} />);
    expect(screen.getByTestId('feed-hud-points', opts)).toBeTruthy();
    expect(screen.getByText('350', opts)).toBeTruthy();
    expect(screen.getByText('pts', opts)).toBeTruthy();
  });

  it('hides the streak pill at streak 0', () => {
    render(<FeedScoreHud totalPoints={0} currentStreak={0} topInset={0} />);
    expect(screen.queryByTestId('feed-hud-streak', opts)).toBeNull();
  });

  it('shows the streak pill once a streak builds', () => {
    render(<FeedScoreHud totalPoints={500} currentStreak={4} topInset={0} />);
    expect(screen.getByTestId('feed-hud-streak', opts)).toBeTruthy();
  });
});
