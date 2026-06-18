/**
 * Spot It renderer (Design §9.1; Technical Design §7, §14).
 *
 * Renders a `rows × columns` grid of the repeated `baseElement` with a single
 * `anomalyElement` at (`anomalyRow`, `anomalyColumn`). The player taps the
 * anomaly before the per-card timer expires.
 *
 * Resolution semantics (Design §9.1 signals — "False tap count" and "Time to
 * correct resolution"): a false tap is COUNTED, not fatal. The player keeps
 * trying until they tap the anomaly (resolves CORRECT) or the clock runs out
 * (the shared `useCardTimer` resolves TIMEOUT). There is no immediate-incorrect
 * path — that is the documented behavior, and it is what makes "time to correct
 * resolution" meaningful.
 *
 * Accessibility (Technical Design §14): the anomaly is conveyed by the element
 * GLYPH, never by colour, so the grid is colour-blind safe. Every cell is a
 * real `<button>` with a position+content label and a tap target at least
 * `--tap-target-min` (WCAG 2.5.5) for one-handed mobile use.
 */

import { useCallback, useRef, useState } from 'react';

import type { SpotItCard as SpotItCardType } from '../../cards/types';
import type { TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { isAnomalyCell } from './spotItEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<SpotItCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
 */
export type SpotItCardProps = TemplateProps<SpotItCardType> & {
  now?: () => number;
};

export default function SpotItCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: SpotItCardProps) {
  const { config } = card;
  const { rows, columns, baseElement, anomalyElement } = config;

  // Per-card interaction bookkeeping lives in refs so taps don't depend on
  // render timing. `falseTaps` is mirrored into state purely to drive the
  // polite live-region announcement.
  const firstTapElapsedRef = useRef<number | null>(null);
  const falseTapsRef = useRef(0);
  const attemptCountRef = useRef(0);
  const [falseTaps, setFalseTaps] = useState(0);

  const timer = useCardTimer({
    card,
    context,
    onResolve,
    now,
    // Read at expiry: report how far the player got before the clock ran out.
    timeoutSignals: () => ({
      time_to_first_tap: firstTapElapsedRef.current ?? -1,
      correct_tap: false,
      false_taps: falseTapsRef.current,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handleCellTap = useCallback(
    (row: number, column: number) => {
      const tappedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-first-tap off the interaction-enabled origin.
      if (firstTapElapsedRef.current === null) {
        const ttf = tappedAtMs - context.interactionEnabledAtMs;
        firstTapElapsedRef.current = ttf;
        onAttempt({ time_to_first_tap: ttf });
        attemptCountRef.current = timer.markAttempt();
      }

      if (!isAnomalyCell(config, row, column)) {
        // False tap: count it and let the player keep searching (Design §9.1).
        falseTapsRef.current += 1;
        setFalseTaps(falseTapsRef.current);
        return;
      }

      // Correct tap: resolve through the hook to keep the single-fire guarantee
      // and disarm the timer. Timing is measured off the start-context origins.
      timer.resolve({
        cardId: card.cardId,
        resolutionType: 'correct',
        isCorrect: true,
        elapsedMs: tappedAtMs - context.activeAtMs,
        interactionElapsedMs: tappedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_first_tap: firstTapElapsedRef.current,
          correct_tap: true,
          false_taps: falseTapsRef.current,
          elapsed: tappedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [card.cardId, config, context, now, onAttempt, timer],
  );

  return (
    <section aria-label="Spot the anomaly" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
      <div
        role="group"
        aria-label={`${rows} by ${columns} grid; tap the one element that is different`}
        style={{ ...gridStyle, gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: columns }, (_, column) => {
            const isAnomaly = isAnomalyCell(config, row, column);
            const element = isAnomaly ? anomalyElement : baseElement;
            return (
              <button
                key={`${row}-${column}`}
                type="button"
                data-testid={`spot-cell-${row}-${column}`}
                aria-label={`Row ${row + 1}, column ${column + 1}: ${element}`}
                onClick={() => handleCellTap(row, column)}
                style={cellStyle}
              >
                <span aria-hidden="true">{element}</span>
              </button>
            );
          }),
        )}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {falseTaps > 0
          ? `${falseTaps} incorrect ${falseTaps === 1 ? 'tap' : 'taps'} — keep looking`
          : ''}
      </p>
    </section>
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

const gridStyle = {
  display: 'grid',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const cellStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  aspectRatio: '1 / 1',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
