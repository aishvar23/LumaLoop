/**
 * Matrix Reasoning renderer — a Raven's-style VISUAL reasoning game.
 *
 * A 3×3 matrix of geometric glyphs has one missing cell; the player taps the
 * option tile that completes the pattern. Mechanically this is the simplest
 * single-phase pick-one template (mirrors {@link TinyLogicCard}): the matrix and
 * options mount immediately, the FIRST committed selection resolves the card
 * (correct iff it is `correctOptionId`, else incorrect with the wrong pick as the
 * recorded distractor), and the shared {@link useCardTimer} resolves a TIMEOUT on
 * expiry. The difference is purely presentational — the prompt is a grid of
 * SHAPES, not text, so there is near-zero reading.
 *
 * Accessibility (Technical Design §14): meaning is carried by distinct SHAPES,
 * never colour. The matrix is a labelled group with the blank cell announced as
 * "missing"; options are real `<button>`s (≥ `--tap-target-min`), each labelled
 * "Option N" with `aria-pressed`, and a polite live region announces the result.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { orderOptions } from '../../cards/optionOrder';
import type { MatrixReasoningCard as MatrixReasoningCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateMatrixReasoningSelection } from './matrixReasoningEvaluator';

export type MatrixReasoningCardProps =
  TemplateProps<MatrixReasoningCardType> & {
    now?: () => number;
  };

export default function MatrixReasoningCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: MatrixReasoningCardProps) {
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
    timeoutSignals: () => ({
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      selected_option_id: selectedId ?? '',
      distractor_option_id: '',
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
    now,
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
        evaluateMatrixReasoningSelection(config, optionId);

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

  // Deterministic, card-seeded option order so the answer is not positionally
  // guessable (it is keyed by `correctOptionId`, identical on web↔mobile).
  const orderedOptions = useMemo(
    () => orderOptions(card.cardId, config.options),
    [card.cardId, config.options],
  );

  const resultText = !selectedId
    ? ''
    : selectedId === config.correctOptionId
      ? 'Correct'
      : 'Incorrect';

  return (
    <section aria-label="Matrix reasoning" style={sectionStyle}>
      <p style={promptStyle}>Pick the shape that completes the pattern.</p>

      {/* The 3×3 matrix. Glyphs carry meaning by SHAPE; the missing cell is the
          question. Decorative glyphs are hidden from assistive tech; the blank
          cell is announced. */}
      <div
        role="group"
        aria-label="Pattern grid with one missing cell"
        style={gridStyle}
      >
        {config.grid.map((glyph, index) =>
          glyph === null ? (
            <div
              key={index}
              data-testid="mx-blank"
              aria-label="Missing cell"
              style={blankCellStyle}
            >
              ?
            </div>
          ) : (
            <div key={index} aria-hidden="true" style={cellStyle}>
              {glyph}
            </div>
          ),
        )}
      </div>

      <div role="group" aria-label="Pick the missing shape" style={optionsStyle}>
        {orderedOptions.map((option, index) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`mx-option-${option.id}`}
              aria-label={`Option ${index + 1}`}
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.id)}
              style={isSelected ? optionSelectedStyle : optionStyle}
            >
              <span aria-hidden="true">{option.glyph}</span>
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

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'center',
} as const;

const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  textAlign: 'center',
} as const;

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 'var(--space-2)',
  width: 'min(72vw, 320px)',
} as const;

const cellBase = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1 / 1',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  fontSize: 'var(--font-size-xl)',
  color: 'var(--color-text)',
  lineHeight: 1,
} as const;

const cellStyle = cellBase;

const blankCellStyle = {
  ...cellBase,
  border: '2px dashed var(--accent, var(--color-accent))',
  color: 'var(--color-text-muted)',
  fontWeight: 'var(--font-weight-bold)',
} as const;

const optionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const optionStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--tap-target-min)',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-xl)',
  cursor: 'pointer',
  lineHeight: 1,
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
