/**
 * Share-to-status button for the in-feed result step (accounts pivot) — React
 * Native counterpart of web `src/social/CardShareButton.tsx`.
 *
 * Rendered by the feedback gate inside {@link CardFeedback}'s footer slot, so it
 * appears right after a game RESOLVES. It captures the game + the player's result
 * (outcome + points) and posts an ephemeral 24h "status" share via
 * {@link shareGame}. A FEED-LAYER social concern keyed by `cardId` (CLAUDE.md
 * §4/§6): reads {@link useSocialConfig}; with no config / no signed-in user it
 * renders NOTHING, so the engine/result card stay auth-free.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSocialConfig } from './SocialContext';
import { shareGame } from './gameShareApi';
import type { ShareOutcome } from './statusFeed';
import { colors, fontSize, fontWeight, radius, space } from '../feed/templates/tokens';

export interface CardShareButtonProps {
  cardId: string;
  outcome: ShareOutcome;
  points: number;
}

type ShareState = 'idle' | 'sharing' | 'shared' | 'error';

export default function CardShareButton({ cardId, outcome, points }: CardShareButtonProps) {
  const config = useSocialConfig();
  const [state, setState] = useState<ShareState>('idle');

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
          : '↗ Share to your status';

  const done = state === 'shared';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={done ? 'Shared to your status' : 'Share this game to your status'}
      accessibilityState={{ disabled: state === 'sharing' || done }}
      testID="card-share"
      onPress={handleShare}
      disabled={state === 'sharing' || done}
      style={({ pressed }) => [
        styles.btn,
        done && styles.btnDone,
        pressed && !done && styles.btnPressed,
      ]}
    >
      <Text style={[styles.text, done && styles.textDone]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    // Filled accent so it reads as a clear call-to-action after playing.
    backgroundColor: colors.accent,
  },
  btnPressed: {
    backgroundColor: colors.accentDeep,
  },
  btnDone: {
    backgroundColor: 'transparent',
    borderColor: colors.success,
  },
  text: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  textDone: {
    color: colors.success,
  },
});
