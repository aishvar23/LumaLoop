/**
 * Schulte Order renderer (Design §9; Technical Design §7, §14).
 *
 * A timed, MULTI-TAP processing-speed template. Unlike memory_sequence there is
 * NO pre-phase: the scattered grid is interactive from card start, so the
 * controller sets `interactionEnabledAtMs === activeAtMs`. The renderer is still
 * activation-aware — it gates engage/measurement on `isActive` so a pre-mounted
 * off-screen slide neither records an attempt nor starts measuring before the
 * user swipes to it.
 *
 * Timing / latching (mirrors memory_sequence + spot_it):
 *  - The shared {@link useCardTimer} arms `config.timeLimitMs` on mount; on expiry
 *    the card resolves TIMEOUT, carrying how far the player got (progress/errors).
 *  - Interaction timing (TTI / `interactionElapsedMs`) is measured from the FIRST
 *    tap (engage), captured once in a ref so it is independent of render timing.
 *  - Resolution is LATCHED per slide via `resolvedRef`: once the card resolves
 *    (full sequence completed OR timeout), later taps are inert and cannot
 *    re-resolve or re-announce — so a re-armed/phantom timeout can never overwrite
 *    a real completion.
 *
 * Wrong-tap policy (documented; owned by the pure {@link evaluateSchulteOrder}):
 *  - The expected next target advances only on a correct in-order tap.
 *  - Any other tap (out-of-order, repeat, already-completed) is COUNTED as an
 *    error but is NON-FATAL — the player keeps hunting for the same target until
 *    the clock runs out, so "time to complete" stays meaningful (like spot_it).
 *  - The card resolves CORRECT once every target is tapped in order; INCORRECT
 *    only via timeout. The renderer collects the raw tap log and routes it through
 *    the evaluator (single source of truth) — it never re-derives progress inline.
 *
 * NO next-target hint (the challenge IS the visual search): the renderer NEVER
 * reveals which cell is expected next — that would telegraph the answer and make
 * even "hard" cards trivial. Cells are only ever `done` (already correctly
 * tapped) or plain; the player must search the grid for the next value. The
 * `done` state is fair post-action feedback, not a hint.
 *
 * Accessibility (Technical Design §14): targets are real `<button>`s, large
 * (≥ `--tap-target-min`), labeled by their value + tapped/untapped state, and
 * keyboard-focusable. Progress is conveyed by a polite `role="status"` live
 * region. The `done` state is announced via the label + `aria-pressed`, never
 * colour alone — and no label or marker ever reveals the next target.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { SchulteOrderCard as SchulteOrderCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateSchulteOrder,
  orderedTargetIdsFrom,
  replaySchulteTaps,
} from './schulteOrderEvaluator';

export type SchulteOrderCardProps = TemplateProps<SchulteOrderCardType> & {
  now?: () => number;
};

export default function SchulteOrderCard({
  card,
  context,
  isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: SchulteOrderCardProps) {
  const { config } = card;
  const { rows, columns, targets } = config;

  const orderedIds = useMemo(() => orderedTargetIdsFrom(targets), [targets]);

  // A cell lookup so the grid can render each coordinate's target (if any).
  const targetByCoord = useMemo(() => {
    const map = new Map<string, SchulteOrderCardType['config']['targets'][number]>();
    for (const target of targets) {
      map.set(`${target.row}:${target.column}`, target);
    }
    return map;
  }, [targets]);

  // Interaction bookkeeping in refs (independent of render timing); `taps` is
  // mirrored into state to drive the `done` feedback + progress text (it does
  // NOT drive any next-target hint — that would telegraph the answer).
  const firstTapElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const tappedRef = useRef<string[]>([]);
  const [taps, setTaps] = useState<string[]>([]);

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
    timeoutSignals: () => {
      const { progress, errors } = replaySchulteTaps(orderedIds, tappedRef.current);
      return {
        target_count: orderedIds.length,
        progress,
        errors,
        taps: tappedRef.current.length,
        time_to_interaction: firstTapElapsedRef.current ?? -1,
        correct: false,
        elapsed: now() - context.interactionEnabledAtMs,
      };
    },
  });

  const handleTargetTap = useCallback(
    (targetId: string) => {
      // Inert once resolved, or while the slide is pre-mounted off-screen.
      if (resolvedRef.current || !isActive) return;

      const tappedAtMs = now();

      // First meaningful input: record the attempt once and capture TTI.
      if (firstTapElapsedRef.current === null) {
        const tti = tappedAtMs - context.interactionEnabledAtMs;
        firstTapElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      const nextTaps = [...tappedRef.current, targetId];
      tappedRef.current = nextTaps;
      setTaps(nextTaps);

      // Route the raw tap log through the pure evaluator (single source of truth).
      const result = evaluateSchulteOrder({ orderedTargetIds: orderedIds }, nextTaps);

      // Not complete yet: a wrong/out-of-order tap is recorded, not fatal.
      if (!result.isCorrect) return;

      timer.resolve({
        cardId: card.cardId,
        resolutionType: result.resolutionType,
        isCorrect: result.isCorrect,
        elapsedMs: tappedAtMs - context.activeAtMs,
        interactionElapsedMs: tappedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          ...result.signals,
          time_to_interaction: firstTapElapsedRef.current,
          correct: result.isCorrect,
          elapsed: tappedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      isActive,
      now,
      onAttempt,
      orderedIds,
      timer,
    ],
  );

  // Derive the current progress (and thus the set of already-tapped targets)
  // from the SAME replay logic the scoring uses (display and scoring never
  // drift). We deliberately do NOT compute the next-expected target: revealing
  // it would telegraph the answer and defeat the visual search.
  const { progress } = replaySchulteTaps(orderedIds, taps);
  const completedIds = new Set(orderedIds.slice(0, progress));

  return (
    <section aria-label="Schulte order" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
      <div
        role="group"
        aria-label={`${rows} by ${columns} grid; tap the values in order`}
        style={{
          ...gridStyle,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: columns }, (_, column) => {
            const target = targetByCoord.get(`${row}:${column}`);
            if (!target) {
              return (
                <div
                  key={`${row}-${column}`}
                  data-testid={`schulte-empty-${row}-${column}`}
                  aria-hidden="true"
                  style={emptyCellStyle}
                />
              );
            }
            const isDone = completedIds.has(target.id);
            return (
              <button
                key={`${row}-${column}`}
                type="button"
                data-testid={`schulte-target-${target.id}`}
                aria-pressed={isDone}
                aria-label={
                  isDone ? `${target.label}: tapped` : target.label
                }
                onClick={() => handleTargetTap(target.id)}
                style={isDone ? doneCellStyle : cellStyle}
              >
                <span aria-hidden="true">{target.label}</span>
              </button>
            );
          }),
        )}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {progress > 0 ? `Found ${progress} of ${orderedIds.length}` : ''}
      </p>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens) ──────────

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
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

// A completed target: muted fill, conveyed by the "tapped" label + aria-pressed.
const doneCellStyle = {
  ...cellStyle,
  opacity: 0.45,
  cursor: 'default',
} as const;

// A grid cell with no target — a non-interactive spacer that keeps the layout.
const emptyCellStyle = {
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  aspectRatio: '1 / 1',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
