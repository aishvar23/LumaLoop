/**
 * What Changed renderer — React Native (ADO #128; Design §9.2; Technical Design
 * §7, §10, §14).
 *
 * Native rebuild of web `src/templates/whatChanged/WhatChangedCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A working-memory template
 * the renderer drives in two phases it OWNS itself, because the feed sets
 * `interactionEnabledAtMs === activeAtMs` (engage instant) and preview offsets are
 * a renderer concern:
 *
 *   Phase 1 — PREVIEW: `beforePattern` is shown for `config.previewMs`. Interaction
 *     is NOT yet enabled — the options are not even mounted, so a tap cannot do
 *     anything measurable.
 *   Phase 2 — ANSWER: after `previewMs` the renderer reveals `afterPattern` plus
 *     the options and records its OWN interaction-enabled instant. TTI and
 *     `interactionElapsedMs` are measured from THAT instant, not the engage/active
 *     instant, so the preview period does not penalise the player and the per-card
 *     timer covers the ANSWER phase only (parity with web).
 *
 * The clean way to make the shared {@link useCardTimer} arm at answer-phase start
 * is to mount the timer-using subtree ({@link WhatChangedAnswer}) only once the
 * answer phase begins, handing it a context whose `interactionEnabledAtMs` is the
 * answer-phase start. A timeout's `interactionElapsedMs` then excludes the preview
 * while `elapsedMs` still runs from `context.activeAtMs`.
 *
 * Resolution semantics (Design §9.2): single-choice identification — the FIRST
 * committed selection resolves the card (correct iff `correctOptionId`, else
 * incorrect). No retry affordance, so no "counted but non-fatal" path here, unlike
 * Spot It. Correctness is decided by {@link evaluateWhatChangedSelection} (source
 * of truth), never re-derived.
 *
 * Accessibility (Technical Design §14): options are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled, with explicit `accessibilityState.selected`
 * plus a polite live region — never colour alone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WhatChangedCard as WhatChangedCardType } from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateWhatChangedSelection } from '../../core/templates/whatChanged/whatChangedEvaluator';
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
 */
export type WhatChangedCardProps = TemplateProps<WhatChangedCardType> & {
  now?: () => number;
};

type Phase = 'preview' | 'answer';

export default function WhatChangedCard({
  card,
  context,
  isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: WhatChangedCardProps) {
  const { config } = card;

  // Phase is the only render state the parent owns; the answer-phase start instant
  // lives in a ref so it survives without forcing a render.
  const [phase, setPhase] = useState<Phase>('preview');
  const answerStartRef = useRef<number | null>(null);

  // The clock lives in a ref so the preview→answer transition reads the LATEST
  // `now` at expiry, mirroring how `useCardTimer` guards against stale closures.
  const nowRef = useRef(now);
  nowRef.current = now;

  // Preview → answer transition after `previewMs`. The countdown is gated on
  // ACTIVATION (#128 review fix): the feed PRE-MOUNTS off-screen slides, so if the
  // preview started on mount it could fully elapse before the user swipes here —
  // they would land on the answer phase and never see `beforePattern`, defeating
  // the working-memory mechanic. So while `isActive` is false we HOLD in the
  // preview/initial state and schedule nothing; the timer arms only once the card
  // becomes active. `phase === 'preview'` keeps the effect inert after the
  // transition (and on any later activation toggle). Interaction is enabled only
  // when this fires; that instant becomes the answer-phase timing origin, so TTI /
  // `interactionElapsedMs` still exclude the preview (parity preserved).
  useEffect(() => {
    if (!isActive || phase !== 'preview') return undefined;
    const id = setTimeout(() => {
      answerStartRef.current = nowRef.current();
      setPhase('answer');
    }, Math.max(0, config.previewMs));
    return () => clearTimeout(id);
  }, [isActive, phase, config.previewMs]);

  return (
    <View style={styles.section} accessibilityLabel="What changed">
      <Text style={styles.prompt}>{card.prompt}</Text>
      {phase === 'preview' ? (
        <PatternStrip
          label="Memorize this pattern"
          pattern={config.beforePattern}
          testIdPrefix="wc-before"
        />
      ) : (
        <WhatChangedAnswer
          card={card}
          context={context}
          // Non-null: the answer phase is only entered from the preview timer,
          // which sets the ref before flipping the phase.
          answerStartMs={answerStartRef.current as number}
          onAttempt={onAttempt}
          onResolve={onResolve}
          now={now}
        />
      )}
    </View>
  );
}
WhatChangedCard.displayName = 'WhatChangedCard';

/**
 * The answer-phase subtree. Mounted only once the preview ends, so the shared
 * {@link useCardTimer} it arms counts `timeLimitMs` from the answer phase, not card
 * start. Shows `afterPattern` + the options and resolves on the first committed
 * selection.
 */
type WhatChangedAnswerProps = {
  card: WhatChangedCardType;
  context: CardStartContext;
  answerStartMs: number;
  onAttempt: TemplateProps<WhatChangedCardType>['onAttempt'];
  onResolve: TemplateProps<WhatChangedCardType>['onResolve'];
  now: () => number;
};

function WhatChangedAnswer({
  card,
  context,
  answerStartMs,
  onAttempt,
  onResolve,
  now,
}: WhatChangedAnswerProps) {
  const { config } = card;
  const theme = useGameTheme();

  // Interaction bookkeeping lives in refs so selections don't depend on render
  // timing. `selectedId` is mirrored into state purely to drive the pressed
  // affordance + the polite announcement.
  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Hand the timer a context whose interaction origin is the ANSWER-phase start,
  // so a timeout's `interactionElapsedMs` measures from there (excluding the
  // preview) while `elapsedMs` still runs from `context.activeAtMs`.
  const answerContext = useMemo<CardStartContext>(
    () => ({ ...context, interactionEnabledAtMs: answerStartMs }),
    [context, answerStartMs],
  );

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
    context: answerContext,
    onResolve: handleResolve,
    now,
    timeoutSignals: () => ({
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      selected_option_id: selectedId ?? '',
      correct: false,
      elapsed: now() - answerStartMs,
    }),
  });

  const handleSelect = useCallback(
    (optionId: string) => {
      // Once resolved (by a selection or by timeout), further taps are inert.
      if (resolvedRef.current) return;

      const selectedAtMs = now();

      // First meaningful input in the answer phase: record the attempt exactly
      // once and capture time-to-interaction off the answer-phase origin.
      if (firstSelectionElapsedRef.current === null) {
        const tti = selectedAtMs - answerStartMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(optionId);

      // Single-choice: the first committed selection resolves the card. Route
      // through the pure evaluator (single source of truth) and resolve via the
      // hook to keep the single-fire guarantee + disarm the timer.
      const { isCorrect } = evaluateWhatChangedSelection(config, optionId);
      timer.resolve({
        cardId: card.cardId,
        resolutionType: isCorrect ? 'correct' : 'incorrect',
        isCorrect,
        elapsedMs: selectedAtMs - context.activeAtMs,
        interactionElapsedMs: selectedAtMs - answerStartMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_interaction: firstSelectionElapsedRef.current,
          selected_option_id: optionId,
          correct: isCorrect,
          elapsed: selectedAtMs - answerStartMs,
        },
      });
    },
    [card.cardId, config, context.activeAtMs, answerStartMs, now, onAttempt, timer],
  );

  // This renderer does not reveal correctness; the announcement names the chosen
  // option only.
  const selectedLabel = selectedId
    ? (config.options.find((option) => option.id === selectedId)?.label ?? null)
    : null;

  return (
    <>
      <PatternStrip
        label="The pattern now"
        pattern={config.afterPattern}
        testIdPrefix="wc-after"
      />
      <View
        testID="wc-options"
        accessibilityRole="radiogroup"
        accessibilityLabel="What changed? Pick one"
        style={styles.options}
      >
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              testID={`wc-option-${option.id}`}
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
        testID="wc-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {selectedLabel ? `Selected: ${selectedLabel}` : ''}
      </Text>
    </>
  );
}

/** A read-only strip of pattern tiles (preview or answer phase). */
function PatternStrip({
  label,
  pattern,
  testIdPrefix,
}: {
  label: string;
  pattern: string[];
  testIdPrefix: string;
}) {
  const theme = useGameTheme();
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.pattern,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {pattern.map((cell, index) => (
        <View
          key={`${testIdPrefix}-${index}`}
          testID={`${testIdPrefix}-${index}`}
          accessibilityLabel={`Position ${index + 1}: ${cell}`}
          style={[
            styles.tile,
            {
              backgroundColor: theme.surfaceRaised,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.tileText, { color: theme.accent }]}>{cell}</Text>
        </View>
      ))}
    </View>
  );
}

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
  pattern: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    width: '100%',
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  tile: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  tileText: {
    color: colors.text,
    fontSize: fontSize.xl,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    width: '100%',
  },
  // Options read as tappable chips/cards: elevated, rounded, generous targets.
  option: {
    flexBasis: '46%',
    flexGrow: 1,
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
