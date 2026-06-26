/**
 * Share-to-status button for the in-feed result step (accounts pivot).
 *
 * Rendered by the feedback gate inside {@link CardFeedback}'s footer slot, so it
 * appears right after a game RESOLVES (you "played it"). It captures the game +
 * the player's result (outcome + points) and posts an ephemeral 24h "status"
 * share via {@link shareGame}. A FEED-LAYER social concern keyed by `cardId`
 * (CLAUDE.md §4/§6): it reads the {@link useSocialConfig} client + userId and,
 * when there is no social config or no signed-in user, renders NOTHING — so the
 * engine/result card stay auth-free and standalone tests are unaffected.
 *
 * Copy is guardrail-safe (Design §7): plain "share this game", no ability/IQ
 * framing.
 */
import { useState } from 'react';

import { useSocialConfig } from './SocialContext';
import { shareGame } from './gameShareApi';
import type { ShareOutcome } from './statusFeed';
import './CardShareButton.css';

export interface CardShareButtonProps {
  /** The card that was just played. */
  cardId: string;
  /** The resolution outcome to record with the share. */
  outcome: ShareOutcome;
  /** The GAME-points earned (0 when none / a miss). */
  points: number;
}

type ShareState = 'idle' | 'sharing' | 'shared' | 'error';

export default function CardShareButton({ cardId, outcome, points }: CardShareButtonProps) {
  const config = useSocialConfig();
  const [state, setState] = useState<ShareState>('idle');

  // No social config or signed-out → render nothing (engine stays auth-free).
  if (!config || !config.userId) return null;
  const { client, userId } = config;

  async function handleShare() {
    if (state === 'sharing' || state === 'shared') return;
    setState('sharing');
    const { ok } = await shareGame(client, { userId, cardId, outcome, points });
    setState(ok ? 'shared' : 'error');
  }

  const label =
    state === 'shared'
      ? '✓ Shared to your status'
      : state === 'sharing'
        ? 'Sharing…'
        : state === 'error'
          ? '↗ Tap to retry'
          : '↗ Share this game';

  return (
    <button
      type="button"
      className="card-share"
      data-testid="card-share"
      data-state={state}
      onClick={handleShare}
      disabled={state === 'sharing' || state === 'shared'}
      aria-label={
        state === 'shared'
          ? 'Shared to your status'
          : 'Share this game to your status'
      }
    >
      {label}
    </button>
  );
}
