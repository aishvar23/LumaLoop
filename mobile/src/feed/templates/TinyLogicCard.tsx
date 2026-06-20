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
 * commit resolves the card and reveals the explanation as post-resolution feedback
 * rather than re-arming. Correctness + the chosen distractor come from
 * {@link evaluateTinyLogicSelection} (source of truth), never re-derived.
 *
 * Explanation-after-error (Design §9.4): the card's `explanation` (title + body) is
 * shown ONLY when the committed choice is wrong; its own polite copy. A correct
 * choice resolves silently with no explanation.
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
import { colors, fontSize, radius, space, TAP_TARGET_MIN } from './tokens';

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

  // Interaction bookkeeping lives in refs so selections don't depend on render
  // timing. `selectedId` / `showExplanation` are mirrored into state purely to
  // drive the pressed affordance, the announcement, and the explanation reveal.
  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

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

      // Explanation-after-error: reveal the explanation only on a wrong commit.
      if (!isCorrect) setShowExplanation(true);

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

  // The committed selection drives a polite announcement; since the explanation
  // reveals correctness on error, the announcement names the result too.
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
              style={[styles.option, isSelected && styles.optionSelected]}
            >
              {/* Non-colour selected cue: an explicit ▸ marker, not hue alone. */}
              <Text style={styles.optionText}>
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
      {showExplanation ? (
        <View
          testID="tl-explanation"
          accessibilityLabel="Explanation"
          accessibilityLiveRegion="polite"
          style={styles.explanation}
        >
          <Text style={styles.explanationTitle}>{card.explanation.title}</Text>
          <Text style={styles.explanationBody}>{card.explanation.body}</Text>
        </View>
      ) : null}
    </View>
  );
}
TinyLogicCard.displayName = 'TinyLogicCard';

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  stem: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  options: {
    gap: space.sm,
    width: '100%',
  },
  option: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSelected,
  },
  optionText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  explanationBody: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
});
