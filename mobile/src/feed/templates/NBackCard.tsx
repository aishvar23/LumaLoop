/**
 * N-Back renderer — React Native (Design §9; Technical Design §7, §14; working_memory).
 *
 * Native rebuild of web `src/templates/nBack/NBackCard.tsx` — same behaviour and
 * signals, RN primitives instead of DOM. A working-memory template: items stream
 * one at a time; the player taps MATCH on any item equal to the one N steps back.
 * Two renderer-owned phases (the feed sets `interactionEnabledAtMs === activeAtMs`):
 *
 *   Phase 1 — GATE: a one-sentence instruction naming N + a single "Start". The
 *     measured stream — and the per-card timer — do not begin until Start.
 *   Phase 2 — STREAM: items advance on `itemDurationMs` (shown) / `interItemGapMs`
 *     (blank) using the renderer's OWN timers. MATCH is tappable only while an
 *     item is visible; the first fires `onAttempt` once. The renderer records the
 *     flagged POSITIONS and, on completion, routes them through the pure
 *     {@link evaluateNBack} (the single source of truth — it derives the true
 *     match set from the stream + N and scores hits/misses/false-alarms).
 *
 * isActive gating: the STREAM auto-advances, so it must not run off-screen. The
 * stream subtree mounts only after Start (which can only happen on the focused
 * slide), so a pre-mounted off-screen card sits on the gate and never elapses.
 *
 * Timeout semantics: `config.timeLimitMs` bounds the measured stream; the shared
 * {@link useCardTimer} mounts only once the stream begins, so its origin is
 * stream start and a timeout's `interactionElapsedMs` excludes the gate.
 *
 * Accessibility (Technical Design §14): MATCH and Start are real, large
 * (≥ {@link TAP_TARGET_MIN}), labelled buttons; the stream item is announced and
 * a polite live region reports flags.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NBackCard as NBackCardType } from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateNBack,
  type NBackEvaluation,
} from '../../core/templates/nBack/nBackEvaluator';
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

export type NBackCardProps = TemplateProps<NBackCardType> & {
  now?: () => number;
};

type Phase = 'gate' | 'stream';

export default function NBackCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: NBackCardProps) {
  const { config } = card;
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
    <View style={styles.section} accessibilityLabel="N-back">
      <Text style={styles.prompt}>{card.prompt}</Text>
      {phase === 'gate' ? (
        <View style={styles.gate}>
          <Text testID="nb-instruction" style={styles.instruction}>
            Tap Match whenever an item is the same as the one {config.n}{' '}
            {config.n === 1 ? 'step' : 'steps'} earlier.
          </Text>
          <Pressable
            testID="nb-start"
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
        <NBackStream
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
NBackCard.displayName = 'NBackCard';

type NBackStreamProps = {
  card: NBackCardType;
  context: CardStartContext;
  streamStartMs: number;
  onAttempt: TemplateProps<NBackCardType>['onAttempt'];
  onResolve: TemplateProps<NBackCardType>['onResolve'];
  now: () => number;
};

type StreamStep = { index: number; mode: 'show' | 'gap' } | 'done';

function NBackStream({
  card,
  context,
  streamStartMs,
  onAttempt,
  onResolve,
  now,
}: NBackStreamProps) {
  const { config } = card;
  const theme = useGameTheme();
  const { stream, n, itemDurationMs, interItemGapMs } = config;

  const [step, setStep] = useState<StreamStep>(() =>
    stream.length > 0 ? { index: 0, mode: 'show' } : 'done',
  );
  const stepRef = useRef<StreamStep>(step);
  stepRef.current = step;

  const flaggedRef = useRef<Set<number>>(new Set());
  const flaggedPerItemRef = useRef<Set<number>>(new Set());
  const firstFlagRef = useRef(false);
  const firstFlagRtRef = useRef<number | null>(null);
  const itemShownAtRef = useRef<number>(streamStartMs);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [flagCount, setFlagCount] = useState(0);

  const nowRef = useRef(now);
  nowRef.current = now;

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
    (evaluation: NBackEvaluation, correct: boolean, atMs: number) => ({
      n,
      hits: evaluation.hits,
      misses: evaluation.misses,
      false_alarms: evaluation.falseAlarms,
      correct_rejections: evaluation.correctRejections,
      total_matches: evaluation.totalMatches,
      accuracy: evaluation.accuracy,
      correct,
      time_to_interaction: firstFlagRtRef.current ?? -1,
      elapsed: atMs - streamStartMs,
    }),
    [n, streamStartMs],
  );

  const timer = useCardTimer({
    card,
    context: streamContext,
    onResolve: handleResolve,
    now,
    timeoutSignals: () =>
      buildSignals(
        evaluateNBack(config, flaggedRef.current),
        false,
        nowRef.current(),
      ),
  });

  useEffect(() => {
    if (resolvedRef.current || step === 'done') return undefined;

    if (step.mode === 'show') {
      itemShownAtRef.current = nowRef.current();
      flaggedPerItemRef.current = new Set();
      const id = setTimeout(() => {
        setStep({ index: step.index, mode: 'gap' });
      }, Math.max(0, itemDurationMs));
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      const next = step.index + 1;
      setStep(next < stream.length ? { index: next, mode: 'show' } : 'done');
    }, Math.max(0, interItemGapMs));
    return () => clearTimeout(id);
  }, [step, itemDurationMs, interItemGapMs, stream.length]);

  useEffect(() => {
    if (step !== 'done' || resolvedRef.current) return;
    const doneAtMs = nowRef.current();
    const evaluation = evaluateNBack(config, flaggedRef.current);
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

  const handleFlag = useCallback(() => {
    if (resolvedRef.current) return;
    const current = stepRef.current;
    if (current === 'done' || current.mode !== 'show') return;
    const index = current.index;
    if (flaggedPerItemRef.current.has(index)) return;
    flaggedPerItemRef.current.add(index);
    flaggedRef.current.add(index);
    setFlagCount(flaggedRef.current.size);

    const flaggedAtMs = nowRef.current();
    if (!firstFlagRef.current) {
      firstFlagRef.current = true;
      const rt = flaggedAtMs - streamStartMs;
      firstFlagRtRef.current = rt;
      onAttempt({ time_to_interaction: rt });
      attemptCountRef.current = timer.markAttempt();
    }
  }, [onAttempt, streamStartMs, timer]);

  const visibleIndex =
    step !== 'done' && step.mode === 'show' ? step.index : null;
  const item = visibleIndex !== null ? stream[visibleIndex] : null;
  const isFlaggedNow =
    visibleIndex !== null && flaggedPerItemRef.current.has(visibleIndex);

  return (
    <View style={styles.stream}>
      <View
        accessibilityLabel="Current item"
        style={[
          styles.stimulusStage,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {item !== null ? (
          <Text
            testID="nb-item"
            accessibilityLabel={`Item ${item}`}
            style={styles.stimulus}
          >
            {item}
          </Text>
        ) : (
          <Text testID="nb-gap" style={styles.stimulus} />
        )}
      </View>

      <View accessibilityLabel="Flag a match" style={styles.responseRow}>
        <Pressable
          testID="nb-match"
          accessibilityRole="button"
          accessibilityLabel="Match"
          accessibilityState={{ selected: isFlaggedNow }}
          onPress={handleFlag}
          style={({ pressed }) => [
            styles.matchButton,
            { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
            pressed && { backgroundColor: theme.surfaceStrong },
            isFlaggedNow && {
              backgroundColor: theme.surfaceStrong,
              borderColor: theme.accent,
            },
          ]}
        >
          <Text style={styles.matchButtonText}>Match</Text>
        </Pressable>
      </View>

      <Text
        testID="nb-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {flagCount > 0
          ? `Flagged ${flagCount} ${flagCount === 1 ? 'item' : 'items'}`
          : ''}
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
    minHeight: TAP_TARGET_MIN * 2.4,
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
  stimulus: {
    minHeight: TAP_TARGET_MIN,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 1,
  },
  responseRow: {
    flexDirection: 'row',
    gap: space.md,
    width: '100%',
  },
  matchButton: {
    flex: 1,
    minHeight: TAP_TARGET_MIN + 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  matchButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
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
