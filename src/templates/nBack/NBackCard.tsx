/**
 * N-Back renderer (Design §9; Technical Design §7, §14; working_memory).
 *
 * A working-memory template. Items stream one at a time; the player taps MATCH on
 * any item equal to the one N steps back. The renderer runs two phases it owns
 * itself, because the controller sets `interactionEnabledAtMs === activeAtMs`
 * (instruction offsets are a renderer concern, exactly as `rule_flip` documents):
 *
 *   Phase 1 — GATE: a one-sentence instruction naming N + a single "Start"
 *     affordance. The measured stream — and the per-card timer — do not begin
 *     until the player intentionally starts; the gate does NOT eat the time limit.
 *   Phase 2 — STREAM: items advance on the configured `itemDurationMs` (shown) /
 *     `interItemGapMs` (blank) cadence using the renderer's OWN timers. MATCH is
 *     tappable only while an item is visible; the first tap fires `onAttempt`
 *     once. The renderer records the set of flagged POSITIONS and, on completion,
 *     routes them through the pure {@link evaluateNBack} (the single source of
 *     truth, which derives the true match set from the stream + N and scores
 *     hits/misses/false-alarms). The card then resolves.
 *
 * isActive gating (Technical Design §7): the STREAM auto-advances, so it must not
 * run off-screen. The stream subtree mounts only after Start (which can only
 * happen on the focused slide), so a pre-mounted off-screen card sits on the gate
 * and never elapses; once active and started, its own timers drive the cadence.
 *
 * Timeout semantics: `config.timeLimitMs` bounds the measured STREAM. The shared
 * {@link useCardTimer} mounts only once the stream begins (inside
 * {@link NBackStream}), so its countdown origin is stream start; a timeout's
 * `interactionElapsedMs` excludes the gate.
 *
 * Accessibility (Technical Design §14): MATCH and Start are real, large
 * (≥ `--tap-target-min`), labelled, keyboard-focusable buttons; the stream item
 * is announced and a polite `role="status"` live region reports flags.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NBackCard as NBackCardType } from '../../cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateNBack,
  type NBackEvaluation,
} from './nBackEvaluator';

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
  const [phase, setPhase] = useState<Phase>('gate');
  const streamStartRef = useRef<number | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  const handleStart = useCallback(() => {
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <section aria-label="N-back" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
      {phase === 'gate' ? (
        <div style={gateStyle}>
          <p data-testid="nb-instruction" style={instructionStyle}>
            Tap Match whenever an item is the same as the one {config.n}{' '}
            {config.n === 1 ? 'step' : 'steps'} earlier.
          </p>
          <button
            type="button"
            data-testid="nb-start"
            onClick={handleStart}
            style={primaryButtonStyle}
          >
            Start
          </button>
        </div>
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
    </section>
  );
}

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
  const { stream, n, itemDurationMs, interItemGapMs } = config;

  const [step, setStep] = useState<StreamStep>(() =>
    stream.length > 0 ? { index: 0, mode: 'show' } : 'done',
  );
  const stepRef = useRef<StreamStep>(step);
  stepRef.current = step;

  // The set of flagged stream positions — the renderer's only record; scoring is
  // derived from this by the pure evaluator.
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
      // -1 = no interaction at all (player never flagged anything).
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

  // Drive the item cadence with the renderer's own timers.
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

  // Resolve exactly once when the stream completes.
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
    // Flags are only meaningful while an item is visible (not in a gap or after
    // the stream ends).
    if (current === 'done' || current.mode !== 'show') return;
    const index = current.index;
    // One flag per item — repeated taps on the same item are inert.
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
    <div style={streamStyle}>
      <div role="group" aria-label="Current item" style={stimulusStageStyle}>
        {item !== null ? (
          <span
            key={visibleIndex}
            data-testid="nb-item"
            data-item-index={visibleIndex}
            aria-label={`Item ${item}`}
            style={stimulusStyle}
          >
            {item}
          </span>
        ) : (
          <span data-testid="nb-gap" aria-hidden="true" style={stimulusStyle} />
        )}
      </div>

      <div role="group" aria-label="Flag a match" style={responseRowStyle}>
        <button
          type="button"
          data-testid="nb-match"
          aria-pressed={isFlaggedNow}
          onClick={handleFlag}
          style={isFlaggedNow ? matchButtonActiveStyle : matchButtonStyle}
        >
          Match
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="nb-status"
        style={liveRegionStyle}
      >
        {flagCount > 0
          ? `Flagged ${flagCount} ${flagCount === 1 ? 'item' : 'items'}`
          : ''}
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

const stimulusStageStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(var(--tap-target-min) * 2.4)',
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
} as const;

const stimulusStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  fontSize: 'var(--font-size-xl)',
  fontWeight: 'var(--font-weight-bold)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-text)',
  letterSpacing: '0.04em',
} as const;

const responseRowStyle = {
  display: 'flex',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const matchButtonStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const matchButtonActiveStyle = {
  ...matchButtonStyle,
  border: '1px solid var(--accent, var(--color-accent))',
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
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
