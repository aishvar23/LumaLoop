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

  // Phase 5: the streak flourish runs a one-shot pulse on each increase. The pulse
  // is presentational (an Animated transform), so these assert the logic path is
  // robust — the pill keeps rendering correctly across increases, resets, and
  // decreases without throwing.
  it('updates the streak pill across increases (flourish path)', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={100} currentStreak={1} topInset={0} />,
    );
    expect(screen.getByText('🔥 1', opts)).toBeTruthy();
    rerender(<FeedScoreHud totalPoints={150} currentStreak={2} topInset={0} />);
    expect(screen.getByText('🔥 2', opts)).toBeTruthy();
    rerender(<FeedScoreHud totalPoints={210} currentStreak={3} topInset={0} />);
    expect(screen.getByText('🔥 3', opts)).toBeTruthy();
  });

  it('hides the streak pill on a reset to 0', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={210} currentStreak={3} topInset={0} />,
    );
    rerender(<FeedScoreHud totalPoints={210} currentStreak={0} topInset={0} />);
    expect(screen.queryByTestId('feed-hud-streak', opts)).toBeNull();
  });

  it('keeps rendering the pill on a decrease (no pulse, no error)', () => {
    const { rerender } = render(
      <FeedScoreHud totalPoints={260} currentStreak={5} topInset={0} />,
    );
    // A decrease that stays ≥1: the pill persists and the flourish does not fire.
    rerender(<FeedScoreHud totalPoints={260} currentStreak={4} topInset={0} />);
    expect(screen.getByText('🔥 4', opts)).toBeTruthy();
  });
});
