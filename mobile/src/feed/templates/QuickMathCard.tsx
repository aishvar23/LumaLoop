/**
 * Quick Math renderer — React Native (Design §9; Technical Design §6, §7, §14).
 *
 * Native rebuild of web `src/templates/quickMath/QuickMathCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A single-phase MCQ
 * template (no preview/stream): the equation and numeric options mount
 * immediately, so `elapsedMs` / `interactionElapsedMs` share the same origin.
 *
 * Resolution semantics: a single committed choice resolves the card.
 * Correctness is decided by {@link evaluateQuickMathSelection}, which COMPUTES
 * the canonical value from the structured expression (source of truth) and
 * checks the chosen option's value against it — the renderer never compares
 * numbers itself. The feed-level FeedbackGate shows the explanation after every
 * resolution.
 *
 * Timeout semantics: `config.timeLimitMs` is armed via the shared
 * {@link useCardTimer}; on expiry the card resolves TIMEOUT.
 *
 * Accessibility (Technical Design §14): the equation is exposed as a labelled
 * string; options are real buttons, large (≥ {@link TAP_TARGET_MIN}), labelled,
 * with explicit `accessibilityState.selected` plus a polite live region.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderOptions } from '../../core/cards/optionOrder';
import type { QuickMathCard as QuickMathCardType } from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateQuickMathSelection } from '../../core/templates/quickMath/quickMathEvaluator';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';
import { useGameTheme } from './GameTheme';

export type QuickMathCardProps = TemplateProps<QuickMathCardType> & {
  now?: () => number;
};

export default function QuickMathCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: QuickMathCardProps) {
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

      const { isCorrect, distractorOptionId } = evaluateQuickMathSelection(
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

  const selectedLabel = selectedId
    ? (config.options.find((option) => option.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.correctOptionId
      ? `Correct: ${selectedLabel}`
      : `Incorrect: ${selectedLabel}.`;

  // Present options in a deterministic, card-seeded order so the correct answer
  // is not positionally guessable (keyed by `correctOptionId`, not slot). Stable
  // across renders and identical on web↔mobile.
  const orderedOptions = useMemo(
    () => orderOptions(card.cardId, config.options),
    [card.cardId, config.options],
  );

  return (
    <View style={styles.section} accessibilityLabel="Quick math">
      <Text
        testID="qm-display"
        accessibilityLabel={`Solve: ${config.display}`}
        style={styles.display}
      >
        {config.display} = ?
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Pick the answer"
        style={styles.options}
      >
        {orderedOptions.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`qm-option-${option.id}`}
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
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                  isSelected && { color: theme.accent },
                ]}
              >
                {isSelected ? '▸ ' : ''}
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        testID="qm-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {resultText}
      </Text>
    </View>
  );
}
QuickMathCard.displayName = 'QuickMathCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  display: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: fontSize.xl * lineHeight.tight,
  },
  options: {
    gap: space.md,
    width: '100%',
  },
  option: {
    minHeight: TAP_TARGET_MIN + 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  optionText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  optionTextSelected: {
    fontWeight: fontWeight.bold,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
