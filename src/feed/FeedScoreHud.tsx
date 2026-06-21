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

import { useEffect, useRef, useState } from 'react';

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
  // Phase 5 streak flourish: replay a one-shot pulse whenever the streak GROWS
  // (not on reset/decrease). The detection lives in a COMMITTED effect (not a
  // render-phase ref mutation, which double-invokes under React StrictMode and
  // would miss the increase): on each commit we compare the prior streak and, on
  // an increase, bump `pulseKey` — remounting the pill so its one-shot keyframe
  // re-fires for each new link. Visual-only and fully degraded under
  // prefers-reduced-motion (the keyframe duration collapses to ~0).
  const prevStreakRef = useRef(currentStreak);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (currentStreak > prevStreakRef.current) setPulseKey((k) => k + 1);
    prevStreakRef.current = currentStreak;
  }, [currentStreak]);

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
        <span
          // Remount on each increase (the effect bumps `pulseKey`) so the
          // one-shot pulse keyframe replays. The `--pulse` class is applied once
          // an increase has occurred (`pulseKey > 0`); since the keyframe only
          // plays on (re)mount, a rerender WITHOUT an increase keeps the same key
          // → no remount → no replay. So it never pulses on first mount,
          // mount-without-growth, a reset, or a decrease.
          key={pulseKey}
          className={
            pulseKey > 0
              ? 'feed-hud__streak feed-hud__streak--pulse'
              : 'feed-hud__streak'
          }
          data-testid="feed-hud-streak"
        >
          {`🔥 ${currentStreak}`}
        </span>
      ) : null}
    </div>
  );
}
