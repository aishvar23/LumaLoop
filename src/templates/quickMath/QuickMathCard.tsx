/**
 * Quick Math renderer (Design §9; Technical Design §6, §7, §14).
 *
 * A logical-reasoning (numerical) template, MCQ-shaped like tiny_logic: the
 * equation and the numeric options mount immediately, so interaction is enabled
 * at card start — the controller sets `interactionEnabledAtMs === activeAtMs`,
 * and `elapsedMs` / `interactionElapsedMs` share the same origin. No preview or
 * stream phase, so `isActive` is not needed to gate timing.
 *
 * Resolution semantics: a single committed choice resolves the card. Correctness
 * is decided by {@link evaluateQuickMathSelection}, which COMPUTES the canonical
 * value from the structured expression (the single source of truth) and checks
 * the chosen option's value against it — the renderer never compares numbers
 * itself. A wrong commit resolves the card (its choice is the recorded
 * distractor); the uniform feed-level FeedbackGate shows the explanation after
 * any resolution.
 *
 * Timeout semantics: `config.timeLimitMs` is armed via the shared
 * {@link useCardTimer}; on expiry the card resolves TIMEOUT.
 *
 * Accessibility (Technical Design §14): the equation is exposed as a labelled
 * string; options are real `<button>`s, large, labelled, and keyboard-focusable,
 * with `aria-pressed` plus a polite `role="status"` live region — never colour
 * alone.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { orderOptions } from '../../cards/optionOrder';
import type { QuickMathCard as QuickMathCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateQuickMathSelection } from './quickMathEvaluator';

export type QuickMathCardProps = TemplateProps<QuickMathCardType> & {
  now?: () => number;
};

export default function QuickMathCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: QuickMathCardProps) {
  const { config } = card;

  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      if (resolvedRef.current) return;

      const selectedAtMs = now();

      if (firstSelectionElapsedRef.current === null) {
        const tti = selectedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(optionId);

      const { isCorrect, distractorOptionId } = evaluateQuickMathSelection(
        config,
        optionId,
      );

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

  const selectedLabel = selectedId
    ? (config.options.find((option) => option.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.correctOptionId
      ? `Correct: ${selectedLabel}`
      : `Incorrect: ${selectedLabel}.`;

  // Present options in a deterministic, card-seeded order so the correct answer
  // is not positionally guessable (it is keyed by `correctOptionId`, not slot).
  // Stable across renders and identical on web↔mobile.
  const orderedOptions = useMemo(
    () => orderOptions(card.cardId, config.options),
    [card.cardId, config.options],
  );

  return (
    <section aria-label="Quick math" style={sectionStyle}>
      <p
        data-testid="qm-display"
        aria-label={`Solve: ${config.display}`}
        style={displayStyle}
      >
        {config.display} = ?
      </p>
      <div role="group" aria-label="Pick the answer" style={optionsStyle}>
        {orderedOptions.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`qm-option-${option.id}`}
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.id)}
              style={isSelected ? optionSelectedStyle : optionStyle}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {resultText}
      </p>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes) ──────────────────────────

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;

const displayStyle = {
  margin: 0,
  fontSize: 'var(--font-size-xl, var(--font-size-lg))',
  fontWeight: 'var(--font-weight-bold)',
  textAlign: 'center',
  letterSpacing: '0.04em',
  color: 'var(--color-text)',
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
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const optionSelectedStyle = {
  ...optionStyle,
  border: '1px solid var(--accent, var(--color-accent))',
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
