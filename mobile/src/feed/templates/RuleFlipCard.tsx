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
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
export type RuleFlipCardProps = TemplateProps<RuleFlipCardType> & {
  now?: () => number;
};

type Phase = 'gate' | 'stream';
type DemoStep = 0 | 1 | 2;

const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';
const DEMO_STEP_MS = 1500;
const DEMO_CLOSE_MS = 5000;
const RULE_FLIP_DEMO_STEPS = [
  {
    rule: 'Filled circles match',
    stimulus: '●',
    answer: 'Match',
    note: 'The item fits the first rule.',
  },
  {
    rule: 'Rule changed: outlined squares match',
    stimulus: '○',
    answer: 'No-match',
    note: 'The rule flipped, so the old circle rule no longer applies.',
  },
  {
    rule: 'Rule changed: outlined squares match',
    stimulus: '□',
    answer: 'Match',
    note: 'Now the item fits the new rule.',
  },
] as const;

function responseCopy(response: RuleFlipResponseKind): string {
  return response === 'match' ? 'Match' : 'No-match';
}

function actionLogFor(
  config: RuleFlipCardType['config'],
  evaluation: RuleFlipEvaluation,
): string {
  return JSON.stringify(
    evaluation.outcomes.map((outcome) => {
      const stimulus = config.stimuli[outcome.stimulusIndex];
      return {
        step: outcome.stimulusIndex + 1,
        stimulusId: outcome.stimulusId,
        stimulus: stimulus?.label ?? outcome.stimulusId,
        phase: outcome.phase,
        activeRule: outcome.activeRule,
        expected: outcome.expectedResponse,
        response: outcome.response ?? 'omitted',
        correct: outcome.isCorrect,
        responseTimeMs: outcome.responseTimeMs ?? -1,
      };
    }),
  );
}

function firstFailureFor(
  config: RuleFlipCardType['config'],
  evaluation: RuleFlipEvaluation,
) {
  const outcome = evaluation.outcomes.find((candidate) => !candidate.isCorrect);
  if (!outcome) {
    return { failedStep: -1, failureReason: '' };
  }
  const stimulus = config.stimuli[outcome.stimulusIndex];
  const label = stimulus?.label ?? outcome.stimulusId;
  const ruleLabel =
    outcome.activeRule === 'initial'
      ? config.initialRuleLabel
      : config.flippedRuleLabel;
  const expected = responseCopy(outcome.expectedResponse);
  const failureReason = outcome.responded
    ? `Step ${outcome.stimulusIndex + 1} (${label}) was answered ${responseCopy(
        outcome.response as RuleFlipResponseKind,
      )}, but "${ruleLabel}" expected ${expected}.`
    : `Step ${outcome.stimulusIndex + 1} (${label}) was not answered; "${ruleLabel}" expected ${expected}.`;
  return { failedStep: outcome.stimulusIndex + 1, failureReason };
}

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
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(0);
  const [showYourTurn, setShowYourTurn] = useState(false);

  const nowRef = useRef(now);
  nowRef.current = now;

  const finishDemo = useCallback(() => {
    setDemoOpen(false);
    setDemoStep(0);
    setShowYourTurn(true);
  }, []);

  useEffect(() => {
    if (!demoOpen) return undefined;
    setDemoStep(0);
    const secondTimer = setTimeout(() => setDemoStep(1), DEMO_STEP_MS);
    const thirdTimer = setTimeout(() => setDemoStep(2), DEMO_STEP_MS * 2);
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(secondTimer);
      clearTimeout(thirdTimer);
      clearTimeout(closeTimer);
    };
  }, [demoOpen, finishDemo]);

  const handleDemo = useCallback(() => {
    setShowYourTurn(false);
    setDemoStep(0);
    setDemoOpen(true);
  }, []);

  const handleStart = useCallback(() => {
    setShowYourTurn(false);
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <View style={styles.section} accessibilityLabel="Rule flip">
      <Text style={styles.prompt}>{card.prompt}</Text>
      {phase === 'gate' ? (
        <RuleFlipGate
          initialRuleLabel={config.initialRuleLabel}
          showYourTurn={showYourTurn}
          onDemo={handleDemo}
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
      <RuleFlipDemo visible={demoOpen} step={demoStep} onClose={finishDemo} />
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
  showYourTurn,
  onDemo,
  onStart,
}: {
  initialRuleLabel: string;
  showYourTurn: boolean;
  onDemo: () => void;
  onStart: () => void;
}) {
  const theme = useGameTheme();
  return (
    <View style={styles.gate}>
      <Text testID="rf-gate-rule" style={styles.ruleLabel}>
        Rule: {initialRuleLabel}
      </Text>
      <Text style={styles.instruction}>
        Tap Match when the item fits the rule, No-match when it does not.
      </Text>
      {showYourTurn ? (
        <Text
          testID="rf-your-turn"
          accessibilityLiveRegion="polite"
          style={[styles.yourTurn, { borderColor: theme.accent, color: theme.accent }]}
        >
          Your turn — answer each item under the active rule.
        </Text>
      ) : null}
      <Pressable
        testID="rf-demo-button"
        accessibilityRole="button"
        accessibilityLabel="Watch Rule Flip demo"
        accessibilityHint={DEMO_TIME_HINT}
        onPress={onDemo}
        style={({ pressed }) => [
          styles.demoButton,
          { borderColor: theme.border },
          pressed && { backgroundColor: theme.surfaceStrong },
        ]}
      >
        <Text style={[styles.demoButtonText, { color: theme.accent }]}>
          Watch demo
        </Text>
      </Pressable>
      <Pressable
        testID="rf-start"
        accessibilityRole="button"
        accessibilityLabel="Start"
        onPress={onStart}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent, borderColor: theme.accent },
          pressed && { backgroundColor: theme.deep },
        ]}
      >
        <Text style={styles.primaryButtonText}>Start</Text>
      </Pressable>
    </View>
  );
}

function RuleFlipDemo({
  visible,
  step,
  onClose,
}: {
  visible: boolean;
  step: DemoStep;
  onClose: () => void;
}) {
  const theme = useGameTheme();
  const item = RULE_FLIP_DEMO_STEPS[step];
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={styles.demoBackdrop}
        accessibilityViewIsModal
        accessibilityLabel="Rule Flip demonstration"
      >
        <View style={styles.demoPanel}>
          <Text style={styles.demoTitle}>How Rule Flip works</Text>
          <Text
            testID="rf-demo-rule"
            accessibilityLiveRegion="polite"
            style={styles.ruleLabel}
          >
            {item.rule}
          </Text>
          <View
            testID="rf-demo-stimulus"
            style={[
              styles.demoStimulus,
              { borderColor: theme.border, backgroundColor: theme.surfaceRaised },
            ]}
          >
            <Text style={styles.demoStimulusText}>{item.stimulus}</Text>
          </View>
          <Text
            testID="rf-demo-answer"
            style={[styles.demoAnswer, { backgroundColor: theme.accent }]}
          >
            Demo taps: {item.answer}
          </Text>
          <Text testID="rf-demo-note" style={styles.demoInstruction}>
            {item.note}
          </Text>
          <Text style={styles.demoCaption}>
            Demo uses a separate pattern, not this card’s answer stream.
          </Text>
          <View style={styles.demoProgress} accessibilityElementsHidden>
            {[0, 1, 2].map((itemIndex) => (
              <View
                key={itemIndex}
                style={[
                  styles.demoDot,
                  {
                    backgroundColor:
                      itemIndex <= step ? theme.accent : colors.border,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable
            testID="rf-demo-skip"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.demoSkip}
          >
            <Text style={styles.demoSkipText}>Skip demo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  const theme = useGameTheme();
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
    (evaluation: RuleFlipEvaluation, correct: boolean, atMs: number) => {
      const failure = firstFailureFor(config, evaluation);
      return {
        pre_flip_accuracy: evaluation.preFlipAccuracy,
        post_flip_accuracy: evaluation.postFlipAccuracy,
        // -1 is the "absent" sentinel (the signals map can't carry null): no
        // responded post-flip stimulus, so switch latency is undefined. Downstream
        // consumers MUST exclude -1 before averaging latencies.
        switch_latency_ms: evaluation.switchLatencyMs ?? -1,
        perseveration: evaluation.perseverationCount,
        overall_accuracy: evaluation.overallAccuracy,
        correct,
        failed_step: failure.failedStep,
        failure_reason: failure.failureReason,
        step_action_log: actionLogFor(config, evaluation),
        // -1 = no interaction at all (player never responded); exclude before averaging.
        time_to_interaction: firstResponseRtRef.current ?? -1,
        elapsed: atMs - streamStartMs,
      };
    },
    [config, streamStartMs],
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
        style={[
          styles.stimulusStage,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
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
          style={({ pressed }) => [
            styles.responseButton,
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
          <Text style={styles.responseButtonText}>Match</Text>
        </Pressable>
        <Pressable
          testID="rf-no-match"
          accessibilityRole="button"
          accessibilityLabel="No-match"
          onPress={() => handleResponse('no_match')}
          style={({ pressed }) => [
            styles.responseButton,
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
  yourTurn: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  demoButton: {
    minHeight: TAP_TARGET_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  stream: {
    gap: space.lg,
    width: '100%',
  },
  ruleLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  flipBanner: {
    alignSelf: 'flex-start',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 177, 76, 0.12)',
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    overflow: 'hidden',
  },
  // A deliberate, elevated stage that frames the streaming stimulus.
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
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  responseRow: {
    flexDirection: 'row',
    gap: space.md,
    width: '100%',
  },
  responseButton: {
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
  responseButtonPressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
    transform: [{ scale: 0.97 }],
  },
  responseButtonText: {
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
  primaryButtonPressed: {
    backgroundColor: colors.accentDeep,
    transform: [{ scale: 0.97 }],
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
  demoBackdrop: {
    flex: 1,
    padding: space.xl,
    backgroundColor: 'rgba(4,6,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPanel: {
    width: '100%',
    maxWidth: 360,
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#151923',
    ...elevation.card,
  },
  demoTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
  },
  demoStimulus: {
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoStimulusText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
  },
  demoAnswer: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    overflow: 'hidden',
  },
  demoInstruction: {
    minHeight: 44,
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  demoCaption: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  demoProgress: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: space.sm,
  },
  demoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demoSkip: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoSkipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
