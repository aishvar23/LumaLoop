/**
 * Feed game-points HUD (Phase 4 — GAME POINTS).
 *
 * A small, persistent, unobtrusive overlay on the feed showing the running total
 * points and current streak. Pinned top-right, clear of the safe-area inset, and
 * non-interactive (it never intercepts a swipe). GAME language only — "pts",
 * "streak" — never skill/ability/IQ/trait framing (Design §7/§21.8).
 *
 * Colour is never the sole carrier of meaning: the numbers + labels carry it. The
 * streak pill only appears once a streak is building (≥1) so the HUD stays quiet
 * at rest. An accessible live region announces the total as it changes (polite).
 */

import './FeedScoreHud.css';

export type FeedScoreHudProps = {
  /** Total points earned this feed visit. */
  totalPoints: number;
  /** Current consecutive-correct streak. */
  currentStreak: number;
};

export default function FeedScoreHud({
  totalPoints,
  currentStreak,
}: FeedScoreHudProps) {
  return (
    <div
      className="feed-hud"
      data-testid="feed-hud"
      // Decorative chrome over the feed; the live region below carries the spoken
      // update so assistive tech is not spammed by every layout node.
      aria-hidden="true"
    >
      <span className="feed-hud__points" data-testid="feed-hud-points">
        <span className="feed-hud__points-value">{totalPoints}</span>
        <span className="feed-hud__label">pts</span>
      </span>
      {currentStreak >= 1 ? (
        <span className="feed-hud__streak" data-testid="feed-hud-streak">
          {`🔥 ${currentStreak}`}
        </span>
      ) : null}
    </div>
  );
}
