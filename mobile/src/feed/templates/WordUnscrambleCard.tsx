/**
 * Word Unscramble renderer — React Native (Design §9; Technical Design §6, §7, §14).
 *
 * Native rebuild of web `src/templates/wordUnscramble/WordUnscrambleCard.tsx` —
 * same behaviour and signals, RN primitives instead of DOM. A single-phase MCQ
 * template (no preview/stream): the scrambled letters and options mount
 * immediately, so interaction is enabled at the engage instant —
 * `elapsedMs` / `interactionElapsedMs` share the same origin.
 *
 * Resolution semantics: a single committed choice resolves the card — correct
 * iff `correctOptionId`, else incorrect (the wrong choice is the recorded
 * "distractor choice"). No retry. Correctness + the distractor come from
 * {@link evaluateWordUnscrambleSelection} (source of truth). The feed-level
 * FeedbackGate shows the explanation after every resolution, so this renderer
 * keeps only its in-play selection echo.
 *
 * Timeout semantics: `config.timeLimitMs` is armed via the shared
 * {@link useCardTimer}; on expiry the card resolves TIMEOUT.
 *
 * Accessibility (Technical Design §14): the scrambled letters are exposed as a
 * labelled string; options are real buttons, large (≥ {@link TAP_TARGET_MIN}),
 * labelled, with explicit `accessibilityState.selected` plus a polite live
 * region — never colour alone.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WordUnscrambleCard as WordUnscrambleCardType } from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateWordUnscrambleSelection } from '../../core/templates/wordUnscramble/wordUnscrambleEvaluator';
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

export type WordUnscrambleCardProps =
  TemplateProps<WordUnscrambleCardType> & {
    now?: () => number;
  };

export default function WordUnscrambleCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: WordUnscrambleCardProps) {
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

      const { isCorrect, distractorOptionId } =
        evaluateWordUnscrambleSelection(config, optionId);

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

  const scrambledDisplay = config.scrambled.split('').join(' ');

  return (
    <View style={styles.section} accessibilityLabel="Word unscramble">
      <Text
        testID="wu-scrambled"
        accessibilityLabel={`Scrambled letters: ${config.scrambled
          .split('')
          .join(', ')}`}
        style={styles.scrambled}
      >
        {scrambledDisplay}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Pick the unscrambled word"
        style={styles.options}
      >
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`wu-option-${option.id}`}
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
        testID="wu-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {resultText}
      </Text>
    </View>
  );
}
WordUnscrambleCard.displayName = 'WordUnscrambleCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  scrambled: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    letterSpacing: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
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
