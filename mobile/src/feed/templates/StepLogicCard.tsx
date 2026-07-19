/**
 * Step Logic renderer — React Native (ADO #142; Design §7, §14; Technical
 * Design §6, §7).
 *
 * Native rebuild of web `src/templates/stepLogic/StepLogicCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A MULTI-STEP
 * logical-reasoning template: the player answers a short chain of 2–3 LINKED
 * multiple-choice sub-questions that build on a shared `premise`. Unlike
 * `memory_sequence`/`what_changed` there is NO timed PRE-phase — the premise and
 * the first sub-question's options mount immediately, so interaction is enabled
 * at card start and the controller sets `interactionEnabledAtMs === activeAtMs`.
 * The shared `isActive` ACTIVATION signal is still accepted and passed through
 * for contract consistency; with no pre-phase to gate, the renderer does not
 * branch on it.
 *
 * Step flow: the renderer presents sub-question N's `stem` + `options`; on a pick
 * it reveals sub-question N+1, until every step is answered. `onAttempt` fires
 * exactly once, on the FIRST pick.
 *
 * Resolution semantics — NON-STRICT (documented UX choice, parity with web and
 * `pattern_chain`): the player always completes the whole chain (one pick per
 * step); a wrong pick does NOT end the card early. `onResolve` fires EXACTLY
 * ONCE, after the final step, routing the collected pick order through the pure
 * {@link evaluateStepLogic} (the single source of truth, never re-derived). This
 * keeps the interaction predictable — each step's options are self-contained, so
 * a wrong early pick never strands the player on an unanswerable later step — and
 * lets the evaluator report richer signals (`steps_correct`, `first_error_step`)
 * than a fail-fast would.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` covers the whole
 * solve and is armed on mount via the shared {@link useCardTimer}; on expiry the
 * card resolves TIMEOUT (`isCorrect: false`, `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): options are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled, and a polite live region announces step
 * progress and the running answers — progress is never conveyed by colour or
 * position alone.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderOptions } from '../../core/cards/optionOrder';
import type { StepLogicCard as StepLogicCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateStepLogic } from '../../core/templates/stepLogic/stepLogicEvaluator';
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
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`); the optional prop keeps it
 * assignable to the registry slot while staying testable under fake timers.
 *
 * `isActive` is the shared ACTIVATION signal; Step Logic has no timed pre-phase,
 * so it accepts the flag for contract consistency but does not gate any
 * behaviour on it. Omitted ≡ active.
 */
export type StepLogicCardProps = TemplateProps<StepLogicCardType> & {
  now?: () => number;
};

export default function StepLogicCard({
  card,
  context,
  // Accepted for contract consistency; no off-screen timed pre-phase to gate.
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: StepLogicCardProps) {
  const { config } = card;
  const { premise, steps } = config;
  const theme = useGameTheme();

  // The current step index drives which sub-question's stem + options are shown.
  // The chosen labels are mirrored into state for display + the live region; refs
  // carry the resolution-time reads so a pick does not depend on render timing.
  const [currentStep, setCurrentStep] = useState(0);
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const chosenIdsRef = useRef<string[]>([]);

  const firstPickElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);

  // Latch both resolution paths (own completion + the hook's timeout) so any
  // late pick is inert and cannot re-advance or re-announce on a finished card.
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
    // Read at expiry: report how far the player got before the clock ran out.
    timeoutSignals: () => ({
      steps_total: steps.length,
      steps_taken: chosenIdsRef.current.length,
      time_to_interaction: firstPickElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handlePick = useCallback(
    (optionId: string, optionLabel: string) => {
      // Once resolved (by completion or timeout), further picks are inert.
      if (resolvedRef.current) return;

      const pickedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-interaction from the (single-phase) interaction origin.
      if (firstPickElapsedRef.current === null) {
        const tti = pickedAtMs - context.interactionEnabledAtMs;
        firstPickElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      const nextChosenIds = [...chosenIdsRef.current, optionId];
      chosenIdsRef.current = nextChosenIds;
      setChosenLabels((prev) => [...prev, optionLabel]);

      // Not the final step yet: advance to the next sub-question.
      if (nextChosenIds.length < steps.length) {
        setCurrentStep((step) => step + 1);
        return;
      }

      // Final step answered: route the full chain through the pure evaluator
      // (the single source of truth) and resolve via the hook to keep the
      // single-fire guarantee + disarm the timer.
      const result = evaluateStepLogic({ steps }, nextChosenIds);
      timer.resolve({
        cardId: card.cardId,
        resolutionType: result.resolutionType,
        isCorrect: result.isCorrect,
        elapsedMs: pickedAtMs - context.activeAtMs,
        interactionElapsedMs: pickedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          ...result.signals,
          time_to_interaction: firstPickElapsedRef.current,
          correct: result.isCorrect,
          elapsed: pickedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      steps,
      now,
      onAttempt,
      timer,
    ],
  );

  // Once every step is answered the chain is complete and resolves; hide the
  // step options so no latched option lingers (in the feed the FeedbackGate also
  // replaces the resolved card, but the renderer is correct standalone).
  const chainComplete = chosenLabels.length >= steps.length;
  const activeStep = chainComplete ? undefined : steps[currentStep];

  // Present the active step's options in a deterministic, per-step-seeded order so
  // the correct answer is not positionally guessable (keyed by `correctOptionId`,
  // not slot). Seeded per step (`cardId:stepIndex`) so each step shuffles
  // independently but stably; identical on web↔mobile.
  const orderedOptions = useMemo(
    () =>
      activeStep
        ? orderOptions(`${card.cardId}:${currentStep}`, activeStep.options)
        : [],
    [card.cardId, currentStep, activeStep],
  );

  return (
    <View style={styles.section} accessibilityLabel="Step logic">
      <Text testID="sl-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>

      {/* The shared premise stays visible above every sub-question. */}
      <Text
        testID="sl-premise"
        style={[
          styles.premise,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {premise}
      </Text>

      {activeStep ? (
        <View
          accessibilityLabel={`Sub-question ${currentStep + 1} of ${steps.length}`}
          style={styles.step}
        >
          <Text testID="sl-stem" style={styles.stem}>
            {activeStep.stem}
          </Text>
          <View style={styles.options}>
            {orderedOptions.map((option) => (
              <Pressable
                key={option.id}
                testID={`sl-option-${option.id}`}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                onPress={() => handlePick(option.id, option.label)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: theme.surfaceRaised,
                    borderColor: theme.border,
                  },
                  pressed && {
                    backgroundColor: theme.surfaceStrong,
                    borderColor: theme.accent,
                  },
                ]}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text
        testID="sl-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {`Step ${Math.min(currentStep + 1, steps.length)} of ${steps.length}`}
        {chosenLabels.length > 0 ? `. Answered: ${chosenLabels.join(', ')}` : ''}
      </Text>
    </View>
  );
}
StepLogicCard.displayName = 'StepLogicCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  // The shared premise reads as a quoted brief, distinct from the sub-questions.
  premise: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.normal,
    ...elevation.tile,
  },
  step: {
    gap: space.md,
    width: '100%',
  },
  stem: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.lg * lineHeight.tight,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    width: '100%',
  },
  // Options read as tappable chips/cards: elevated, rounded, generous targets.
  option: {
    flexGrow: 1,
    flexBasis: TAP_TARGET_MIN,
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
  optionText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
