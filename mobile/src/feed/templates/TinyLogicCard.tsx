/**
 * Tiny Logic renderer — React Native (ADO #128; Design §9.4; Technical Design §6,
 * §7, §14).
 *
 * Native rebuild of web `src/templates/tinyLogic/TinyLogicCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. The simplest template: a
 * single phase, no preview and no stream. Stem and options mount immediately, so
 * interaction is enabled at the engage instant — `elapsedMs` and
 * `interactionElapsedMs` share the same origin (the feed's
 * `context.interactionEnabledAtMs`).
 *
 * Resolution semantics (Design §9.4 — "one-move logic choice"): a single committed
 * choice resolves the card — correct iff `correctOptionId`, else incorrect (the
 * wrong choice is the recorded "distractor choice"). No retry affordance: a wrong
 * commit resolves the card rather than re-arming. Correctness + the chosen
 * distractor come from {@link evaluateTinyLogicSelection} (source of truth), never
 * re-derived.
 *
 * Explanation (#133): the card's `explanation` is NO LONGER shown by this renderer.
 * The feed-level `FeedbackGate` now shows a UNIFORM feedback + explanation step for
 * EVERY resolution (correct/incorrect/timeout) once the card resolves, so revealing
 * it here too would double the explanation. The renderer keeps only its own in-play
 * selection echo (the polite result line); the gate owns the explanation reveal and
 * the `Card_Explanation_Viewed` seam.
 *
 * Timeout semantics (Design §9.4; Technical Design §7): `config.timeLimitMs` is
 * armed via the shared {@link useCardTimer}; on expiry the card resolves TIMEOUT
 * (`isCorrect: false`, `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): options are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled, with explicit `accessibilityState.selected`
 * plus a polite live region — never colour alone.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TinyLogicCard as TinyLogicCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateTinyLogicSelection } from '../../core/templates/tinyLogic/tinyLogicEvaluator';
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

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional injectable
 * `now` clock; the optional prop keeps it assignable to the registry slot while
 * staying testable under fake timers.
 */
export type TinyLogicCardProps = TemplateProps<TinyLogicCardType> & {
  now?: () => number;
};

export default function TinyLogicCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: TinyLogicCardProps) {
  const { config } = card;
  const theme = useGameTheme();

  // Interaction bookkeeping lives in refs so selections don't depend on render
  // timing. `selectedId` is mirrored into state purely to drive the pressed
  // affordance and the polite result announcement.
  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Latch both resolution paths (own selection + the hook's timeout) so any late
  // selection is inert and cannot re-announce on a finished card.
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
    // Read at expiry. A timeout is never a distractor choice, so
    // `distractor_option_id` is empty.
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
      // Once resolved (by a selection or by timeout), further taps are inert.
      if (resolvedRef.current) return;

      const selectedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-interaction from the (single-phase) interaction origin.
      if (firstSelectionElapsedRef.current === null) {
        const tti = selectedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(optionId);

      // Single-choice: the first committed selection resolves the card. Route
      // through the pure evaluator (single source of truth) for correctness and the
      // chosen distractor, then resolve via the hook (single-fire + disarm).
      const { isCorrect, distractorOptionId } = evaluateTinyLogicSelection(
        config,
        optionId,
      );

      // The explanation is no longer revealed here (#133): the feed-level
      // FeedbackGate shows it uniformly after every resolution and owns the
      // `Card_Explanation_Viewed` seam, so this renderer just resolves.
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
          // The chosen distractor (Design §9.4) — empty when the choice is right.
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

  // The committed selection drives a polite in-play announcement naming the result.
  // The card's explanation is shown separately by the feed-level gate (#133).
  const selectedLabel = selectedId
    ? (config.options.find((option) => option.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.correctOptionId
      ? `Correct: ${selectedLabel}`
      : `Incorrect: ${selectedLabel}.`;

  return (
    <View style={styles.section} accessibilityLabel="Tiny logic">
      <Text testID="tl-stem" style={styles.stem}>
        {config.stem}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Pick the correct answer"
        style={styles.options}
      >
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`tl-option-${option.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              onPress={() => handleSelect(option.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: theme.surfaceRaised,
                  borderColor: theme.border,
                },
                pressed && { backgroundColor: theme.surfaceStrong },
                isSelected && {
                  backgroundColor: theme.surfaceStrong,
                  borderColor: theme.accent,
                },
              ]}
            >
              {/* Non-colour selected cue: an explicit ▸ marker, not hue alone. */}
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
        testID="tl-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {resultText}
      </Text>
    </View>
  );
}
TinyLogicCard.displayName = 'TinyLogicCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  stem: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  options: {
    gap: space.md,
    width: '100%',
  },
  // Options read as tappable cards: elevated, rounded, generous targets.
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
  optionPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.98 }],
  },
  optionSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSelected,
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
