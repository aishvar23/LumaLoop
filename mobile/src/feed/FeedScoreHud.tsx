/**
 * Feed game-points HUD for React Native (Phase 4 — GAME POINTS). The RN
 * counterpart of web `src/feed/FeedScoreHud.tsx`.
 *
 * A small, persistent, unobtrusive overlay pinned to the top-right of the feed,
 * clear of the safe-area inset, showing the running total points and current
 * streak. Non-interactive (it never intercepts a swipe). GAME language only —
 * "pts", "streak" — never skill/ability/IQ/trait framing (Design §7/§21.8).
 *
 * Colour is never the sole carrier of meaning: the numbers + labels carry it. The
 * streak pill only appears once a streak builds (≥1) so the HUD stays quiet at rest.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import {
  colors,
  fontSize,
  fontWeight,
  radius,
  space,
} from './templates/tokens';
import { useReducedMotion } from './useReducedMotion';

export type FeedScoreHudProps = {
  /** Total points earned this feed visit. */
  totalPoints: number;
  /** Current consecutive-correct streak. */
  currentStreak: number;
  /** Top inset so the HUD clears the device notch. */
  topInset: number;
};

export default function FeedScoreHud({
  totalPoints,
  currentStreak,
  topInset,
}: FeedScoreHudProps) {
  // Phase 5 streak flourish: a brief celebratory pulse whenever the streak GROWS
  // (not on reset/decrease). We track the previous value and drive a one-shot
  // scale pulse only on an increase. Visual-only; snaps to no-motion under the OS
  // "reduce motion" preference. The first build (0→1) counts as an increase, so
  // the pill pulses as it first appears.
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const prevStreakRef = useRef(currentStreak);
  useEffect(() => {
    const increased = currentStreak > prevStreakRef.current;
    prevStreakRef.current = currentStreak;
    if (!increased || reducedMotion) return undefined;
    pulse.setValue(1);
    const animation = Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.16,
        duration: 130,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [currentStreak, reducedMotion, pulse]);

  return (
    <View
      style={[styles.hud, { top: topInset + space.md }]}
      testID="feed-hud"
      pointerEvents="none"
      // Decorative chrome over the feed; hidden from assistive tech so it never
      // adds noise to the swipe surface.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.points} testID="feed-hud-points">
        <Text style={styles.pointsValue}>{totalPoints}</Text>
        <Text style={styles.label}>pts</Text>
      </View>
      {currentStreak >= 1 ? (
        <Animated.View
          style={[styles.streak, { transform: [{ scale: pulse }] }]}
          testID="feed-hud-streak"
        >
          <Text style={styles.streakText}>{`🔥 ${currentStreak}`}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
FeedScoreHud.displayName = 'FeedScoreHud';

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    right: space.md,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointsValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.heavy,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  streak: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  streakText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.heavy,
  },
});
