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
});
