/**
 * Color Word (Stroop) renderer (Design §9; Technical Design §7, §14).
 *
 * A cognitive-flexibility template. A short SERIES of trials streams one at a
 * time; each shows a color WORD printed in a (usually mismatched) ink color, and
 * the player must respond to the INK by tapping the matching color swatch — not
 * the word. The renderer runs two phases it owns itself, because the controller
 * sets `interactionEnabledAtMs === activeAtMs` (instruction offsets are a
 * renderer concern, exactly as `what_changed`/`rule_flip` document):
 *
 *   Phase 1 — GATE: a one-sentence instruction + a single "Start" affordance.
 *     The measured stream — and the per-card timer — do not begin until the
 *     player intentionally starts, so accuracy reflects interference handling,
 *     not first-time confusion. The gate does NOT eat the time limit.
 *   Phase 2 — STREAM: trials advance on the configured `trialDurationMs` (shown)
 *     / `interTrialGapMs` (blank) cadence using the renderer's OWN timers. Each
 *     trial accepts one swatch pick; the first response fires `onAttempt` once.
 *     On completion the pure {@link evaluateColorWord} scores the run and the
 *     card resolves.
 *
 * isActive gating (Technical Design §7): the STREAM is auto-advancing, so it
 * MUST NOT run while the card is off-screen. The stream subtree mounts only after
 * the player presses Start (which can only happen on the focused slide), so a
 * pre-mounted off-screen card sits on the gate and never elapses; once active and
 * started, its own timers drive the cadence.
 *
 * Timeout semantics: `config.timeLimitMs` bounds the measured STREAM. The shared
 * {@link useCardTimer} is mounted only once the stream begins (inside
 * {@link ColorWordStream}), so its countdown origin is stream start, not card
 * start, and a timeout's `interactionElapsedMs` excludes the gate.
 *
 * Accessibility (Technical Design §14): swatches are real, large
 * (≥ `--tap-target-min`), LABELLED buttons (the label carries the meaning, never
 * the fill colour alone); a polite `role="status"` live region announces picks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ColorWordCard as ColorWordCardType } from '../../cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateColorWord,
  type ColorWordEvaluation,
  type ColorWordResponse,
} from './colorWordEvaluator';

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
  const [phase, setPhase] = useState<Phase>('gate');
  const streamStartRef = useRef<number | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  const handleStart = useCallback(() => {
    streamStartRef.current = nowRef.current();
    setPhase('stream');
  }, []);

  return (
    <section aria-label="Color word" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
      {phase === 'gate' ? (
        <div style={gateStyle}>
          <p style={instructionStyle}>
            Tap the colour the word is printed in — not the word itself.
          </p>
          <button
            type="button"
            data-testid="cw-start"
            onClick={handleStart}
            style={primaryButtonStyle}
          >
            Start
          </button>
        </div>
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
    </section>
  );
}

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
  const { colors, trials, trialDurationMs, interTrialGapMs } = config;

  const [step, setStep] = useState<StreamStep>(() =>
    trials.length > 0 ? { index: 0, mode: 'show' } : 'done',
  );

  const responsesRef = useRef<ColorWordResponse[]>([]);
  const respondedIndicesRef = useRef<Set<number>>(new Set());
  const trialShownAtRef = useRef<number>(streamStartMs);
  // The trial a swatch pick is currently attributed to. A trial stays answerable
  // from when it is shown THROUGH its trailing gap — the swatches remain on
  // screen and unchanged during the gap, so a player who taps the ink they just
  // saw a beat late must still have that pick counted (else a correct answer is
  // silently dropped to an omission). Reset when the NEXT trial shows or the
  // stream ends.
  const answerableIndexRef = useRef<number | null>(
    trials.length > 0 ? 0 : null,
  );
  const firstResponseRef = useRef(false);
  const firstResponseRtRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [lastPick, setLastPick] = useState<string | null>(null);

  const nowRef = useRef(now);
  nowRef.current = now;

  // Resolve a color id to its accessible label for announcements.
  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const color of colors) map.set(color.id, color.label);
    return map;
  }, [colors]);

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
      // -1 = no responses to average over; exclude before aggregating.
      mean_response_time_ms: evaluation.meanResponseTimeMs ?? -1,
      correct,
      // -1 = no interaction at all (player never responded).
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

  // Drive the trial cadence: each SHOW step lasts `trialDurationMs`, each GAP
  // lasts `interTrialGapMs`, then the next trial shows or the stream ends.
  useEffect(() => {
    if (resolvedRef.current || step === 'done') return undefined;

    if (step.mode === 'show') {
      trialShownAtRef.current = nowRef.current();
      // This trial is now the one a pick is attributed to (and remains so
      // through the following gap, until the next trial shows below).
      answerableIndexRef.current = step.index;
      const id = setTimeout(() => {
        setStep({ index: step.index, mode: 'gap' });
      }, Math.max(0, trialDurationMs));
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => {
      const next = step.index + 1;
      if (next >= trials.length) {
        // Stream ended: no trial is answerable anymore.
        answerableIndexRef.current = null;
      }
      setStep(next < trials.length ? { index: next, mode: 'show' } : 'done');
    }, Math.max(0, interTrialGapMs));
    return () => clearTimeout(id);
  }, [step, trialDurationMs, interTrialGapMs, trials.length]);

  // Resolve exactly once when the stream completes. Routes through the pure
  // evaluator (single source of truth) and the timer (single-fire + disarm).
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
      // The pick belongs to the trial currently answerable — the one shown,
      // still attributable through its trailing gap. Null only before the first
      // trial shows or after the stream ends.
      const index = answerableIndexRef.current;
      if (index === null) return;
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
      ? (colors.find((color) => color.id === trial.inkColorId)?.hex ??
        'var(--color-text)')
      : 'var(--color-text)';

  return (
    <div style={streamStyle}>
      <div role="group" aria-label="Current word" style={stimulusStageStyle}>
        {trial !== null ? (
          <span
            key={visibleIndex}
            data-testid="cw-word"
            data-trial-index={visibleIndex}
            // The swatch labels below carry the answer-relevant meaning; the
            // coloured word is the interfering stimulus.
            aria-label={`Word ${trial.word}, printed in a colour to identify`}
            style={{ ...stimulusWordStyle, color: inkHex }}
          >
            {trial.word}
          </span>
        ) : (
          <span
            data-testid="cw-gap"
            aria-hidden="true"
            style={stimulusWordStyle}
          />
        )}
      </div>

      <div role="group" aria-label="Pick the ink colour" style={swatchRowStyle}>
        {colors.map((color) => (
          <button
            key={color.id}
            type="button"
            data-testid={`cw-swatch-${color.id}`}
            aria-label={color.label}
            onClick={() => handlePick(color.id)}
            style={swatchButtonStyle}
          >
            <span
              aria-hidden="true"
              style={{ ...swatchChipStyle, background: color.hex }}
            />
            <span style={swatchLabelStyle}>{color.label}</span>
          </button>
        ))}
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="cw-pick"
        style={liveRegionStyle}
      >
        {lastPick === null ? '' : `You picked: ${lastPick}`}
      </p>
    </div>
  );
}

// ── Token-driven styles (no hardcoded sizes; Design tokens, #51) ──────────────
// NOTE: swatch fill colours are authored CONTENT (the Stroop ink), so they are
// the one place real hex values are intentional — the puzzle is about colour.

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
  minHeight: 'calc(var(--tap-target-min) * 2)',
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
} as const;

const stimulusWordStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  fontSize: 'var(--font-size-xl)',
  fontWeight: 'var(--font-weight-bold)',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.06em',
} as const;

const swatchRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(6rem, 1fr))',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const swatchButtonStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const swatchChipStyle = {
  width: '2rem',
  height: '2rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
} as const;

const swatchLabelStyle = {
  fontWeight: 'var(--font-weight-semibold)',
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
