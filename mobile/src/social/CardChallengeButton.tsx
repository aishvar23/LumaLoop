/**
 * "Challenge a friend" button for the in-feed result step — React Native
 * counterpart of web `src/social/CardChallengeButton.tsx` (engagement strategy
 * §4.6). Sits NEXT TO the share-to-status button in {@link CardFeedback}'s footer
 * and opens the viral "beat my score" loop: it shares a public web
 * `<CHALLENGE_BASE_URL>/c/<cardId>?s=<points>` link (opening one lands the
 * recipient on the web app — the intended prototype scope) via React Native's
 * {@link Share.share}.
 *
 * Auth-free and engine-agnostic: needs only the cardId + the points just earned.
 * Copy is game framing only (Design §7) — no IQ / skill / ability language.
 */
import { Pressable, Share, StyleSheet, Text } from 'react-native';

import {
  CHALLENGE_BASE_URL,
  buildChallengeUrl,
  challengeShareText,
} from './challengeLink';
import { colors, fontSize, fontWeight, radius, space } from '../feed/templates/tokens';

export interface CardChallengeButtonProps {
  cardId: string;
  points: number;
}

export default function CardChallengeButton({ cardId, points }: CardChallengeButtonProps) {
  async function handleChallenge() {
    try {
      // Mobile has no runtime web origin — links always point at the public web app.
      const url = buildChallengeUrl({ cardId, points, origin: CHALLENGE_BASE_URL });
      const text = challengeShareText(points);
      await Share.share({ message: `${text} ${url}` });
    } catch {
      // Never throw out of a share interaction (e.g. the sheet is dismissed).
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Challenge a friend to beat your score"
      testID="card-challenge"
      onPress={handleChallenge}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.text}>⚔ Challenge a friend</Text>
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
    // Outline variant so it reads as distinct from the filled share button.
    borderColor: colors.accent,
    backgroundColor: 'transparent',
  },
  btnPressed: {
    backgroundColor: colors.accentDeep,
  },
  text: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
