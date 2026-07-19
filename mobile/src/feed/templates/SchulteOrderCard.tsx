/**
 * Schulte Order renderer — React Native (Design §9; Technical Design §7, §14).
 *
 * Native rebuild of web `src/templates/schulteOrder/SchulteOrderCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A timed, MULTI-TAP
 * processing-speed template. Unlike memory_sequence there is NO pre-phase: the
 * scattered grid is interactive from card start, so the feed sets
 * `interactionEnabledAtMs === activeAtMs`. The renderer is still activation-aware
 * — it gates engage/measurement on `isActive` so a pre-mounted off-screen slide
 * neither records an attempt nor starts measuring before the user swipes to it.
 *
 * Timing / latching (mirrors memory_sequence + spot_it):
 *  - The shared {@link useCardTimer} arms `config.timeLimitMs` on mount; on expiry
 *    the card resolves TIMEOUT, carrying how far the player got (progress/errors).
 *  - Interaction timing is measured from the FIRST tap (engage), captured once in
 *    a ref so it is independent of render timing.
 *  - Resolution is LATCHED per slide via `resolvedRef`: once resolved (completion
 *    OR timeout), later taps are inert, so a re-armed/phantom timeout can never
 *    overwrite a real completion.
 *
 * Wrong-tap policy (owned by the pure {@link evaluateSchulteOrder}): the expected
 * next target advances only on a correct in-order tap; any other tap is a
 * NON-FATAL error (the player keeps hunting). CORRECT once the full order is
 * tapped; INCORRECT only via timeout. The renderer collects the raw tap log and
 * routes it through the evaluator (single source of truth).
 *
 * NO next-target hint (the challenge IS the visual search): the renderer NEVER
 * reveals which cell is expected next — that would telegraph the answer and make
 * even "hard" cards trivial. Cells are only ever `done` (already correctly
 * tapped) or plain; the player must search the grid for the next value. The
 * `done` state is fair post-action feedback, not a hint.
 *
 * Accessibility (Technical Design §14): targets are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled by their value + tapped/untapped state.
 * Progress is carried by a polite live region; the `done` state is announced via
 * the label + selected state, never colour alone — and nothing reveals the next
 * target.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SchulteOrderCard as SchulteOrderCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateSchulteOrder,
  orderedTargetIdsFrom,
  replaySchulteTaps,
} from '../../core/templates/schulteOrder/schulteOrderEvaluator';
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
import { useGameTheme } from './GameTheme';

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
  const theme = useGameTheme();
  const { rows, columns, targets } = config;

  const orderedIds = useMemo(() => orderedTargetIdsFrom(targets), [targets]);
  const targetByCoord = useMemo(() => {
    const map = new Map<string, SchulteOrderCardType['config']['targets'][number]>();
    for (const target of targets) {
      map.set(`${target.row}:${target.column}`, target);
    }
    return map;
  }, [targets]);

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
      if (resolvedRef.current || !isActive) return;

      const tappedAtMs = now();

      if (firstTapElapsedRef.current === null) {
        const tti = tappedAtMs - context.interactionEnabledAtMs;
        firstTapElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      const nextTaps = [...tappedRef.current, targetId];
      tappedRef.current = nextTaps;
      setTaps(nextTaps);

      const result = evaluateSchulteOrder({ orderedTargetIds: orderedIds }, nextTaps);
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

  // Derive progress (and thus already-tapped targets) from the SAME replay logic
  // the scoring uses. We deliberately do NOT compute the next-expected target:
  // revealing it would telegraph the answer and defeat the visual search.
  const { progress } = replaySchulteTaps(orderedIds, taps);
  const completedIds = new Set(orderedIds.slice(0, progress));

  return (
    <View style={styles.section} accessibilityLabel="Schulte order">
      <Text style={styles.prompt}>{card.prompt}</Text>
      <View
        testID="schulte-grid"
        accessibilityLabel={`${rows} by ${columns} grid; tap the values in order`}
        style={[
          styles.grid,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {Array.from({ length: rows }, (_, row) => (
          <View key={`row-${row}`} testID={`schulte-row-${row}`} style={styles.row}>
            {Array.from({ length: columns }, (_, column) => {
              const target = targetByCoord.get(`${row}:${column}`);
              if (!target) {
                return (
                  <View
                    key={`${row}-${column}`}
                    testID={`schulte-empty-${row}-${column}`}
                    style={styles.emptyCell}
                  />
                );
              }
              const isDone = completedIds.has(target.id);
              return (
                <Pressable
                  key={`${row}-${column}`}
                  testID={`schulte-target-${target.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isDone }}
                  accessibilityLabel={
                    isDone ? `${target.label}: tapped` : target.label
                  }
                  onPress={() => handleTargetTap(target.id)}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor: theme.surfaceRaised,
                      borderColor: theme.border,
                    },
                    isDone && styles.cellDone,
                    pressed &&
                      !isDone && {
                        backgroundColor: theme.surfaceStrong,
                        borderColor: theme.accent,
                      },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={styles.cellText}
                  >
                    {target.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text
        testID="schulte-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {progress > 0 ? `Found ${progress} of ${orderedIds.length}` : ''}
      </Text>
    </View>
  );
}
SchulteOrderCard.displayName = 'SchulteOrderCard';

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
    width: '100%',
  },
  cell: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  // A completed target: muted, conveyed by the "tapped" label + selected state.
  cellDone: {
    opacity: 0.4,
  },
  emptyCell: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    aspectRatio: 1,
  },
  cellText: {
    color: colors.text,
    textAlign: 'center',
    maxWidth: '92%',
    includeFontPadding: false,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
