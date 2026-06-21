/**
 * Memory Sequence renderer (Azure DevOps #137; Technical Design §7, §10, §14).
 *
 * A working-memory template. Like `what_changed`, it runs two phases the
 * renderer owns itself (the controller sets `interactionEnabledAtMs ===
 * activeAtMs` and documents that "preview-based offsets are a renderer
 * concern"):
 *
 *   Phase 1 — WATCH: the tiles in `config.sequence` flash one-by-one in order
 *     (`flashMs` lit, `gapMs` dark between). The grid is NON-interactive — the
 *     tiles are plain cells, not buttons, so a tap cannot do anything
 *     measurable. The watch animation is gated on `isActive` so it does not run
 *     while the card is off-screen (see the `isActive` prop note below).
 *   Phase 2 — REPRODUCE: after the watch animation the renderer reveals a grid
 *     of real tile buttons and records its OWN interaction-enabled instant. The
 *     player taps the tiles back in order; TTI and `interactionElapsedMs` are
 *     measured from THAT instant, not from `context.activeAtMs`, so the watch
 *     period does not penalize the player (Design §14: `Card_Attempted` starts
 *     when input is enabled).
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` covers the
 * REPRODUCE phase only. As with `what_changed`, the timer-using subtree
 * ({@link MemorySequenceReproduce}) mounts only once the reproduce phase begins,
 * so the shared {@link useCardTimer} counts `timeLimitMs` from the reproduce
 * phase rather than from card start. It is handed a context whose
 * `interactionEnabledAtMs` is the reproduce-phase start, so a timeout's
 * `interactionElapsedMs` excludes the watch window while `elapsedMs` still runs
 * from `context.activeAtMs`.
 *
 * Resolution semantics — NON-STRICT (documented UX choice): the player always
 * enters the full sequence. The renderer collects taps and resolves ONCE the
 * player has entered `config.sequence.length` taps (or on timeout), routing the
 * collected order through the pure {@link evaluateMemorySequence}. A wrong tap
 * does NOT end the card early — this keeps the interaction predictable on a
 * small touch target and lets the evaluator report richer signals (`errors`,
 * `first_error_step`) than a strict fail-fast would.
 *
 * Accessibility (Technical Design §14): reproduce tiles are real `<button>`s,
 * large (≥ `--tap-target-min`), labeled by position, and keyboard-focusable; a
 * polite `role="status"` live region announces reproduction progress, never
 * conveyed by colour alone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  GridCoordinate,
  MemorySequenceCard as MemorySequenceCardType,
} from '../../cards/types';
import type { CardResolution, CardStartContext, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateMemorySequence } from './memorySequenceEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`) for testability under fake
 * timers without a real wall-clock dependency; the optional prop keeps it
 * assignable to the registry's `ComponentType<TemplateProps<MemorySequenceCard>>`
 * slot.
 *
 * `isActive` is the shared {@link TemplateProps} ACTIVATION signal (the feed
 * passes `isActive={index === activeIndex}`): the WATCH flash only runs while the
 * card is the focused slide, so a pre-mounted off-screen card does not flash its
 * sequence — and then drop the player onto a blank reproduce grid — before they
 * swipe to it. Omitted ≡ active, so a standalone render (tests, `/c/:cardId`)
 * behaves exactly as before.
 */
export type MemorySequenceCardProps = TemplateProps<MemorySequenceCardType> & {
  now?: () => number;
};

type Phase = 'watch' | 'reproduce';

export default function MemorySequenceCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
  isActive = true,
}: MemorySequenceCardProps) {
  const { config } = card;
  const { rows, columns, sequence, flashMs, gapMs } = config;

  // Phase is the only render state the parent owns; the reproduce-phase start
  // instant lives in a ref so it survives without forcing a render.
  const [phase, setPhase] = useState<Phase>('watch');
  const reproduceStartRef = useRef<number | null>(null);

  // The currently-lit tile during WATCH (index into `sequence`), or null when no
  // tile is lit (the gaps, and the whole reproduce phase).
  const [litStep, setLitStep] = useState<number | null>(null);

  // The clock lives in a ref so the watch→reproduce transition reads the LATEST
  // `now` at completion, mirroring how `useCardTimer` guards stale closures.
  const nowRef = useRef(now);
  nowRef.current = now;

  // WATCH animation: schedule each flash, then flip to the reproduce phase.
  // Gated on `isActive` so an off-screen card does not run its sequence; it
  // (re)starts cleanly when the card becomes active. Skipped entirely once we
  // have left the watch phase.
  useEffect(() => {
    if (!isActive || phase !== 'watch') return undefined;

    const beginReproduce = () => {
      reproduceStartRef.current = nowRef.current();
      setLitStep(null);
      setPhase('reproduce');
    };

    // Degenerate guard: an empty sequence has nothing to watch. (Catalog
    // validation forbids this, but the renderer must not hang on bad data.)
    if (sequence.length === 0) {
      beginReproduce();
      return undefined;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let offset = 0;
    for (let step = 0; step < sequence.length; step++) {
      const litAt = offset;
      timers.push(setTimeout(() => setLitStep(step), litAt));
      offset += Math.max(0, flashMs);
      const darkAt = offset;
      timers.push(setTimeout(() => setLitStep(null), darkAt));
      offset += Math.max(0, gapMs);
    }
    timers.push(setTimeout(beginReproduce, offset));

    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [isActive, phase, sequence, flashMs, gapMs]);

  return (
    <section aria-label="Memory sequence" style={sectionStyle}>
      <p style={promptStyle}>{card.prompt}</p>
      {phase === 'watch' ? (
        <WatchGrid
          rows={rows}
          columns={columns}
          sequence={sequence}
          litStep={litStep}
        />
      ) : (
        <MemorySequenceReproduce
          card={card}
          context={context}
          // Non-null: the reproduce phase is only entered from the watch effect,
          // which sets the ref before flipping the phase.
          reproduceStartMs={reproduceStartRef.current as number}
          onAttempt={onAttempt}
          onResolve={onResolve}
          now={now}
        />
      )}
    </section>
  );
}

/**
 * The non-interactive WATCH grid. Renders plain cells (NOT buttons) so the watch
 * phase cannot register input; the cell matching the currently-lit `sequence`
 * step is marked `data-lit` and announced so the flash is not colour-only.
 */
function WatchGrid({
  rows,
  columns,
  sequence,
  litStep,
}: {
  rows: number;
  columns: number;
  sequence: ReadonlyArray<GridCoordinate>;
  litStep: number | null;
}) {
  const litCoord = litStep !== null ? sequence[litStep] : undefined;
  return (
    <div
      role="group"
      aria-label={`Watch the sequence on a ${rows} by ${columns} grid`}
      style={{ ...gridStyle, gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
          const isLit =
            litCoord !== undefined &&
            litCoord.row === row &&
            litCoord.column === column;
          return (
            <div
              key={`${row}-${column}`}
              data-testid={`ms-watch-tile-${row}-${column}`}
              data-lit={isLit ? 'true' : undefined}
              aria-label={
                isLit
                  ? `Row ${row + 1}, column ${column + 1}: lit`
                  : `Row ${row + 1}, column ${column + 1}`
              }
              style={isLit ? litCellStyle : cellStyle}
            />
          );
        }),
      )}
    </div>
  );
}

/**
 * The reproduce-phase subtree. Mounted only once the watch animation ends, so
 * the shared {@link useCardTimer} it arms counts `timeLimitMs` from the
 * reproduce phase, not from card start. It renders the tappable grid, collects
 * the tap order, and resolves once the player has entered `sequence.length` taps
 * (or on timeout), routing the order through the pure evaluator.
 */
type MemorySequenceReproduceProps = {
  card: MemorySequenceCardType;
  context: CardStartContext;
  reproduceStartMs: number;
  onAttempt: TemplateProps<MemorySequenceCardType>['onAttempt'];
  onResolve: TemplateProps<MemorySequenceCardType>['onResolve'];
  now: () => number;
};

function MemorySequenceReproduce({
  card,
  context,
  reproduceStartMs,
  onAttempt,
  onResolve,
  now,
}: MemorySequenceReproduceProps) {
  const { config } = card;
  const { rows, columns, sequence } = config;

  // Interaction bookkeeping lives in refs so taps don't depend on render timing.
  // `tapped` is mirrored into state to drive the live-region progress; a ref
  // copy is read at timer expiry (which is outside React's render cycle).
  const firstTapElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const tappedRef = useRef<GridCoordinate[]>([]);
  const [tapped, setTapped] = useState<GridCoordinate[]>([]);

  // Latch both resolution paths (own completion + the hook's timeout) so any
  // late tap is inert and cannot re-announce on a finished card.
  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      onResolve(resolution);
    },
    [onResolve],
  );

  // Hand the timer a context whose interaction origin is the REPRODUCE-phase
  // start, so a timeout's `interactionElapsedMs` measures from there (excluding
  // the watch window) while `elapsedMs` still runs from `context.activeAtMs`.
  const reproduceContext = useMemo<CardStartContext>(
    () => ({ ...context, interactionEnabledAtMs: reproduceStartMs }),
    [context, reproduceStartMs],
  );

  const timer = useCardTimer({
    card,
    context: reproduceContext,
    onResolve: handleResolve,
    now,
    // Read at expiry: report how far the player got before the clock ran out.
    timeoutSignals: () => ({
      sequence_length: sequence.length,
      taps_entered: tappedRef.current.length,
      time_to_interaction: firstTapElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - reproduceStartMs,
    }),
  });

  const handleTileTap = useCallback(
    (row: number, column: number) => {
      // Once resolved (by completion or timeout), further taps are inert.
      if (resolvedRef.current) return;

      const tappedAtMs = now();

      // First meaningful input in the reproduce phase: record the attempt
      // exactly once and capture time-to-interaction off the reproduce origin.
      if (firstTapElapsedRef.current === null) {
        const tti = tappedAtMs - reproduceStartMs;
        firstTapElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      const nextTapped = [...tappedRef.current, { row, column }];
      tappedRef.current = nextTapped;
      setTapped(nextTapped);

      // Not done yet: keep collecting until the player has entered the full
      // sequence length. A wrong tap is recorded, not fatal (non-strict UX).
      if (nextTapped.length < sequence.length) return;

      // Full reproduction entered: route through the pure evaluator (the single
      // source of truth) and resolve via the hook to keep the single-fire
      // guarantee + disarm the timer.
      const result = evaluateMemorySequence({ sequence }, nextTapped);
      timer.resolve({
        cardId: card.cardId,
        resolutionType: result.resolutionType,
        isCorrect: result.isCorrect,
        elapsedMs: tappedAtMs - context.activeAtMs,
        interactionElapsedMs: tappedAtMs - reproduceStartMs,
        attemptCount: attemptCountRef.current,
        signals: {
          ...result.signals,
          time_to_interaction: firstTapElapsedRef.current,
          correct: result.isCorrect,
          elapsed: tappedAtMs - reproduceStartMs,
        },
      });
    },
    [card.cardId, context.activeAtMs, reproduceStartMs, sequence, now, onAttempt, timer],
  );

  return (
    <>
      <div
        role="group"
        aria-label={`Tap the ${sequence.length} tiles in the order they flashed`}
        style={{ ...gridStyle, gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: columns }, (_, column) => (
            <button
              key={`${row}-${column}`}
              type="button"
              data-testid={`ms-tile-${row}-${column}`}
              aria-label={`Row ${row + 1}, column ${column + 1}`}
              onClick={() => handleTileTap(row, column)}
              style={cellStyle}
            />
          )),
        )}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {tapped.length > 0
          ? `Tapped ${tapped.length} of ${sequence.length}`
          : ''}
      </p>
    </>
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
  // Longhand (not the `border` shorthand) so the lit variant can override only
  // the colour without React warning about mixing shorthand + longhand on
  // rerender as a tile flashes on and off.
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

// The lit cell during WATCH: a stronger surface + accent border so the flash is
// visible. Pairs with `data-lit` / the "lit" aria-label so it is never conveyed
// by colour alone.
const litCellStyle = {
  ...cellStyle,
  cursor: 'default',
  background: 'var(--color-accent)',
  borderColor: 'var(--color-accent)',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
