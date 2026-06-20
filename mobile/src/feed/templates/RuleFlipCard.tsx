/**
 * Rule Flip renderer — React Native (ADO #128; Design §9.3, §21.1; Technical
 * Design §7, §14).
 *
 * Native rebuild of web `src/templates/ruleFlip/RuleFlipCard.tsx` — same behaviour
 * and signals, RN primitives instead of DOM. A cognitive-flexibility template:
 * stimuli stream one at a time; the player applies a rule (respond MATCH /
 * NO-MATCH). Partway through, at `flipAtStimulusIndex`, the rule FLIPS through a
 * clear, non-colour cue. Two renderer-owned phases (the feed sets
 * `interactionEnabledAtMs === activeAtMs`, so gate/stream offsets are local):
 *
 *   Phase 1 — COMPREHENSION GATE (Design §21.1, localized slice): the initial rule
 *     and a one-sentence instruction with a single "Start" affordance. The measured
 *     stream — and the per-card timer — do not begin until the player starts, so
 *     pre-flip accuracy reflects rule-switching ability, not first-time confusion.
 *     The gate does NOT eat the time limit (the timer arms at stream start).
 *   Phase 2 — STREAM: stimuli advance on the configured `stimulusDurationMs`
 *     (shown) / `interStimulusGapMs` (blank) cadence using the renderer's OWN
 *     timers. The initial rule applies for indices `< flipAtStimulusIndex`; the
 *     flipped rule at/after it, with a perceivable "rule changed" banner + a polite
 *     announcement. Each stimulus accepts one MATCH/NO-MATCH response; the first
 *     fires `onAttempt` once. On completion the pure {@link evaluateRuleFlip} scores
 *     the run (pre/post accuracy, switch latency, perseveration; the -1 sentinel for
 *     absent latency stays in the evaluator/signal layer) and the card resolves.
 *
 * Timeout semantics (Design §9.3; Technical Design §7): `config.timeLimitMs` bounds
 * the measured STREAM. The shared {@link useCardTimer} is mounted only once the
 * stream begins (inside {@link RuleFlipStream}), so its countdown origin is stream
 * start, not card start; a timeout's `interactionElapsedMs` excludes the gate.
 *
 * Accessibility (Technical Design §14): MATCH/NO-MATCH and Start are real, large
 * (≥ {@link TAP_TARGET_MIN}), labelled buttons; the rule and its flip are conveyed
 * by TEXT + a banner and announced through a polite live region — never colour.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RuleFlipCard as RuleFlipCardType } from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateRuleFlip,
  type RuleFlipEvaluation,
  type RuleFlipResponse,
  type RuleFlipResponseKind,
} from '../../core/templates/ruleFlip/ruleFlipEvaluator';
import { colors, fontSize, radius, space, TAP_TARGET_MIN } from './tokens';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional injectable
 * `now` clock; the optional prop keeps it assignable to the registry slot while
 * staying testable under fake timers.
 */
export type RuleFlipCardProps = TemplateProps<RuleFlipCardType> & {
  now?: () => number;
};

type Phase = 'gate' | 'stream';

export default function RuleFlipCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: RuleFlipCardProps) {
  const { config } = card;

  // Phase is the only render state the parent owns; the stream-start instant lives
  // in a ref so it survives without forcing a render (mirrors what_changed).
  const [phase, setPhase] = useState<Phase>('gate');
  const streamStartRef = useRef<number | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  const handleStart = useCallback(() => {
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <View style={styles.section} accessibilityLabel="Rule flip">
      <Text style={styles.prompt}>{card.prompt}</Text>
      {phase === 'gate' ? (
        <RuleFlipGate
          initialRuleLabel={config.initialRuleLabel}
          onStart={handleStart}
        />
      ) : (
        <RuleFlipStream
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
RuleFlipCard.displayName = 'RuleFlipCard';

/**
 * The comprehension gate (Design §21.1, localized slice). Shows the initial rule
 * and a one-sentence instruction with a single Start affordance — the player's
 * intentional acknowledgement before the measured stream and its timer begin.
 */
function RuleFlipGate({
  initialRuleLabel,
  onStart,
}: {
  initialRuleLabel: string;
  onStart: () => void;
}) {
  return (
    <View style={styles.gate}>
      <Text testID="rf-gate-rule" style={styles.ruleLabel}>
        Rule: {initialRuleLabel}
      </Text>
      <Text style={styles.instruction}>
        Tap Match when the item fits the rule, No-match when it does not.
      </Text>
      <Pressable
        testID="rf-start"
        accessibilityRole="button"
        accessibilityLabel="Start"
        onPress={onStart}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Start</Text>
      </Pressable>
    </View>
  );
}

/**
 * The measured stream subtree. Mounted only once the gate is passed, so the shared
 * {@link useCardTimer} it arms counts `timeLimitMs` from stream start. It drives the
 * stimulus cadence with its own timers, switches the displayed rule at
 * `flipAtStimulusIndex`, captures one response per stimulus, and resolves through
 * the pure evaluator on completion (or via the timer on overall timeout).
 */
type RuleFlipStreamProps = {
  card: RuleFlipCardType;
  context: CardStartContext;
  streamStartMs: number;
  onAttempt: TemplateProps<RuleFlipCardType>['onAttempt'];
  onResolve: TemplateProps<RuleFlipCardType>['onResolve'];
  now: () => number;
};

/**
 * Stream step: either a stimulus is being SHOWN, a blank GAP is between stimuli, or
 * the stream is DONE. `visibleIndex`/`activeRule` are derived from this.
 */
type StreamStep = { index: number; mode: 'show' | 'gap' } | 'done';

function RuleFlipStream({
  card,
  context,
  streamStartMs,
  onAttempt,
  onResolve,
  now,
}: RuleFlipStreamProps) {
  const { config } = card;
  const {
    stimuli,
    flipAtStimulusIndex,
    stimulusDurationMs,
    interStimulusGapMs,
    initialRuleLabel,
    flippedRuleLabel,
  } = config;

  // The stream begins on the first stimulus (well-formed catalog cards always have
  // stimuli; an empty list finishes immediately).
  const [step, setStep] = useState<StreamStep>(() =>
    stimuli.length > 0 ? { index: 0, mode: 'show' } : 'done',
  );
  const stepRef = useRef<StreamStep>(step);
  stepRef.current = step;

  // Interaction bookkeeping lives in refs so responses don't depend on render
  // timing. Responses accumulate here and feed the pure evaluator verbatim.
  const responsesRef = useRef<RuleFlipResponse[]>([]);
  const respondedIndicesRef = useRef<Set<number>>(new Set());
  const stimulusShownAtRef = useRef<number>(streamStartMs);
  const firstResponseRef = useRef(false);
  const firstResponseRtRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  // Mirrored into state purely to drive the polite announcement.
  const [lastResponse, setLastResponse] = useState<RuleFlipResponseKind | null>(
    null,
  );

  const nowRef = useRef(now);
  nowRef.current = now;

  // Hand the timer a context whose interaction origin is STREAM start, so a
  // timeout's `interactionElapsedMs` measures from there (excluding the gate) while
  // `elapsedMs` still runs from `context.activeAtMs` (card start).
  const streamContext = useMemo<CardStartContext>(
    () => ({ ...context, interactionEnabledAtMs: streamStartMs }),
    [context, streamStartMs],
  );

  // Latch both resolution paths (stream completion + the hook's timeout) so any
  // late response is inert and cannot re-announce on a finished card.
  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      onResolve(resolution);
    },
    [onResolve],
  );

  // Build the §9.3 signal set from an evaluation. Shared by the completion and
  // timeout paths so the two never drift; `correct` is forced by the caller (a
  // timeout is incorrect by contract regardless of partial accuracy).
  const buildSignals = useCallback(
    (evaluation: RuleFlipEvaluation, correct: boolean, atMs: number) => ({
      pre_flip_accuracy: evaluation.preFlipAccuracy,
      post_flip_accuracy: evaluation.postFlipAccuracy,
      // -1 is the "absent" sentinel (the signals map can't carry null): no
      // responded post-flip stimulus, so switch latency is undefined. Downstream
      // consumers MUST exclude -1 before averaging latencies.
      switch_latency_ms: evaluation.switchLatencyMs ?? -1,
      perseveration: evaluation.perseverationCount,
      overall_accuracy: evaluation.overallAccuracy,
      correct,
      // -1 = no interaction at all (player never responded); exclude before averaging.
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
    // Read at expiry: score whatever the player committed before the clock ran
    // out. A timeout is incorrect by contract, so `correct` is forced false.
    timeoutSignals: () =>
      buildSignals(
        evaluateRuleFlip(config, responsesRef.current),
        false,
        nowRef.current(),
      ),
  });

  // Drive the stimulus cadence: each SHOW step lasts `stimulusDurationMs`, each GAP
  // lasts `interStimulusGapMs`, then the next stimulus shows or the stream ends.
  // Re-arms per step; once resolved (e.g. by timeout) it stops scheduling.
  useEffect(() => {
    if (resolvedRef.current || step === 'done') return undefined;

    if (step.mode === 'show') {
      // This stimulus is now visible — capture its onset for RT math.
      stimulusShownAtRef.current = nowRef.current();
      const id = setTimeout(() => {
        setStep({ index: step.index, mode: 'gap' });
      }, Math.max(0, stimulusDurationMs));
      return () => clearTimeout(id);
    }

    // Blank gap, then advance to the next stimulus or finish.
    const id = setTimeout(() => {
      const next = step.index + 1;
      setStep(next < stimuli.length ? { index: next, mode: 'show' } : 'done');
    }, Math.max(0, interStimulusGapMs));
    return () => clearTimeout(id);
  }, [step, stimulusDurationMs, interStimulusGapMs, stimuli.length]);

  // Resolve exactly once when the stream completes. Routes through the pure
  // evaluator (single source of truth) and the timer (single-fire + disarm).
  useEffect(() => {
    if (step !== 'done' || resolvedRef.current) return;
    const doneAtMs = nowRef.current();
    const evaluation = evaluateRuleFlip(config, responsesRef.current);
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

  const handleResponse = useCallback(
    (kind: RuleFlipResponseKind) => {
      if (resolvedRef.current) return;
      const current = stepRef.current;
      // Responses are only meaningful while a stimulus is visible (not in a gap or
      // after the stream ends).
      if (current === 'done' || current.mode !== 'show') return;
      const index = current.index;
      // One committed response per stimulus — later taps on the same stimulus are
      // inert (no double-count, no re-announce).
      if (respondedIndicesRef.current.has(index)) return;

      const respondedAtMs = nowRef.current();
      const rt = respondedAtMs - stimulusShownAtRef.current;
      respondedIndicesRef.current.add(index);
      responsesRef.current.push({
        stimulusIndex: index,
        response: kind,
        responseTimeMs: rt,
      });

      // First meaningful input across the whole stream: record the attempt once.
      if (!firstResponseRef.current) {
        firstResponseRef.current = true;
        firstResponseRtRef.current = rt;
        onAttempt({ time_to_interaction: rt });
        attemptCountRef.current = timer.markAttempt();
      }

      setLastResponse(kind);
    },
    [onAttempt, timer],
  );

  // Derive what is on screen and which rule is active from the single step. The
  // active rule tracks the current index (held through the trailing gap so the
  // label does not flicker back between the last stimulus and resolution).
  const visibleIndex =
    step !== 'done' && step.mode === 'show' ? step.index : null;
  const currentIndex =
    step === 'done' ? Math.max(0, stimuli.length - 1) : step.index;
  const isFlipped = currentIndex >= flipAtStimulusIndex;
  const activeRuleLabel = isFlipped ? flippedRuleLabel : initialRuleLabel;

  return (
    <View style={styles.stream}>
      {/* Polite live region: announces the active rule so the FLIP is conveyed as
          a state change, never by the banner colour alone. */}
      <Text
        testID="rf-rule"
        accessibilityLiveRegion="polite"
        style={styles.ruleLabel}
      >
        {isFlipped ? `New rule: ${activeRuleLabel}` : `Rule: ${activeRuleLabel}`}
      </Text>

      {isFlipped ? (
        // Perceivable, redundant cue for the flip: an icon + text banner, not a
        // colour swap. The leading glyph is decorative; the text carries meaning.
        <Text testID="rf-flip-banner" style={styles.flipBanner}>
          🔄 Rule changed
        </Text>
      ) : null}

      <View
        accessibilityLabel="Current stimulus"
        style={styles.stimulusStage}
      >
        {visibleIndex !== null ? (
          <Text
            testID="rf-stimulus"
            accessibilityLabel={stimuli[visibleIndex].label}
            style={styles.stimulus}
          >
            {stimuli[visibleIndex].label}
          </Text>
        ) : (
          // Blank inter-stimulus gap: hold the layout without a stimulus.
          <Text testID="rf-gap" style={styles.stimulus} />
        )}
      </View>

      <View style={styles.responseRow} accessibilityLabel="Respond to the stimulus">
        <Pressable
          testID="rf-match"
          accessibilityRole="button"
          accessibilityLabel="Match"
          onPress={() => handleResponse('match')}
          style={styles.responseButton}
        >
          <Text style={styles.responseButtonText}>Match</Text>
        </Pressable>
        <Pressable
          testID="rf-no-match"
          accessibilityRole="button"
          accessibilityLabel="No-match"
          onPress={() => handleResponse('no_match')}
          style={styles.responseButton}
        >
          <Text style={styles.responseButtonText}>No-match</Text>
        </Pressable>
      </View>

      <Text
        testID="rf-response"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {lastResponse === null
          ? ''
          : `You answered: ${lastResponse === 'match' ? 'Match' : 'No-match'}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  gate: {
    gap: space.md,
    alignItems: 'flex-start',
    width: '100%',
  },
  instruction: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  stream: {
    gap: space.md,
    width: '100%',
  },
  ruleLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  flipBanner: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stimulusStage: {
    minHeight: TAP_TARGET_MIN * 2,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stimulus: {
    minHeight: TAP_TARGET_MIN,
    fontSize: fontSize.xl,
    color: colors.text,
    textAlign: 'center',
  },
  responseRow: {
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
  },
  responseButton: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  responseButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  primaryButton: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
