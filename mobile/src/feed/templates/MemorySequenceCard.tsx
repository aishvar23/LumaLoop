/**
 * Memory Sequence renderer — React Native (ADO #140; Design §7, §10, §14;
 * Technical Design §7).
 *
 * Native rebuild of web `src/templates/memorySequence/MemorySequenceCard.tsx` —
 * same behaviour and signals, RN primitives instead of DOM. A working-memory
 * template the renderer drives in two phases it OWNS itself, because the feed
 * sets `interactionEnabledAtMs === activeAtMs` (engage instant) and the watch
 * offset is a renderer concern:
 *
 *   Phase 1 — WATCH: the tiles in `config.sequence` flash one-by-one in order
 *     (`flashMs` lit, `gapMs` dark between). The grid is NON-interactive — the
 *     tiles are plain cells, not buttons, so a tap cannot do anything
 *     measurable. The watch animation is gated on `isActive` so it does not run
 *     while the card is pre-mounted off-screen (the same pattern as the native
 *     {@link WhatChangedCard}); otherwise the sequence could flash and end
 *     before the user ever swipes to the slide, dropping them onto a blank
 *     reproduce grid.
 *   Phase 2 — REPRODUCE: after the watch animation the renderer reveals a grid
 *     of real tile buttons and records its OWN interaction-enabled instant. The
 *     player taps the tiles back in order; TTI and `interactionElapsedMs` are
 *     measured from THAT instant, not the engage/active instant, so the watch
 *     period does not penalise the player and the per-card timer covers the
 *     REPRODUCE phase only (parity with web).
 *
 * The clean way to make the shared {@link useCardTimer} arm at reproduce-phase
 * start is to mount the timer-using subtree ({@link MemorySequenceReproduce})
 * only once the watch animation ends, handing it a context whose
 * `interactionEnabledAtMs` is the reproduce-phase start. A timeout's
 * `interactionElapsedMs` then excludes the watch window while `elapsedMs` still
 * runs from `context.activeAtMs`.
 *
 * Resolution semantics — NON-STRICT (documented UX choice): the player always
 * enters the full sequence. The renderer collects taps and resolves ONCE the
 * player has entered `config.sequence.length` taps (or on timeout), routing the
 * collected order through the pure {@link evaluateMemorySequence} (source of
 * truth, never re-derived). A wrong tap does NOT end the card early.
 *
 * Accessibility (Technical Design §14): reproduce tiles are real buttons, large
 * (≥ {@link TAP_TARGET_MIN}), labelled by position, and a polite live region
 * announces reproduction progress. The lit watch tile is conveyed by an explicit
 * ● marker + a "lit" label, never by colour alone (colour-blind safe).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  GridCoordinate,
  MemorySequenceCard as MemorySequenceCardType,
} from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateMemorySequence } from '../../core/templates/memorySequence/memorySequenceEvaluator';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`); the optional prop keeps it
 * assignable to the registry slot while staying testable under fake timers.
 */
export type MemorySequenceCardProps = TemplateProps<MemorySequenceCardType> & {
  now?: () => number;
};

type Phase = 'watch' | 'reproduce';

export default function MemorySequenceCard({
  card,
  context,
  isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
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
  // `now` at the instant the watch BEGINS, mirroring how `useCardTimer` guards
  // stale closures.
  const nowRef = useRef(now);
  nowRef.current = now;

  // WATCH animation: schedule each flash, then flip to the reproduce phase.
  // Gated on `isActive` so a pre-mounted off-screen card does not run its
  // sequence; it (re)starts cleanly when the card becomes active. `phase` keeps
  // the effect inert once we have left the watch phase.
  useEffect(() => {
    if (!isActive || phase !== 'watch') return undefined;

    // Anchor the reproduce origin to when the WATCH actually starts (this
    // instant, which is card activation), not to when the final flash timer
    // happens to fire. The reproduce phase deterministically begins
    // `watchDurationMs` later, so `reproduceStartMs = watchStartMs +
    // watchDurationMs`. Deriving it (instead of re-sampling `now()` inside the
    // expiry callback) keeps the origin independent of timer-callback jitter and
    // makes a timeout's `interactionElapsedMs` measure the reproduce phase
    // exactly, while `elapsedMs` still runs from `context.activeAtMs`.
    const watchStartMs = nowRef.current();

    const beginReproduce = (watchDurationMs: number) => {
      reproduceStartRef.current = watchStartMs + watchDurationMs;
      setLitStep(null);
      setPhase('reproduce');
    };

    // Degenerate guard: an empty sequence has nothing to watch. (Catalog
    // validation forbids this, but the renderer must not hang on bad data.)
    if (sequence.length === 0) {
      beginReproduce(0);
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
    const watchDurationMs = offset;
    timers.push(setTimeout(() => beginReproduce(watchDurationMs), watchDurationMs));

    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [isActive, phase, sequence, flashMs, gapMs]);

  return (
    <View style={styles.section} accessibilityLabel="Memory sequence">
      <Text style={styles.prompt}>{card.prompt}</Text>
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
    </View>
  );
}
MemorySequenceCard.displayName = 'MemorySequenceCard';

/**
 * The non-interactive WATCH grid. Renders plain cells (NOT buttons) so the watch
 * phase cannot register input; the cell matching the currently-lit `sequence`
 * step shows an explicit ● marker and is announced "lit" so the flash is never
 * conveyed by colour alone.
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
    <View
      accessibilityLabel={`Watch the sequence on a ${rows} by ${columns} grid`}
      style={styles.grid}
    >
      {Array.from({ length: rows }, (_, row) => (
        <View key={`row-${row}`} style={styles.row}>
          {Array.from({ length: columns }, (_, column) => {
            const isLit =
              litCoord !== undefined &&
              litCoord.row === row &&
              litCoord.column === column;
            return (
              <View
                key={`${row}-${column}`}
                testID={`ms-watch-tile-${row}-${column}`}
                accessibilityLabel={
                  isLit
                    ? `Row ${row + 1}, column ${column + 1}: lit`
                    : `Row ${row + 1}, column ${column + 1}`
                }
                style={[styles.cell, isLit && styles.cellLit]}
              >
                {/* Non-colour lit cue: an explicit ● glyph, not hue alone. */}
                <Text style={styles.cellText}>{isLit ? '●' : ''}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The reproduce-phase subtree. Mounted only once the watch animation ends, so
 * the shared {@link useCardTimer} it arms counts `timeLimitMs` from the reproduce
 * phase, not card start. It renders the tappable grid, collects the tap order,
 * and resolves once the player has entered `sequence.length` taps (or on
 * timeout), routing the order through the pure evaluator.
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
    [
      card.cardId,
      context.activeAtMs,
      reproduceStartMs,
      sequence,
      now,
      onAttempt,
      timer,
    ],
  );

  return (
    <>
      <View
        accessibilityLabel={`Tap the ${sequence.length} tiles in the order they flashed`}
        style={styles.grid}
      >
        {Array.from({ length: rows }, (_, row) => (
          <View key={`row-${row}`} style={styles.row}>
            {Array.from({ length: columns }, (_, column) => (
              <Pressable
                key={`${row}-${column}`}
                testID={`ms-tile-${row}-${column}`}
                accessibilityRole="button"
                accessibilityLabel={`Row ${row + 1}, column ${column + 1}`}
                onPress={() => handleTileTap(row, column)}
                style={({ pressed }) => [
                  styles.cell,
                  pressed && styles.cellPressed,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <Text
        testID="ms-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {tapped.length > 0
          ? `Tapped ${tapped.length} of ${sequence.length}`
          : ''}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  // The grid reads as a deliberate game board: a rounded, bordered panel that
  // holds the tiles/cells (parity with the native Spot It board).
  grid: {
    gap: space.sm,
    width: '100%',
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  cell: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  // The lit cell during WATCH: a stronger accent surface + border so the flash
  // is visible. Pairs with the ● glyph / "lit" label, never colour alone.
  cellLit: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  cellPressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
    transform: [{ scale: 0.96 }],
  },
  cellText: {
    color: colors.accentContrast,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
