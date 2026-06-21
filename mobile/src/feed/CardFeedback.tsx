/**
 * CardFeedback — the uniform, in-feed FEEDBACK + EXPLANATION state shown after a
 * card resolves, React Native (ADO #133; Design §8.2 "Immediate success/failure
 * feedback" + "Optional explanation after resolution"; Technical Design §14
 * "Card feedback state" / "Explanation state").
 *
 * Native counterpart of web `src/ui/CardFeedback.tsx`. This is the ADDITIONAL
 * uniform step EVERY template shares, regardless of whether its renderer surfaces
 * its own in-play feedback (CLAUDE.md §4/§6): it reports correct / incorrect /
 * timeout and shows the card's authored `explanation` (title + body) for EVERY
 * resolution — including correct answers, which several renderers resolve silently.
 *
 * Purely presentational. It owns NO progression: unlike the web (whose controller
 * auto-advances), the native feed advances on a SWIPE, so there is no "Next" button
 * here — the step persists on the slide until the player swipes on, with a subtle
 * "swipe up" cue. The {@link FeedbackGate} owns when this is shown and forwarding
 * the resolution outward.
 *
 * Non-modal by design (Technical Design §14 "No nested modal game experiences"):
 * this renders in-flow as a `View`, never as an overlay/dialog. Colour is never the
 * sole carrier of meaning — the outcome WORD itself reports the result (Design §7);
 * the outcome is announced via a polite live region for assistive tech.
 *
 * Centering (MP2) and richer look & feel (MP3) are separate tasks — this step is
 * intentionally visually simple for now.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { CardResolution, ResolutionType } from '../core/templates/contract';
import { colors, fontSize, radius, space } from './templates/tokens';

export type CardFeedbackProps = {
  /** The resolution captured from the card's renderer. */
  resolution: CardResolution;
  /** The card's authored explanation copy (title + body). */
  explanation: { title: string; body: string };
};

/** Per-outcome heading copy. Modest + performance-based, no trait language (Design §7). */
const OUTCOME_HEADING: Readonly<Record<ResolutionType, string>> = {
  correct: 'Correct',
  incorrect: 'Not quite',
  timeout: "Time's up",
};

/** Per-outcome supporting line. Keeps tone encouraging, never pressuring. */
const OUTCOME_DETAIL: Readonly<Record<ResolutionType, string>> = {
  correct: 'Nice — you got it.',
  incorrect: 'Here is how this one works.',
  timeout: 'The timer ran out — here is how this one works.',
};

export default function CardFeedback({
  resolution,
  explanation,
}: CardFeedbackProps) {
  const heading = OUTCOME_HEADING[resolution.resolutionType];
  const detail = OUTCOME_DETAIL[resolution.resolutionType];

  return (
    <View
      testID="card-feedback"
      accessibilityLabel="Card feedback"
      // Surface the machine-readable outcome to tests/assistive queries without
      // relying on colour — mirrors the web `data-outcome` hook.
      accessibilityValue={{ text: resolution.resolutionType }}
      style={styles.section}
    >
      {/* Visible outcome — the word itself carries the meaning (not colour-only).
          A polite live region announces it once for assistive tech. */}
      <View>
        <Text
          testID="feedback-outcome"
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          style={styles.outcomeHeading}
        >
          {heading}
        </Text>
        <Text style={styles.outcomeDetail}>{detail}</Text>
      </View>

      {/* Explanation state — the card's authored copy, shown for every outcome. */}
      <View
        testID="feedback-explanation"
        accessibilityLabel="Explanation"
        style={styles.explanation}
      >
        <Text testID="feedback-explanation-title" style={styles.explanationTitle}>
          {explanation.title}
        </Text>
        <Text testID="feedback-explanation-body" style={styles.explanationBody}>
          {explanation.body}
        </Text>
      </View>

      {/* Advancing is a swipe, not a button — a subtle cue, no auto-advance. */}
      <Text
        testID="feedback-swipe-cue"
        accessibilityLabel="Swipe up for the next game"
        style={styles.swipeCue}
      >
        Swipe up for the next game
      </Text>
    </View>
  );
}
CardFeedback.displayName = 'CardFeedback';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  outcomeHeading: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  outcomeDetail: {
    marginTop: space.xs,
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  explanation: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  explanationTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  explanationBody: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  swipeCue: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
