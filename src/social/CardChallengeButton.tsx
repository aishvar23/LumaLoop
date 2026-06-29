/**
 * "Challenge a friend" button for the in-feed result step (engagement strategy
 * §4.6). Sits NEXT TO the share-to-status button in {@link CardFeedback}'s footer
 * and opens the viral "beat my score" loop: it shares a public
 * `<origin>/c/<cardId>?s=<points>` link with guardrail-safe text via the native
 * share sheet, falling back to a clipboard copy (with a transient "Link copied!"
 * hint). Distinct intent from {@link CardShareButton} (post to your status):
 * this INVITES a friend to beat your score.
 *
 * Auth-free and engine-agnostic: it needs only the cardId + the points the
 * player just earned, so it renders standalone with no social provider. Copy is
 * game framing only (Design §7) — no IQ / skill / ability / assessment language.
 */
import { useState } from 'react';

import {
  buildChallengeUrl,
  challengeShareText,
} from './challengeLink';
import { shareChallengeLink } from './shareChallenge';
import './CardChallengeButton.css';

export interface CardChallengeButtonProps {
  /** The card that was just played. */
  cardId: string;
  /** The GAME-points the player earned (drives the "beat me" score). */
  points: number;
}

export default function CardChallengeButton({ cardId, points }: CardChallengeButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleChallenge() {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const url = buildChallengeUrl({ cardId, points, origin });
    const result = await shareChallengeLink(url, challengeShareText(points));
    if (result === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      className="card-challenge"
      data-testid="card-challenge"
      onClick={handleChallenge}
      aria-label="Challenge a friend to beat your score"
    >
      {copied ? '✓ Link copied!' : '⚔ Challenge a friend'}
    </button>
  );
}
