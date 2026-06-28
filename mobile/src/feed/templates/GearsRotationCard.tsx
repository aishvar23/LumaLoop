/**
 * Gears Rotation renderer — React Native. Native rebuild of web
 * `src/templates/gearsRotation/GearsRotationCard.tsx` — same behaviour and
 * signals, RN primitives instead of DOM.
 *
 * A meshed-gear direction puzzle: a horizontal chain of meshed gears turns in
 * ALTERNATING directions; the driver (first) gear's spin is shown and the player
 * taps which way the LAST gear spins. The simplest single-phase pick-one template
 * (mirrors {@link MatrixReasoningCard}): the chain + options mount immediately,
 * the FIRST committed selection resolves the card (correct iff `correctOptionId`,
 * else incorrect with the wrong pick as the recorded distractor), and
 * {@link useCardTimer} resolves a TIMEOUT on expiry.
 *
 * Accessibility: meaning is carried by an arrow glyph + a WORD, never colour. The
 * chain is a labelled group with the driver's spin and the unknown last gear
 * announced; options are labelled buttons with `accessibilityState.selected`,
 * plus a polite result line.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderOptions } from '../../core/cards/optionOrder';
import type { GearsRotationCard as GearsRotationCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateGearsRotationSelection } from '../../core/templates/gearsRotation/gearsRotationEvaluator';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';
import { useGameTheme } from './GameTheme';

export type GearsRotationCardProps = TemplateProps<GearsRotationCardType> & {
  now?: () => number;
};

/** Rotation arrow glyph for a spin direction (carries meaning alongside a word). */
function arrowFor(direction: string): string {
  return direction === 'ccw' ? '↺' : '↻';
}

export default function GearsRotationCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: GearsRotationCardProps) {
  const { config } = card;
  const theme = useGameTheme();

  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      onResolve(resolution);
    },
    [onResolve],
  );

  const timer = useCardTimer({
    card,
    context,
    onResolve: handleResolve,
    now,
    timeoutSignals: () => ({
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      selected_option_id: selectedId ?? '',
      distractor_option_id: '',
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handleSelect = useCallback(
    (optionId: string) => {
      if (resolvedRef.current) return;
      const selectedAtMs = now();

      if (firstSelectionElapsedRef.current === null) {
        const tti = selectedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(optionId);

      const { isCorrect, distractorOptionId } = evaluateGearsRotationSelection(
        config,
        optionId,
      );

      timer.resolve({
        cardId: card.cardId,
        resolutionType: isCorrect ? 'correct' : 'incorrect',
        isCorrect,
        elapsedMs: selectedAtMs - context.activeAtMs,
        interactionElapsedMs: selectedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_interaction: firstSelectionElapsedRef.current,
          selected_option_id: optionId,
          distractor_option_id: distractorOptionId ?? '',
          correct: isCorrect,
          elapsed: selectedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      config,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      now,
      onAttempt,
      timer,
    ],
  );

  const orderedOptions = useMemo(
    () => orderOptions(card.cardId, config.options),
    [card.cardId, config.options],
  );

  const gears = useMemo(
    () => Array.from({ length: Math.max(0, config.gearCount) }),
    [config.gearCount],
  );
  const lastIndex = gears.length - 1;
  const driveArrow = arrowFor(config.driveDirection);

  const resultText = !selectedId
    ? ''
    : selectedId === config.correctOptionId
      ? 'Correct'
      : 'Incorrect';

  return (
    <View style={styles.section} accessibilityLabel="Gears rotation">
      <Text style={styles.prompt}>Which way does the last gear spin?</Text>

      <View
        accessibilityLabel="Meshed gear chain — the first gear's spin is shown"
        style={styles.chain}
      >
        {gears.map((_, index) => {
          const isDriver = index === 0;
          const isLast = index === lastIndex;
          return (
            <View
              key={index}
              testID={isDriver ? 'gr-driver' : isLast ? 'gr-last' : undefined}
              accessibilityLabel={
                isDriver
                  ? `First gear spins ${config.driveDirection === 'ccw' ? 'counter-clockwise' : 'clockwise'}`
                  : isLast
                    ? 'Last gear — unknown direction'
                    : undefined
              }
              style={styles.gearCell}
            >
              <Text style={styles.gearGlyph}>⚙</Text>
              <Text style={[styles.gearMark, { color: theme.accent }]}>
                {isDriver ? driveArrow : isLast ? '?' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <View accessibilityLabel="Pick the last gear's direction" style={styles.options}>
        {orderedOptions.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`gr-option-${option.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              onPress={() => handleSelect(option.id)}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
                pressed && { backgroundColor: theme.surfaceStrong },
                isSelected && {
                  backgroundColor: theme.surfaceStrong,
                  borderColor: theme.accent,
                },
              ]}
            >
              <Text style={styles.optionLabel}>
                {`${arrowFor(option.id)} ${option.label}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        testID="gr-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {resultText}
      </Text>
    </View>
  );
}
GearsRotationCard.displayName = 'GearsRotationCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
    alignItems: 'center',
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  chain: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  gearCell: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TAP_TARGET_MIN,
  },
  gearGlyph: {
    color: colors.text,
    fontSize: fontSize.hero,
  },
  gearMark: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.heavy,
    minHeight: fontSize.md,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.md,
  },
  option: {
    minWidth: TAP_TARGET_MIN + 12,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
