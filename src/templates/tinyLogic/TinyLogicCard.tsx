/**
 * Tiny Logic renderer (Design §9.4; Technical Design §6, §7, §14).
 *
 * A logical-reasoning template and the simplest one: a single phase, no preview
 * and no stream. The stem and its options mount immediately, so interaction is
 * enabled at card start — the controller sets `interactionEnabledAtMs ===
 * activeAtMs`, and `elapsedMs` and `interactionElapsedMs` therefore share the
 * same origin (unlike `what_changed`, whose preview offsets the two). This is
 * essentially the What Changed ANSWER phase without the preview.
 *
 * Resolution semantics (Design §9.4 — "one-move logic choice"; "User selects
 * the correct answer"): this is a single committed choice, so the FIRST selection
 * resolves the card — correct if it is `correctOptionId`, otherwise incorrect
 * (the wrong choice is the recorded "distractor choice"). The docs describe no
 * retry affordance, so there is no second-attempt path: a wrong commit resolves
 * the card and reveals the explanation as post-resolution feedback rather than
 * re-arming for another guess.
 *
 * Explanation-after-error (Design §9.4 — "Explanation viewed after error"): the
 * card's `explanation` (title + body) is shown ONLY when the committed choice is
 * wrong. A correct choice resolves silently with no explanation, matching the
 * design signal "explanation viewed after error".
 *
 * Timeout semantics (Design §9.4; Technical Design §7): `config.timeLimitMs` is
 * armed on mount via the shared {@link useCardTimer}; on expiry it resolves the
 * card as a TIMEOUT (`isCorrect: false`, `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): options are real `<button>`s, large
 * (≥ `--tap-target-min`), labeled, and keyboard-focusable; selection state is
 * conveyed by an explicit `aria-pressed` on each option plus a polite
 * `role="status"` live region that announces the committed choice and result,
 * never by colour alone.
 */

import { useCallback, useRef, useState } from 'react';

import type { TinyLogicCard as TinyLogicCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateTinyLogicSelection } from './tinyLogicEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<TinyLogicCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
 */
export type TinyLogicCardProps = TemplateProps<TinyLogicCardType> & {
  now?: () => number;
};

export default function TinyLogicCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: TinyLogicCardProps) {
  const { config } = card;

  // Interaction bookkeeping lives in refs so selections don't depend on render
  // timing. `selectedId` / `showExplanation` are mirrored into state purely to
  // drive the pressed affordance, the live-region announcement, and the
  // explanation-after-error reveal.
  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

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
    context,
    onResolve: handleResolve,
    now,
    // Read at expiry: report how far the player got before the clock ran out.
    // A timeout is never a distractor choice, so `distractor_option_id` is empty.
    timeoutSignals: () => ({
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      selected_option_id: selectedId ?? '',
      distractor_option_id: '',
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handleSelect = useCallback(
    (optionId: string) => {
      // Once resolved (by a selection or by timeout), further taps are inert.
      if (resolvedRef.current) return;

      const selectedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-interaction from the (single-phase) interaction origin.
      if (firstSelectionElapsedRef.current === null) {
        const tti = selectedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(optionId);

      // Single-choice: the first committed selection resolves the card. Route
      // through the pure evaluator (the single source of truth) for correctness
      // and the chosen distractor, then resolve via the hook to keep the
      // single-fire guarantee + disarm the timer.
      const { isCorrect, distractorOptionId } = evaluateTinyLogicSelection(
        config,
        optionId,
      );

      // Explanation-after-error: reveal the explanation only on a wrong commit.
      if (!isCorrect) setShowExplanation(true);

      timer.resolve({
        cardId: card.cardId,
        resolutionType: isCorrect ? 'correct' : 'incorrect',
        isCorrect,
        elapsedMs: selectedAtMs - context.activeAtMs,
        interactionElapsedMs: selectedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_interaction: firstSelectionElapsedRef.current,
          selected_option_id: optionId,
          // The chosen distractor (Design §9.4) — empty when the choice is right.
          distractor_option_id: distractorOptionId ?? '',
          correct: isCorrect,
          elapsed: selectedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      config,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      now,
      onAttempt,
      timer,
    ],
  );

  // The committed selection drives a polite live-region announcement so the
  // choice — and, since the explanation reveals correctness on error, the
  // result — is conveyed to assistive tech without relying on the `aria-pressed`
  // visual state or colour alone (Technical Design §14).
  const selectedLabel = selectedId
    ? (config.options.find((option) => option.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.correctOptionId
      ? `Correct: ${selectedLabel}`
      : `Selected: ${selectedLabel}. See the explanation below.`;

  return (
    <section aria-label="Tiny logic" style={sectionStyle}>
      <p data-testid="tl-stem" style={stemStyle}>
        {config.stem}
      </p>
      <div role="group" aria-label="Pick the correct answer" style={optionsStyle}>
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`tl-option-${option.id}`}
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
        {resultText}
      </p>
      {showExplanation ? (
        <aside
          data-testid="tl-explanation"
          aria-label="Explanation"
          style={explanationStyle}
        >
          <p style={explanationTitleStyle}>{card.explanation.title}</p>
          <p style={explanationBodyStyle}>{card.explanation.body}</p>
        </aside>
      ) : null}
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;

const stemStyle = {
  margin: 0,
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  lineHeight: 'var(--line-height-snug)',
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

const explanationStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
} as const;

const explanationTitleStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-text)',
} as const;

const explanationBodyStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  lineHeight: 'var(--line-height-normal)',
  color: 'var(--color-text)',
} as const;
