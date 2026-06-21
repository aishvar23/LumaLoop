/**
 * Rule Flip renderer (Design §9.3, §21.1; Technical Design §7, §14).
 *
 * A cognitive-flexibility template. Stimuli stream one at a time; the player
 * applies a rule (respond MATCH / NO-MATCH). Partway through, at
 * `flipAtStimulusIndex`, the rule FLIPS through a clear, non-colour cue. The
 * renderer runs in two phases it owns itself, because the controller sets
 * `interactionEnabledAtMs === activeAtMs` (preview/instruction offsets are a
 * renderer concern, exactly as `what_changed` documents):
 *
 *   Phase 1 — COMPREHENSION GATE (Design §21.1): the initial rule and a
 *     one-sentence instruction are shown with a single "Start" affordance. The
 *     measured stream does not begin — and the per-card timer does not arm —
 *     until the player intentionally starts, so the measured pre-flip accuracy
 *     reflects rule-switching ability rather than first-time confusion. This is
 *     the localized, renderer-owned slice of §21.1 (see SCOPE note below).
 *   Phase 2 — STREAM: stimuli advance on the configured `stimulusDurationMs`
 *     (shown) / `interStimulusGapMs` (blank) cadence using the renderer's OWN
 *     timers. At `flipAtStimulusIndex` the displayed rule switches to
 *     `flippedRuleLabel` with a perceivable "rule changed" banner + a polite
 *     live-region announcement. Each stimulus accepts one MATCH/NO-MATCH
 *     response; the first response fires `onAttempt` once. On stream completion
 *     the pure evaluator scores the run and the card resolves.
 *
 * SCOPE — §21.1 comprehension gate + "Estimate Fast" fallback: §21.1 is largely
 * a PRODUCT/validation concern — run a comprehension check with early testers
 * and, if Rule Flip is not understood without extra explanation, REPLACE it with
 * a simpler template (Estimate Fast) before the 7-day run. That swap is cross-
 * cutting: it lives at session composition / catalog level, depends on the
 * Estimate Fast template (a DEFERRED template, Design §9.5 — not built yet), and
 * is driven by tester data, not by a single card render. Those pieces are
 * intentionally OUT of this renderer's scope. What belongs here — and is
 * implemented — is the per-card comprehension gate that precedes the measured
 * stream. The cross-cutting swap/fallback is surfaced for a follow-up item.
 *
 * Timeout semantics (Design §9.3; Technical Design §7): `config.timeLimitMs`
 * bounds the measured STREAM. Mirroring `what_changed`, the shared
 * {@link useCardTimer} is mounted only once the stream begins (inside
 * {@link RuleFlipStream}), so its countdown origin is stream start, not card
 * start, and a timeout's `interactionElapsedMs` excludes the gate while
 * `elapsedMs` still runs from `context.activeAtMs`. A card left on the gate is
 * bounded by the session-level duration limit (Technical Design §8), a
 * controller concern, not the renderer's.
 *
 * Accessibility (Technical Design §14): MATCH/NO-MATCH and Start are real, large
 * (≥ `--tap-target-min`), labeled, keyboard-focusable `<button>`s; the rule and
 * its flip are conveyed by TEXT + an icon-bearing banner and announced through a
 * polite `role="status"` live region — never by colour alone.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { RuleFlipCard as RuleFlipCardType } from '../../cards/types';
import type { CardResolution, CardStartContext, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateRuleFlip,
  type RuleFlipEvaluation,
  type RuleFlipResponse,
  type RuleFlipResponseKind,
} from './ruleFlipEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<RuleFlipCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
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

  // Phase is the only render state the parent owns; the stream-start instant
  // lives in a ref so it survives without forcing a render (mirrors what_changed).
  const [phase, setPhase] = useState<Phase>('gate');
  const streamStartRef = useRef<number | null>(null);

  // The clock lives in a ref so the gate→stream transition reads the LATEST
  // `now` at the moment Start is pressed, guarding against stale closures.
  const nowRef = useRef(now);
  nowRef.current = now;

  const handleStart = useCallback(() => {
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <section aria-label="Rule flip" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
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
    </section>
  );
}

/**
 * The comprehension gate (Design §21.1, localized slice). Shows the initial rule
 * and a one-sentence instruction (Technical Design §14: no instruction longer
 * than one sentence), with a single Start affordance — the player's intentional
 * acknowledgement that they understand the rule before the measured stream and
 * its timer begin.
 */
function RuleFlipGate({
  initialRuleLabel,
  onStart,
}: {
  initialRuleLabel: string;
  onStart: () => void;
}) {
  return (
    <div style={gateStyle}>
      <p data-testid="rf-gate-rule" style={ruleLabelStyle}>
        Rule: {initialRuleLabel}
      </p>
      <p style={instructionStyle}>
        Tap Match when the item fits the rule, No-match when it does not.
      </p>
      <button
        type="button"
        data-testid="rf-start"
        onClick={onStart}
        style={primaryButtonStyle}
      >
        Start
      </button>
    </div>
  );
}

/**
 * The measured stream subtree. Mounted only once the gate is passed, so the
 * shared {@link useCardTimer} it arms counts `timeLimitMs` from stream start,
 * not card start. It drives the stimulus cadence with its own timers, switches
 * the displayed rule at `flipAtStimulusIndex`, captures one response per
 * stimulus, and resolves through the pure evaluator on completion (or via the
 * timer on overall timeout).
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
 * Stream step: either a stimulus is being SHOWN, a blank GAP is between stimuli,
 * or the stream is DONE. `visibleIndex`/`activeRule` are derived from this.
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

  // The stream begins on the first stimulus (or finishes immediately for an
  // empty — but well-formed catalog cards always have stimuli).
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
  // Mirrored into state purely to drive the polite live-region announcement.
  const [lastResponse, setLastResponse] = useState<RuleFlipResponseKind | null>(
    null,
  );

  const nowRef = useRef(now);
  nowRef.current = now;

  // Hand the timer a context whose interaction origin is STREAM start, so a
  // timeout's `interactionElapsedMs` measures from there (excluding the gate)
  // while `elapsedMs` still runs from `context.activeAtMs` (card start).
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
      // -1 is the "absent" sentinel (the signals map can't carry null): it means
      // no responded post-flip stimulus, so switch latency is undefined.
      // Downstream consumers MUST exclude -1 before averaging latencies.
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

  // Drive the stimulus cadence: each SHOW step lasts `stimulusDurationMs`, each
  // GAP lasts `interStimulusGapMs`, then the next stimulus shows or the stream
  // ends. Re-arms per step; once resolved (e.g. by timeout) it stops scheduling.
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
  // evaluator (the single source of truth) and the timer (single-fire + disarm).
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
      // Responses are only meaningful while a stimulus is visible (not in a gap
      // or after the stream ends).
      if (current === 'done' || current.mode !== 'show') return;
      const index = current.index;
      // One committed response per stimulus — later taps on the same stimulus
      // are inert (no double-count, no re-announce).
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
      // `attemptCount` here is card-level (one streamed attempt), matching the
      // single-answer templates — the granular per-stimulus engagement lives in
      // the accuracy/perseveration signals, not in attemptCount.
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
    <div style={streamStyle}>
      {/* Polite live region: announces the active rule so the FLIP is conveyed
          to assistive tech as a state change, never by the banner colour alone. */}
      <p role="status" aria-live="polite" data-testid="rf-rule" style={ruleLabelStyle}>
        {isFlipped ? `New rule: ${activeRuleLabel}` : `Rule: ${activeRuleLabel}`}
      </p>

      {isFlipped ? (
        // Perceivable, redundant cue for the flip: an icon + text banner, not a
        // colour swap. The leading glyph is decorative; the text carries meaning.
        <p data-testid="rf-flip-banner" style={flipBannerStyle}>
          <span aria-hidden="true">🔄 </span>
          Rule changed
        </p>
      ) : null}

      <div
        role="group"
        aria-label="Current stimulus"
        style={stimulusStageStyle}
      >
        {visibleIndex !== null ? (
          <span
            data-testid="rf-stimulus"
            data-stimulus-index={visibleIndex}
            style={stimulusStyle}
          >
            {stimuli[visibleIndex].label}
          </span>
        ) : (
          // Blank inter-stimulus gap: hold the layout without a stimulus.
          <span data-testid="rf-gap" aria-hidden="true" style={stimulusStyle} />
        )}
      </div>

      <div role="group" aria-label="Respond to the stimulus" style={responseRowStyle}>
        <button
          type="button"
          data-testid="rf-match"
          onClick={() => handleResponse('match')}
          style={responseButtonStyle}
        >
          Match
        </button>
        <button
          type="button"
          data-testid="rf-no-match"
          onClick={() => handleResponse('no_match')}
          style={responseButtonStyle}
        >
          No-match
        </button>
      </div>

      <p role="status" aria-live="polite" data-testid="rf-response" style={liveRegionStyle}>
        {lastResponse === null
          ? ''
          : `You answered: ${lastResponse === 'match' ? 'Match' : 'No-match'}`}
      </p>
    </div>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;

const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-hero)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-tight)',
  letterSpacing: '-0.01em',
} as const;

const gateStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
  width: '100%',
} as const;

const instructionStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  color: 'var(--color-text-muted)',
  lineHeight: 'var(--line-height-snug)',
} as const;

const streamStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  width: '100%',
} as const;

const ruleLabelStyle = {
  margin: 0,
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-snug)',
} as const;

const flipBannerStyle = {
  margin: 0,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '2px solid var(--color-warning)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-bold)',
} as const;

const stimulusStageStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(var(--tap-target-min) * 2)',
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
} as const;

const stimulusStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  fontSize: 'var(--font-size-xl)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-text)',
} as const;

const responseRowStyle = {
  display: 'flex',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const responseButtonStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const primaryButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3) var(--space-5)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-accent)',
  background: 'var(--color-accent)',
  color: 'var(--color-accent-contrast)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
