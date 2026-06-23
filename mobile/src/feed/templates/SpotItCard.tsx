/**
 * Spot It renderer — React Native (ADO #128; Design §9.1; Technical Design §7, §14).
 *
 * Native rebuild of web `src/templates/spotIt/SpotItCard.tsx` — same behaviour and
 * signals, RN primitives instead of DOM. Renders a `rows × columns` grid of the
 * repeated `baseElement` with a single `anomalyElement` at (`anomalyRow`,
 * `anomalyColumn`). The player taps the anomaly before the per-card timer expires.
 *
 * Resolution semantics (Design §9.1 signals — "False tap count" and "Time to
 * correct resolution"): a false tap is COUNTED, not fatal. The player keeps trying
 * until they tap the anomaly (resolves CORRECT) or the clock runs out (the shared
 * {@link useCardTimer} resolves TIMEOUT). There is no immediate-incorrect path —
 * that is the documented behaviour and what makes "time to correct resolution"
 * meaningful. `isAnomalyCell` is used only to pick each cell's display glyph, never
 * to gate input: every cell is tappable and every tap routes through
 * {@link evaluateSpotItTap} (the single source of truth for correctness).
 *
 * Accessibility (Technical Design §14): the anomaly is conveyed by the element
 * GLYPH, never by colour, so the grid is colour-blind safe. Every cell is a real
 * button (`accessibilityRole="button"`) with a position+content label and a tap
 * target at least {@link TAP_TARGET_MIN} (WCAG 2.5.5).
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SpotItCard as SpotItCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateSpotItTap,
  isAnomalyCell,
} from '../../core/templates/spotIt/spotItEvaluator';
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

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional, so
 * the component stays assignable to the registry's
 * `ComponentType<TemplateProps<SpotItCard>>` slot while remaining testable under
 * fake timers without a real wall-clock dependency.
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
  const theme = useGameTheme();
  const { rows, columns, baseElement, anomalyElement } = config;
  const columnGap = columns >= 6 ? space.xs : space.sm;

  // Per-card interaction bookkeeping lives in refs so taps don't depend on render
  // timing. `falseTaps` is mirrored into state purely to drive the polite
  // announcement.
  const firstTapElapsedRef = useRef<number | null>(null);
  const falseTapsRef = useRef(0);
  const attemptCountRef = useRef(0);
  // Latched once the card resolves (by correct tap OR by timeout) so any late tap
  // is ignored — without this, post-resolution taps would keep incrementing
  // false_taps and re-announcing on an already-finished card.
  const resolvedRef = useRef(false);
  const [falseTaps, setFalseTaps] = useState(0);

  // Wrap the resolution sink so BOTH resolution paths latch `resolvedRef`: the
  // renderer's own correct-resolve (via `timer.resolve`) and the hook's timeout
  // both flow through here exactly once.
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
      // Once the card has resolved (correct or timeout), taps are inert.
      if (resolvedRef.current) return;

      const tappedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-first-tap off the interaction-enabled origin. `attemptCount` is
      // engagement (0 or 1), not a tap tally — the granular per-tap count lives in
      // `false_taps` (Technical Design §7).
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
    <View style={styles.section} accessibilityLabel="Spot the anomaly">
      <Text style={styles.prompt}>{card.prompt}</Text>
      <View
        testID="spot-grid"
        accessibilityLabel={`${rows} by ${columns} grid; tap the one element that is different`}
        style={[
          styles.grid,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {Array.from({ length: rows }, (_, row) => (
          <View
            key={`row-${row}`}
            testID={`spot-row-${row}`}
            style={[styles.row, { gap: columnGap }]}
          >
            {Array.from({ length: columns }, (_, column) => {
              const isAnomaly = isAnomalyCell(config, row, column);
              const element = isAnomaly ? anomalyElement : baseElement;
              const cellTextStyle = cellTextStyleFor(element);
              return (
                <Pressable
                  key={`${row}-${column}`}
                  testID={`spot-cell-${row}-${column}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Row ${row + 1}, column ${column + 1}: ${element}`}
                  onPress={() => handleCellTap(row, column)}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor: theme.surfaceRaised,
                      borderColor: theme.border,
                    },
                    pressed && {
                      backgroundColor: theme.surfaceStrong,
                      borderColor: theme.accent,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    style={[styles.cellText, cellTextStyle, { color: theme.accent }]}
                  >
                    {element}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text
        testID="spot-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {falseTaps > 0
          ? `${falseTaps} incorrect ${falseTaps === 1 ? 'tap' : 'taps'} — keep looking`
          : ''}
      </Text>
    </View>
  );
}
SpotItCard.displayName = 'SpotItCard';

function cellTextStyleFor(element: string) {
  const glyphLength = Array.from(element).length;
  if (glyphLength >= 3) return styles.cellTextLong;
  if (glyphLength === 2) return styles.cellTextMedium;
  return styles.cellTextSingle;
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
  // holds the tappable cells (MP3 #135).
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
  cellPressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
    transform: [{ scale: 0.96 }],
  },
  cellText: {
    color: colors.text,
    textAlign: 'center',
    maxWidth: '92%',
    includeFontPadding: false,
  },
  cellTextSingle: {
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl * lineHeight.tight,
  },
  cellTextMedium: {
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.tight,
    letterSpacing: -0.25,
  },
  cellTextLong: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.tight,
    letterSpacing: -0.5,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
