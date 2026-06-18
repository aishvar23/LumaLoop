/**
 * What Changed renderer (Design §9.2; Technical Design §7, §10, §14).
 *
 * A working-memory template. It runs in two phases the renderer owns itself,
 * because the controller sets `interactionEnabledAtMs === activeAtMs` and
 * documents that "preview-based offsets are a renderer concern":
 *
 *   Phase 1 — PREVIEW: `beforePattern` is shown for `config.previewMs`
 *     (~2-4s). Interaction is NOT yet enabled — the options are not even
 *     mounted, so a tap cannot do anything measurable.
 *   Phase 2 — ANSWER: after `previewMs` the renderer reveals `afterPattern`
 *     plus the options and records its OWN interaction-enabled instant. TTI and
 *     `interactionElapsedMs` are measured from THAT instant, not from
 *     `context.activeAtMs`, so the preview period does not penalize the player
 *     (Design §14: `Card_Attempted` starts when input is enabled).
 *
 * Timeout semantics (Design §9.2; Technical Design §7): `config.timeLimitMs`
 * covers the ANSWER phase only. The clean way to make the shared
 * {@link useCardTimer} arm at answer-phase start is to mount the timer-using
 * subtree ({@link WhatChangedAnswer}) only once the answer phase begins, so its
 * countdown origin is the answer phase rather than card start. The timer is
 * handed a context whose `interactionEnabledAtMs` is the answer-phase start, so
 * a timeout's `interactionElapsedMs` excludes the preview while `elapsedMs`
 * still runs from `context.activeAtMs` (card start).
 *
 * Resolution semantics (Design §9.2 — "User identifies what changed"; signals
 * "Correct identification rate" / "Error type"): this is a single-choice
 * identification, so the FIRST committed selection resolves the card — correct
 * if it is `correctOptionId`, otherwise incorrect (the wrong choice is the
 * recorded "Error type"). The docs describe no retry affordance, so there is no
 * "counted but non-fatal" path here, unlike Spot It's multi-tap search.
 *
 * Accessibility (Technical Design §14): options are real `<button>`s, large
 * (≥ `--tap-target-min`), labeled, and keyboard-focusable; selection state is
 * conveyed by an explicit `aria-pressed` on each option plus a polite
 * `role="status"` live region that announces the committed choice, never by
 * colour alone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WhatChangedCard as WhatChangedCardType } from '../../cards/types';
import type { CardResolution, CardStartContext, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateWhatChangedSelection } from './whatChangedEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<WhatChangedCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
 */
export type WhatChangedCardProps = TemplateProps<WhatChangedCardType> & {
  now?: () => number;
};

type Phase = 'preview' | 'answer';

export default function WhatChangedCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: WhatChangedCardProps) {
  const { config } = card;

  // Phase is the only piece of render state the parent owns; the answer-phase
  // start instant lives in a ref so it survives without forcing a render.
  const [phase, setPhase] = useState<Phase>('preview');
  const answerStartRef = useRef<number | null>(null);

  // The clock lives in a ref so the preview→answer transition reads the LATEST
  // `now` at expiry, mirroring how `useCardTimer` guards against stale closures.
  const nowRef = useRef(now);
  nowRef.current = now;

  // Preview → answer transition after `previewMs`. Interaction is enabled only
  // when this fires; that instant becomes the answer-phase timing origin.
  useEffect(() => {
    const id = setTimeout(() => {
      answerStartRef.current = nowRef.current();
      setPhase('answer');
    }, Math.max(0, config.previewMs));
    return () => clearTimeout(id);
  }, [config.previewMs]);

  return (
    <section aria-label="What changed" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
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
    </section>
  );
}

/**
 * The answer-phase subtree. Mounted only once the preview ends, so the shared
 * {@link useCardTimer} it arms counts `timeLimitMs` from the answer phase, not
 * from card start. It shows `afterPattern` and the options, and resolves on the
 * first committed selection.
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

  // Interaction bookkeeping lives in refs so selections don't depend on render
  // timing. `selectedId` is mirrored into state purely to drive the pressed
  // affordance + the polite live-region announcement.
  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Hand the timer a context whose interaction origin is the ANSWER-phase
  // start, so a timeout's `interactionElapsedMs` measures from there (excluding
  // the preview) while `elapsedMs` still runs from `context.activeAtMs`.
  const answerContext = useMemo<CardStartContext>(
    () => ({ ...context, interactionEnabledAtMs: answerStartMs }),
    [context, answerStartMs],
  );

  // Latch both resolution paths (own selection + the hook's timeout) so any
  // late selection is inert and cannot re-announce on a finished card.
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
    // Read at expiry: report how far the player got before the clock ran out.
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
      // through the pure evaluator (the single source of truth) and resolve via
      // the hook to keep the single-fire guarantee + disarm the timer.
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

  // The committed selection drives a polite live-region announcement so the
  // choice is conveyed to assistive tech without relying on the `aria-pressed`
  // visual state alone (Technical Design §14). This renderer does not reveal
  // correctness to the player, so the announcement names the chosen option only.
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
      <div role="group" aria-label="What changed? Pick one" style={optionsStyle}>
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`wc-option-${option.id}`}
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.id)}
              style={optionStyle}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {selectedLabel ? `Selected: ${selectedLabel}` : ''}
      </p>
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
  return (
    <div role="group" aria-label={label} style={patternStyle}>
      {pattern.map((cell, index) => (
        <span
          key={`${testIdPrefix}-${index}`}
          data-testid={`${testIdPrefix}-${index}`}
          aria-label={`Position ${index + 1}: ${cell}`}
          style={tileStyle}
        >
          <span aria-hidden="true">{cell}</span>
        </span>
      ))}
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
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  lineHeight: 'var(--line-height-snug)',
} as const;

const patternStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const tileStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
} as const;

const optionsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const optionStyle = {
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

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
