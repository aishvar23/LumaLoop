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
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateSpotItTap, isAnomalyCell } from './spotItEvaluator';

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
  const columnGap = columns >= 6 ? 'var(--space-1)' : 'var(--space-2)';

  // Per-card interaction bookkeeping lives in refs so taps don't depend on
  // render timing. `falseTaps` is mirrored into state purely to drive the
  // polite live-region announcement.
  const firstTapElapsedRef = useRef<number | null>(null);
  const falseTapsRef = useRef(0);
  const attemptCountRef = useRef(0);
  // Latched once the card resolves (by correct tap OR by timeout) so that any
  // late tap is ignored — without this, post-resolution taps would keep
  // incrementing false_taps and re-announcing on an already-finished card.
  const resolvedRef = useRef(false);
  const [falseTaps, setFalseTaps] = useState(0);

  // Wrap the resolution sink so BOTH resolution paths latch `resolvedRef`: the
  // renderer's own correct-resolve (via `timer.resolve`) and the hook's timeout
  // (via its internal `onResolve`) both flow through here exactly once.
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
    timeoutSignals: () => ({
      time_to_first_tap: firstTapElapsedRef.current ?? -1,
      correct_tap: false,
      false_taps: falseTapsRef.current,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handleCellTap = useCallback(
    (row: number, column: number) => {
      // Once the card has resolved (correct or timeout), taps are inert — no
      // false_taps increment, no live-region change.
      if (resolvedRef.current) return;

      const tappedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-first-tap off the interaction-enabled origin.
      //
      // `attemptCount` is engagement, not a tap tally: it is 0 if the player
      // never touched the card and 1 once they do (markAttempt runs only on the
      // first tap). The granular per-tap count lives in `false_taps`, which is
      // what receipt/telemetry read for search effort (Technical Design §7).
      if (firstTapElapsedRef.current === null) {
        const ttf = tappedAtMs - context.interactionEnabledAtMs;
        firstTapElapsedRef.current = ttf;
        onAttempt({ time_to_first_tap: ttf });
        attemptCountRef.current = timer.markAttempt();
      }

      if (!evaluateSpotItTap(config, { row, column }).isCorrect) {
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
        style={{
          ...gridStyle,
          gap: columnGap,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
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
                <span aria-hidden="true" style={cellTextStyleFor(element)}>
                  {element}
                </span>
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
  fontSize: 'var(--font-size-hero)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-tight)',
  letterSpacing: '-0.01em',
} as const;

const gridStyle = {
  display: 'grid',
  gap: 'var(--space-2)',
  width: '100%',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-board, transparent)',
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
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--accent, var(--color-text))',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  overflow: 'hidden',
  cursor: 'pointer',
} as const;

function cellTextStyleFor(element: string) {
  const glyphLength = Array.from(element).length;
  if (glyphLength >= 3) return cellTextLongStyle;
  if (glyphLength === 2) return cellTextMediumStyle;
  return cellTextBaseStyle;
}

const cellTextBaseStyle = {
  display: 'block',
  maxWidth: '100%',
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const;

const cellTextMediumStyle = {
  ...cellTextBaseStyle,
  fontSize: 'clamp(0.9rem, 4.2vw, 1.25rem)',
  letterSpacing: '-0.02em',
} as const;

const cellTextLongStyle = {
  ...cellTextBaseStyle,
  fontSize: 'clamp(0.72rem, 3.4vw, 0.95rem)',
  letterSpacing: '-0.04em',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
