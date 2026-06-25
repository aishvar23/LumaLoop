/**
 * Word Unscramble renderer (Design §9; Technical Design §6, §7, §14).
 *
 * A pattern-recognition template, MCQ-shaped like tiny_logic: the scrambled
 * letters and the candidate words mount immediately, so interaction is enabled
 * at card start — the controller sets `interactionEnabledAtMs === activeAtMs`,
 * and `elapsedMs` / `interactionElapsedMs` share the same origin. There is no
 * preview or stream phase, so `isActive` is not needed to gate timing.
 *
 * Resolution semantics: a single committed choice resolves the card — correct
 * iff `correctOptionId`, otherwise incorrect (the wrong choice is the recorded
 * "distractor choice"). No retry affordance: a wrong commit resolves the card.
 * Correctness + the chosen distractor come from
 * {@link evaluateWordUnscrambleSelection} (the single source of truth), never
 * re-derived. The uniform feed-level FeedbackGate shows the explanation after
 * any resolution, so this renderer does not surface it.
 *
 * Timeout semantics: `config.timeLimitMs` is armed via the shared
 * {@link useCardTimer}; on expiry the card resolves TIMEOUT (`isCorrect: false`,
 * `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): the scrambled letters are exposed as a
 * labelled string; options are real `<button>`s, large, labelled, and
 * keyboard-focusable, with an explicit `aria-pressed` plus a polite
 * `role="status"` live region — never colour alone.
 */

import { useCallback, useRef, useState } from 'react';

import type { WordUnscrambleCard as WordUnscrambleCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateWordUnscrambleSelection } from './wordUnscrambleEvaluator';

export type WordUnscrambleCardProps =
  TemplateProps<WordUnscrambleCardType> & {
    now?: () => number;
  };

export default function WordUnscrambleCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: WordUnscrambleCardProps) {
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

      const { isCorrect, distractorOptionId } =
        evaluateWordUnscrambleSelection(config, optionId);

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

  // Display the scrambled letters spaced out so each one reads as its own tile.
  const scrambledDisplay = config.scrambled.split('').join(' ');

  return (
    <section aria-label="Word unscramble" style={sectionStyle}>
      <p
        data-testid="wu-scrambled"
        aria-label={`Scrambled letters: ${config.scrambled.split('').join(', ')}`}
        style={scrambledStyle}
      >
        {scrambledDisplay}
      </p>
      <div role="group" aria-label="Pick the unscrambled word" style={optionsStyle}>
        {config.options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`wu-option-${option.id}`}
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

const scrambledStyle = {
  margin: 0,
  fontSize: 'var(--font-size-xl, var(--font-size-lg))',
  fontWeight: 'var(--font-weight-bold)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textAlign: 'center',
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
