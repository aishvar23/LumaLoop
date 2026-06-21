/**
 * CardFeedback — the uniform, in-feed FEEDBACK + EXPLANATION state shown after a
 * card resolves, React Native (ADO #133; restyled into a polished result card for
 * MP3 #135). Design §8.2 "Immediate success/failure feedback" + "Optional
 * explanation after resolution"; Technical Design §14 "Card feedback state" /
 * "Explanation state".
 *
 * Native counterpart of web `src/ui/CardFeedback.tsx`. This is the ADDITIONAL
 * uniform step EVERY template shares, regardless of whether its renderer surfaces
 * its own in-play feedback (CLAUDE.md §4/§6): it reports correct / incorrect /
 * timeout and shows the card's authored `explanation` (title + body) for EVERY
 * resolution — including correct answers, which several renderers resolve silently.
 *
 * MP3 look & feel: the step is a result CARD — an outcome badge (glyph + word),
 * a supporting line, the explanation in its own panel, and a swipe-up cue with a
 * chevron — colour-tinted per outcome (success vs. not) to feel rewarding, within
 * the positioning guardrails (no IQ/ability/score/trait claims). It fades + lifts in
 * on appearance via `Animated`, degrading to an instant appearance when the OS
 * "reduce motion" preference is on ({@link useReducedMotion}). Colour is never the
 * sole carrier of meaning — the outcome WORD reports the result and a polite live
 * region announces it.
 *
 * Purely presentational. It owns NO progression: the native feed advances on a
 * SWIPE, so there is no "Next" button — the step persists until the player swipes
 * on. The {@link FeedbackGate} owns when this is shown and forwarding the resolution.
 *
 * Non-modal by design (Technical Design §14 "No nested modal game experiences"):
 * renders in-flow as a `View`, never as an overlay/dialog.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { CardScore } from '../core/feed/scoring';
import type { CardResolution, ResolutionType } from '../core/templates/contract';
import { useReducedMotion } from './useReducedMotion';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
} from './templates/tokens';

export type CardFeedbackProps = {
  /** The resolution captured from the card's renderer. */
  resolution: CardResolution;
  /** The card's authored explanation copy (title + body). */
  explanation: { title: string; body: string };
  /**
   * The GAME-POINTS this card earned (Phase 4). When present, a points + streak/
   * combo chip is shown. Omitted ≡ no scoring (standalone renders, tests) → no
   * chip. GAME language only (Design §7/§21.8).
   */
  cardScore?: CardScore | null;
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

/** Decorative badge glyph (the WORD carries meaning; glyph is hidden from a11y). */
const OUTCOME_GLYPH: Readonly<Record<ResolutionType, string>> = {
  correct: '✓',
  incorrect: '✕',
  timeout: '⏱',
};

export default function CardFeedback({
  resolution,
  explanation,
  cardScore,
}: CardFeedbackProps) {
  const { resolutionType } = resolution;
  const heading = OUTCOME_HEADING[resolutionType];
  const detail = OUTCOME_DETAIL[resolutionType];
  const positive = resolutionType === 'correct';

  // Outcome-tinted treatment: a success hue reinforces "Correct"; the softer
  // danger hue reinforces "Not quite"/"Time's up". Always paired with the word.
  const accent = positive ? colors.success : colors.danger;
  const cardSurface = positive ? colors.successSurface : colors.dangerSurface;
  const cardBorder = positive ? colors.successBorder : colors.dangerBorder;

  // Phase 5: POP in on appearance (fade + lift + a slight overshoot scale) so a
  // correct answer feels rewarding — the gate mounts a fresh CardFeedback the
  // instant a card resolves, so this fires exactly once at that moment. Unless
  // reduce-motion is on, in which case it snaps to the final value (no movement).
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) {
      anim.setValue(1);
      return undefined;
    }
    // Spring gives the subtle overshoot of web's `--ease-pop`; tuned tight so it
    // reads punchy, never bouncy-cartoonish.
    const animation = Animated.spring(anim, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, anim]);
  const animatedStyle = {
    opacity: anim.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0, 1, 1],
    }),
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  };

  return (
    <Animated.View
      testID="card-feedback"
      accessibilityLabel="Card feedback"
      // Surface the machine-readable outcome to tests/assistive queries without
      // relying on colour — mirrors the web `data-outcome` hook.
      accessibilityValue={{ text: resolutionType }}
      style={[
        styles.card,
        { backgroundColor: cardSurface, borderColor: cardBorder },
        animatedStyle,
      ]}
    >
      {/* Outcome badge: a tinted glyph chip + the outcome word. The word itself
          carries meaning (not colour-only); a polite live region announces it. */}
      <View style={styles.outcomeRow}>
        <View
          style={[styles.badge, { borderColor: accent }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.badgeGlyph, { color: accent }]}>
            {OUTCOME_GLYPH[resolutionType]}
          </Text>
        </View>
        <View style={styles.outcomeText}>
          <Text
            testID="feedback-outcome"
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            style={[styles.outcomeHeading, { color: accent }]}
          >
            {heading}
          </Text>
          <Text style={styles.outcomeDetail}>{detail}</Text>
        </View>
      </View>

      {/* Phase 4: the per-resolution GAME-POINTS chip — points earned plus the
          current streak/combo. Shown only when a score was supplied (feed runs);
          omitted in standalone renders. */}
      {cardScore ? <ScoreChip cardScore={cardScore} accent={accent} /> : null}

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

      {/* Advancing is a swipe, not a button — a subtle cue with a chevron. */}
      <Text
        testID="feedback-swipe-cue"
        accessibilityLabel="Swipe up for the next game"
        style={styles.swipeCue}
      >
        Swipe up for the next game  ⌃
      </Text>
    </Animated.View>
  );
}
CardFeedback.displayName = 'CardFeedback';

/**
 * The per-resolution GAME-POINTS chip (Phase 4). Shows points earned and, on a
 * streak, the current run length + combo multiplier. GAME language only — "pts",
 * "streak", "combo" — never skill/ability/IQ/trait framing (Design §7/§21.8). A
 * miss shows a neutral, non-pressuring "Streak reset". Tinted with the outcome
 * accent so it matches the result card.
 */
function ScoreChip({
  cardScore,
  accent,
}: {
  cardScore: CardScore;
  accent: string;
}) {
  const { points, correct, streak, combo } = cardScore;
  const showCombo = correct && combo > 1;
  const meta =
    streak > 1
      ? `🔥 ${streak} streak${showCombo ? ` · ×${combo.toFixed(1)} combo` : ''}`
      : null;
  return (
    <View style={[styles.scoreChip, { borderColor: accent }]} testID="card-score">
      {correct ? (
        <>
          <Text style={styles.scorePoints} testID="card-score-points">
            +{points} pts
          </Text>
          {meta ? (
            <Text style={styles.scoreMeta} testID="card-score-streak">
              {meta}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.scoreMeta} testID="card-score-reset">
          Streak reset
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...elevation.card,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  badgeGlyph: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
  },
  outcomeText: {
    flex: 1,
  },
  outcomeHeading: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
  },
  outcomeDetail: {
    marginTop: space.xs,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.normal,
  },
  explanation: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  explanationTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  explanationBody: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.relaxed,
  },
  swipeCue: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  scorePoints: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.heavy,
  },
  scoreMeta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
