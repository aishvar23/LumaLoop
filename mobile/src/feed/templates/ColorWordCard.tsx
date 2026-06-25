/**
 * Color Word (Stroop) renderer — React Native (Design §9; Technical Design §7, §14).
 *
 * Native rebuild of web `src/templates/colorWord/ColorWordCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A cognitive-flexibility
 * template: a short SERIES of trials streams one at a time; each shows a colour
 * WORD printed in a (usually mismatched) ink colour, and the player responds to
 * the INK by tapping the matching swatch — not the word. Two renderer-owned
 * phases (the feed sets `interactionEnabledAtMs === activeAtMs`):
 *
 *   Phase 1 — GATE: a one-sentence instruction + a single "Start" affordance.
 *     The measured stream — and the per-card timer — do not begin until Start.
 *   Phase 2 — STREAM: trials advance on `trialDurationMs` (shown) /
 *     `interTrialGapMs` (blank) using the renderer's OWN timers. Each trial
 *     accepts one swatch pick; the first fires `onAttempt` once. On completion
 *     the pure {@link evaluateColorWord} scores the run and the card resolves.
 *
 * isActive gating: the STREAM auto-advances, so it must not run off-screen. The
 * stream subtree mounts only after Start (which can only happen on the focused
 * slide), so a pre-mounted off-screen card sits on the gate and never elapses.
 *
 * Timeout semantics: `config.timeLimitMs` bounds the measured stream; the shared
 * {@link useCardTimer} mounts only once the stream begins, so its origin is
 * stream start and a timeout's `interactionElapsedMs` excludes the gate.
 *
 * Accessibility (Technical Design §14): swatches are real, large
 * (≥ {@link TAP_TARGET_MIN}), LABELLED buttons (the label carries the meaning,
 * never the fill alone); a polite live region announces picks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ColorWordCard as ColorWordCardType } from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateColorWord,
  type ColorWordEvaluation,
  type ColorWordResponse,
} from '../../core/templates/colorWord/colorWordEvaluator';
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

export type ColorWordCardProps = TemplateProps<ColorWordCardType> & {
  now?: () => number;
};

type Phase = 'gate' | 'stream';

export default function ColorWordCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: ColorWordCardProps) {
  const theme = useGameTheme();
  const [phase, setPhase] = useState<Phase>('gate');
  const streamStartRef = useRef<number | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  const handleStart = useCallback(() => {
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <View style={styles.section} accessibilityLabel="Color word">
      <Text style={styles.prompt}>{card.prompt}</Text>
      {phase === 'gate' ? (
        <View style={styles.gate}>
          <Text style={styles.instruction}>
            Tap the colour the word is printed in — not the word itself.
          </Text>
          <Pressable
            testID="cw-start"
            accessibilityRole="button"
            accessibilityLabel="Start"
            onPress={handleStart}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accent, borderColor: theme.accent },
              pressed && { backgroundColor: theme.deep },
            ]}
          >
            <Text style={styles.primaryButtonText}>Start</Text>
          </Pressable>
        </View>
      ) : (
        <ColorWordStream
          card={card}
          context={context}
          // Non-null: the stream phase is only entered from `handleStart`, which
          // sets the ref before flipping the phase.
          streamStartMs={streamStartRef.current as number}
          onAttempt={onAttempt}
          onResolve={onResolve}
          now={now}
        />
      )}
    </View>
  );
}
ColorWordCard.displayName = 'ColorWordCard';

type ColorWordStreamProps = {
  card: ColorWordCardType;
  context: CardStartContext;
  streamStartMs: number;
  onAttempt: TemplateProps<ColorWordCardType>['onAttempt'];
  onResolve: TemplateProps<ColorWordCardType>['onResolve'];
  now: () => number;
};

type StreamStep = { index: number; mode: 'show' | 'gap' } | 'done';

function ColorWordStream({
  card,
  context,
  streamStartMs,
  onAttempt,
  onResolve,
  now,
}: ColorWordStreamProps) {
  const { config } = card;
  const theme = useGameTheme();
  const { colors: swatches, trials, trialDurationMs, interTrialGapMs } = config;

  const [step, setStep] = useState<StreamStep>(() =>
    trials.length > 0 ? { index: 0, mode: 'show' } : 'done',
  );
  const stepRef = useRef<StreamStep>(step);
  stepRef.current = step;

  const responsesRef = useRef<ColorWordResponse[]>([]);
  const respondedIndicesRef = useRef<Set<number>>(new Set());
  const trialShownAtRef = useRef<number>(streamStartMs);
  const firstResponseRef = useRef(false);
  const firstResponseRtRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [lastPick, setLastPick] = useState<string | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const swatch of swatches) map.set(swatch.id, swatch.label);
    return map;
  }, [swatches]);

  const streamContext = useMemo<CardStartContext>(
    () => ({ ...context, interactionEnabledAtMs: streamStartMs }),
    [context, streamStartMs],
  );

  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      onResolve(resolution);
    },
    [onResolve],
  );

  const buildSignals = useCallback(
    (evaluation: ColorWordEvaluation, correct: boolean, atMs: number) => ({
      overall_accuracy: evaluation.overallAccuracy,
      congruent_accuracy: evaluation.congruentAccuracy,
      incongruent_accuracy: evaluation.incongruentAccuracy,
      false_taps: evaluation.falseTaps,
      omissions: evaluation.omissions,
      mean_response_time_ms: evaluation.meanResponseTimeMs ?? -1,
      correct,
      time_to_interaction: firstResponseRtRef.current ?? -1,
      elapsed: atMs - streamStartMs,
    }),
    [streamStartMs],
  );

  const timer = useCardTimer({
    card,
    context: streamContext,
    onResolve: handleResolve,
    now,
    timeoutSignals: () =>
      buildSignals(
        evaluateColorWord(config, responsesRef.current),
        false,
        nowRef.current(),
      ),
  });

  useEffect(() => {
    if (resolvedRef.current || step === 'done') return undefined;

    if (step.mode === 'show') {
      trialShownAtRef.current = nowRef.current();
      const id = setTimeout(() => {
        setStep({ index: step.index, mode: 'gap' });
      }, Math.max(0, trialDurationMs));
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      const next = step.index + 1;
      setStep(next < trials.length ? { index: next, mode: 'show' } : 'done');
    }, Math.max(0, interTrialGapMs));
    return () => clearTimeout(id);
  }, [step, trialDurationMs, interTrialGapMs, trials.length]);

  useEffect(() => {
    if (step !== 'done' || resolvedRef.current) return;
    const doneAtMs = nowRef.current();
    const evaluation = evaluateColorWord(config, responsesRef.current);
    timer.resolve({
      cardId: card.cardId,
      resolutionType: evaluation.isCorrect ? 'correct' : 'incorrect',
      isCorrect: evaluation.isCorrect,
      elapsedMs: doneAtMs - context.activeAtMs,
      interactionElapsedMs: doneAtMs - streamStartMs,
      attemptCount: attemptCountRef.current,
      signals: buildSignals(evaluation, evaluation.isCorrect, doneAtMs),
    });
  }, [
    step,
    config,
    card.cardId,
    context.activeAtMs,
    streamStartMs,
    timer,
    buildSignals,
  ]);

  const handlePick = useCallback(
    (colorId: string) => {
      if (resolvedRef.current) return;
      const current = stepRef.current;
      if (current === 'done' || current.mode !== 'show') return;
      const index = current.index;
      if (respondedIndicesRef.current.has(index)) return;

      const respondedAtMs = nowRef.current();
      const rt = respondedAtMs - trialShownAtRef.current;
      respondedIndicesRef.current.add(index);
      responsesRef.current.push({
        trialIndex: index,
        pickedColorId: colorId,
        responseTimeMs: rt,
      });

      if (!firstResponseRef.current) {
        firstResponseRef.current = true;
        firstResponseRtRef.current = rt;
        onAttempt({ time_to_interaction: rt });
        attemptCountRef.current = timer.markAttempt();
      }

      setLastPick(labelById.get(colorId) ?? colorId);
    },
    [labelById, onAttempt, timer],
  );

  const visibleIndex =
    step !== 'done' && step.mode === 'show' ? step.index : null;
  const trial = visibleIndex !== null ? trials[visibleIndex] : null;
  const inkHex =
    trial !== null
      ? (swatches.find((swatch) => swatch.id === trial.inkColorId)?.hex ??
        colors.text)
      : colors.text;

  return (
    <View style={styles.stream}>
      <View
        accessibilityLabel="Current word"
        style={[
          styles.stimulusStage,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {trial !== null ? (
          <Text
            testID="cw-word"
            // The swatch labels carry the answer-relevant meaning; the coloured
            // word is the interfering stimulus.
            accessibilityLabel={`Word ${trial.word}, printed in a colour to identify`}
            style={[styles.stimulusWord, { color: inkHex }]}
          >
            {trial.word}
          </Text>
        ) : (
          <Text testID="cw-gap" style={styles.stimulusWord} />
        )}
      </View>

      <View
        accessibilityLabel="Pick the ink colour"
        style={styles.swatchRow}
      >
        {swatches.map((swatch) => (
          <Pressable
            key={swatch.id}
            testID={`cw-swatch-${swatch.id}`}
            accessibilityRole="button"
            accessibilityLabel={swatch.label}
            onPress={() => handlePick(swatch.id)}
            style={({ pressed }) => [
              styles.swatchButton,
              { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
              pressed && { borderColor: theme.accent },
            ]}
          >
            <View style={[styles.swatchChip, { backgroundColor: swatch.hex }]} />
            <Text style={styles.swatchLabel}>{swatch.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text
        testID="cw-pick"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {lastPick === null ? '' : `You picked: ${lastPick}`}
      </Text>
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
  gate: {
    gap: space.lg,
    alignItems: 'flex-start',
    width: '100%',
  },
  instruction: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: fontSize.md * lineHeight.normal,
  },
  stream: {
    gap: space.lg,
    width: '100%',
  },
  stimulusStage: {
    minHeight: TAP_TARGET_MIN * 2,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.card,
  },
  stimulusWord: {
    minHeight: TAP_TARGET_MIN,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
    letterSpacing: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    width: '100%',
  },
  swatchButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  swatchChip: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  primaryButton: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    ...elevation.tile,
  },
  primaryButtonText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
