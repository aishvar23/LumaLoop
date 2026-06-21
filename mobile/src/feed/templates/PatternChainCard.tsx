/**
 * Pattern Chain renderer — React Native (ADO #141; Design §7, §14; Technical
 * Design §6, §7).
 *
 * Native rebuild of web `src/templates/patternChain/PatternChainCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A MULTI-STEP
 * pattern-recognition template: the player continues a visible `sequence` by
 * picking the next item, then the next (2–3 ordered steps). Unlike
 * `memory_sequence`/`what_changed` there is NO timed PRE-phase — the sequence and
 * the first step's options mount immediately, so interaction is enabled at card
 * start and the controller sets `interactionEnabledAtMs === activeAtMs`. The
 * shared `isActive` ACTIVATION signal is still accepted and passed through for
 * contract consistency; with no pre-phase to gate, the renderer does not branch
 * on it.
 *
 * Step flow: the renderer presents step N's `options`; on a pick it APPENDS the
 * chosen item to the shown sequence and advances to step N+1, until every step
 * is answered. `onAttempt` fires exactly once, on the FIRST pick.
 *
 * Resolution semantics — NON-STRICT (documented UX choice, parity with web): the
 * player always completes the whole chain (one pick per step); a wrong pick does
 * NOT end the card early. `onResolve` fires EXACTLY ONCE, after the final step,
 * routing the collected pick order through the pure {@link evaluatePatternChain}
 * (the single source of truth, never re-derived). This keeps the interaction
 * predictable and lets the evaluator report richer signals (`steps_correct`,
 * `first_error_step`) than a fail-fast would.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` covers the whole
 * solve and is armed on mount via the shared {@link useCardTimer}; on expiry the
 * card resolves TIMEOUT (`isCorrect: false`, `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): options are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled, and a polite live region announces step
 * progress and the running chain — progress is never conveyed by colour or
 * position alone. A picked item appended to the chain reads distinctly via its
 * own accent surface paired with the order, never colour alone.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PatternChainCard as PatternChainCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluatePatternChain } from '../../core/templates/patternChain/patternChainEvaluator';
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

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`); the optional prop keeps it
 * assignable to the registry slot while staying testable under fake timers.
 *
 * `isActive` is the shared ACTIVATION signal; Pattern Chain has no timed
 * pre-phase, so it accepts the flag for contract consistency but does not gate
 * any behaviour on it. Omitted ≡ active.
 */
export type PatternChainCardProps = TemplateProps<PatternChainCardType> & {
  now?: () => number;
};

export default function PatternChainCard({
  card,
  context,
  // Accepted for contract consistency; no off-screen timed pre-phase to gate.
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: PatternChainCardProps) {
  const { config } = card;
  const { sequence, steps } = config;

  // The current step index drives which step's options are shown. The chosen
  // labels (appended to the visible sequence) and the chain of picked ids are
  // mirrored into state for display + the live region; refs carry the
  // resolution-time reads so a pick does not depend on render timing.
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

      // Not the final step yet: append the pick and advance to the next step.
      if (nextChosenIds.length < steps.length) {
        setCurrentStep((step) => step + 1);
        return;
      }

      // Final step answered: route the full chain through the pure evaluator
      // (the single source of truth) and resolve via the hook to keep the
      // single-fire guarantee + disarm the timer.
      const result = evaluatePatternChain({ steps }, nextChosenIds);
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

  // The visible chain: the authored sequence followed by the items the player
  // has picked so far. Rendered as plain chips (the answer-key options are the
  // only interactive elements).
  const shownItems = [...sequence, ...chosenLabels];

  // Once every step is answered the chain is complete and resolves; hide the
  // step options so no latched option lingers (in the feed the FeedbackGate
  // also replaces the resolved card, but the renderer is correct standalone).
  const chainComplete = chosenLabels.length >= steps.length;
  const activeStep = chainComplete ? undefined : steps[currentStep];

  return (
    <View style={styles.section} accessibilityLabel="Pattern chain">
      <Text testID="pc-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>

      <View
        accessibilityLabel="The sequence so far"
        style={styles.sequence}
      >
        {shownItems.map((item, index) => {
          const isChosen = index >= sequence.length;
          return (
            <View
              // Items can repeat, so the index is part of the key by design.
              key={`${index}-${item}`}
              testID={`pc-seq-${index}`}
              style={[styles.chip, isChosen && styles.chosenChip]}
            >
              <Text
                style={[styles.chipText, isChosen && styles.chosenChipText]}
              >
                {item}
              </Text>
            </View>
          );
        })}
        <View testID="pc-next-slot" style={styles.nextSlot}>
          <Text style={styles.nextSlotText}>?</Text>
        </View>
      </View>

      {activeStep ? (
        <View
          accessibilityLabel={`Pick the next item (step ${currentStep + 1} of ${steps.length})`}
          style={styles.options}
        >
          {activeStep.options.map((option) => (
            <Pressable
              key={option.id}
              testID={`pc-option-${option.id}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => handlePick(option.id, option.label)}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.optionPressed,
              ]}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text
        testID="pc-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {`Step ${Math.min(currentStep + 1, steps.length)} of ${steps.length}`}
        {chosenLabels.length > 0 ? `. Picked: ${chosenLabels.join(', ')}` : ''}
      </Text>
    </View>
  );
}
PatternChainCard.displayName = 'PatternChainCard';

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
  // The visible chain reads as a deliberate row of pattern tiles that wraps.
  sequence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
  },
  chip: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  // A picked item, appended to the chain: a stronger accent surface so the
  // player's own additions read distinctly from the authored sequence (paired
  // with the order, never colour alone).
  chosenChip: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  chosenChipText: {
    color: colors.accentContrast,
  },
  // The "next item" slot: a dashed placeholder cueing where the pick lands.
  nextSlot: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  nextSlotText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
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
