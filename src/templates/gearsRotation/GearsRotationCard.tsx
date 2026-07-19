/**
 * Gears Rotation renderer — a meshed-gear direction puzzle.
 *
 * A horizontal chain of meshed gears turns in ALTERNATING directions; the driver
 * (first) gear's spin is shown and the player taps which way the LAST gear spins.
 * Mechanically this is the simplest single-phase pick-one template (mirrors
 * {@link MatrixReasoningCard}): the chain and options mount immediately, the
 * FIRST committed selection resolves the card (correct iff it is `correctOptionId`,
 * else incorrect with the wrong pick as the recorded distractor), and the shared
 * {@link useCardTimer} resolves a TIMEOUT on expiry. The difference is purely
 * presentational — the prompt is a row of gear glyphs with rotation arrows.
 *
 * Accessibility (Technical Design §14): meaning is carried by an arrow glyph + a
 * WORD, never colour. The chain is a labelled group with the unknown last gear
 * announced as "?"; options are real `<button>`s (≥ `--tap-target-min`), each
 * labelled with its direction word + `aria-pressed`, and a polite live region
 * announces the result.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { orderOptions } from '../../cards/optionOrder';
import type { GearsRotationCard as GearsRotationCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateGearsRotationSelection } from './gearsRotationEvaluator';

export type GearsRotationCardProps = TemplateProps<GearsRotationCardType> & {
  now?: () => number;
};

/** Rotation arrow glyph for a spin direction (carries meaning alongside a word). */
function arrowFor(direction: string): string {
  return direction === 'ccw' ? '↺' : '↻';
}

export default function GearsRotationCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: GearsRotationCardProps) {
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

      const { isCorrect, distractorOptionId } = evaluateGearsRotationSelection(
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

  // Deterministic, card-seeded option order so the answer is not positionally
  // guessable (it is keyed by `correctOptionId`, identical on web↔mobile).
  const orderedOptions = useMemo(
    () => orderOptions(card.cardId, config.options),
    [card.cardId, config.options],
  );

  // One gear glyph per meshed gear in the chain (>= 2). The first is the driver
  // (its spin is shown); the last is the unknown the player must deduce.
  const gears = useMemo(
    () => Array.from({ length: Math.max(0, config.gearCount) }),
    [config.gearCount],
  );
  const lastIndex = gears.length - 1;
  const driveArrow = arrowFor(config.driveDirection);

  const resultText = !selectedId
    ? ''
    : selectedId === config.correctOptionId
      ? 'Correct'
      : 'Incorrect';

  return (
    <section aria-label="Gears rotation" style={sectionStyle}>
      <p style={promptStyle}>Which way does the last gear spin?</p>

      {/* The meshed-gear chain. Each gear is a SHAPE; the driver shows its spin
          arrow + word, the last gear is the unknown "?". Decorative glyphs are
          hidden from assistive tech; the driver and unknown are announced. */}
      <div
        role="group"
        aria-label="Meshed gear chain — the first gear's spin is shown"
        style={chainStyle}
      >
        {gears.map((_, index) => {
          const isDriver = index === 0;
          const isLast = index === lastIndex;
          return (
            <div
              key={index}
              data-testid={
                isDriver ? 'gr-driver' : isLast ? 'gr-last' : undefined
              }
              aria-label={
                isDriver
                  ? `First gear spins ${config.driveDirection === 'ccw' ? 'counter-clockwise' : 'clockwise'}`
                  : isLast
                    ? 'Last gear — unknown direction'
                    : undefined
              }
              aria-hidden={!isDriver && !isLast ? 'true' : undefined}
              style={gearCellStyle}
            >
              <span aria-hidden="true" style={gearGlyphStyle}>
                ⚙
              </span>
              <span aria-hidden="true" style={gearMarkStyle}>
                {isDriver ? driveArrow : isLast ? '?' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div role="group" aria-label="Pick the last gear's direction" style={optionsStyle}>
        {orderedOptions.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`gr-option-${option.id}`}
              aria-label={option.label}
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.id)}
              style={isSelected ? optionSelectedStyle : optionStyle}
            >
              <span aria-hidden="true">{`${arrowFor(option.id)} ${option.label}`}</span>
            </button>
          );
        })}
      </div>

      <p data-testid="gr-status" role="status" aria-live="polite" style={liveRegionStyle}>
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

const chainStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  width: 'min(80vw, 360px)',
} as const;

const gearCellStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--tap-target-min)',
  lineHeight: 1,
} as const;

const gearGlyphStyle = {
  fontSize: 'var(--font-size-xl)',
  color: 'var(--color-text)',
} as const;

const gearMarkStyle = {
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--accent, var(--color-accent))',
  minHeight: 'var(--font-size-md)',
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
  fontSize: 'var(--font-size-md)',
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
