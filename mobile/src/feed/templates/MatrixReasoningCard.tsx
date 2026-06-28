/**
 * Matrix Reasoning renderer — React Native. Native rebuild of web
 * `src/templates/matrixReasoning/MatrixReasoningCard.tsx` — same behaviour and
 * signals, RN primitives instead of DOM.
 *
 * A Raven's-style VISUAL reasoning game: a 3×3 matrix of geometric glyphs has one
 * missing cell; the player taps the option tile that completes the pattern. The
 * simplest single-phase pick-one template (mirrors {@link TinyLogicCard}): the
 * matrix + options mount immediately, the FIRST committed selection resolves the
 * card (correct iff `correctOptionId`, else incorrect with the wrong pick as the
 * recorded distractor), and {@link useCardTimer} resolves a TIMEOUT on expiry.
 *
 * Accessibility: meaning is carried by distinct SHAPES, never colour. The matrix
 * is a labelled group with the blank cell announced; options are labelled buttons
 * with `accessibilityState.selected`, plus a polite result line.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderOptions } from '../../core/cards/optionOrder';
import type { MatrixReasoningCard as MatrixReasoningCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateMatrixReasoningSelection } from '../../core/templates/matrixReasoning/matrixReasoningEvaluator';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';
import { useGameTheme } from './GameTheme';

export type MatrixReasoningCardProps =
  TemplateProps<MatrixReasoningCardType> & {
    now?: () => number;
  };

export default function MatrixReasoningCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: MatrixReasoningCardProps) {
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
        evaluateMatrixReasoningSelection(config, optionId);

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

  const resultText = !selectedId
    ? ''
    : selectedId === config.correctOptionId
      ? 'Correct'
      : 'Incorrect';

  return (
    <View style={styles.section} accessibilityLabel="Matrix reasoning">
      <Text style={styles.prompt}>Pick the shape that completes the pattern.</Text>

      <View
        accessibilityLabel="Pattern grid with one missing cell"
        style={styles.grid}
      >
        {config.grid.map((glyph, index) =>
          glyph === null ? (
            <View
              key={index}
              testID="mx-blank"
              accessibilityLabel="Missing cell"
              style={[styles.cell, styles.blankCell, { borderColor: theme.accent }]}
            >
              <Text style={[styles.blankGlyph, { color: theme.accent }]}>?</Text>
            </View>
          ) : (
            <View
              key={index}
              style={[
                styles.cell,
                { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
              ]}
            >
              <Text style={styles.cellGlyph}>{glyph}</Text>
            </View>
          ),
        )}
      </View>

      <View
        accessibilityLabel="Pick the missing shape"
        style={styles.options}
      >
        {orderedOptions.map((option, index) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`mx-option-${option.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Option ${index + 1}`}
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
              <Text style={styles.optionGlyph}>{option.glyph}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        testID="mx-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {resultText}
      </Text>
    </View>
  );
}
MatrixReasoningCard.displayName = 'MatrixReasoningCard';

const CELL = 84;

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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: CELL * 3 + space.sm * 2,
    gap: space.sm,
    justifyContent: 'center',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  blankCell: {
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  cellGlyph: {
    color: colors.text,
    fontSize: fontSize.lg,
  },
  blankGlyph: {
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.md,
  },
  option: {
    minWidth: TAP_TARGET_MIN + 12,
    minHeight: TAP_TARGET_MIN + 12,
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
  optionGlyph: {
    color: colors.text,
    fontSize: fontSize.lg,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
