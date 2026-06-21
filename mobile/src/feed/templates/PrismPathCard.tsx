/**
 * Prism Path renderer — React Native.
 *
 * A visually focused mirror-routing game: tap mirrors to rotate them, watch the
 * beam preview update, then fire the beam. Correctness and trace signals come
 * from the shared pure evaluator.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  GridCoordinate,
  PrismMirrorOrientation,
  PrismPathCard as PrismPathCardType,
} from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluatePrismPath,
  initialOrientationMap,
  tracePrismPath,
  type PrismPathOrientationMap,
} from '../../core/templates/prismPath/prismPathEvaluator';
import {
  categoryAccent,
  colors,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';

export type PrismPathCardProps = TemplateProps<PrismPathCardType> & {
  now?: () => number;
};

function coordKey(coord: GridCoordinate): string {
  return `${coord.row}:${coord.column}`;
}

function toggleOrientation(
  orientation: PrismMirrorOrientation,
): PrismMirrorOrientation {
  return orientation === 'slash' ? 'backslash' : 'slash';
}

function mirrorGlyph(orientation: PrismMirrorOrientation): string {
  return orientation === 'slash' ? '/' : '\\';
}

export default function PrismPathCard({
  card,
  context,
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: PrismPathCardProps) {
  const { config } = card;
  const accent = categoryAccent(card.category).accent;
  const [orientations, setOrientations] = useState<PrismPathOrientationMap>(() =>
    initialOrientationMap(config.mirrors),
  );
  const rotationsRef = useRef(0);
  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);

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
      const result = evaluatePrismPath(
        config,
        orientations,
        rotationsRef.current,
      );
      return {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: false,
        elapsed: now() - context.interactionEnabledAtMs,
      };
    },
  });

  const markFirstInput = useCallback(() => {
    if (firstInputElapsedRef.current !== null) return;
    const tti = now() - context.interactionEnabledAtMs;
    firstInputElapsedRef.current = tti;
    onAttempt({ time_to_interaction: tti });
    attemptCountRef.current = timer.markAttempt();
  }, [context.interactionEnabledAtMs, now, onAttempt, timer]);

  const handleRotate = useCallback(
    (mirrorId: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      rotationsRef.current += 1;
      setOrientations((prev) => ({
        ...prev,
        [mirrorId]: toggleOrientation(prev[mirrorId] ?? 'slash'),
      }));
    },
    [markFirstInput],
  );

  const handleSubmit = useCallback(() => {
    if (resolvedRef.current) return;
    markFirstInput();
    const result = evaluatePrismPath(config, orientations, rotationsRef.current);
    const resolvedAtMs = now();
    timer.resolve({
      cardId: card.cardId,
      resolutionType: result.resolutionType,
      isCorrect: result.isCorrect,
      elapsedMs: resolvedAtMs - context.activeAtMs,
      interactionElapsedMs: resolvedAtMs - context.interactionEnabledAtMs,
      attemptCount: attemptCountRef.current,
      signals: {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: result.isCorrect,
        elapsed: resolvedAtMs - context.interactionEnabledAtMs,
      },
    });
  }, [
    card.cardId,
    config,
    context.activeAtMs,
    context.interactionEnabledAtMs,
    markFirstInput,
    now,
    orientations,
    timer,
  ]);

  const trace = useMemo(
    () => tracePrismPath(config, orientations),
    [config, orientations],
  );
  const pathSet = useMemo(
    () => new Set(trace.cells.map(coordKey)),
    [trace.cells],
  );
  const blockerSet = useMemo(
    () => new Set(config.blockers.map(coordKey)),
    [config.blockers],
  );
  const mirrorByCoord = useMemo(() => {
    const map = new Map<string, PrismPathCardType['config']['mirrors'][number]>();
    for (const mirror of config.mirrors) map.set(coordKey(mirror), mirror);
    return map;
  }, [config.mirrors]);

  const rows = useMemo(
    () =>
      Array.from({ length: config.rows }, (_, row) =>
        Array.from({ length: config.columns }, (_, column) => ({ row, column })),
      ),
    [config.rows, config.columns],
  );

  return (
    <View style={styles.section} accessibilityLabel="Prism path">
      <Text testID="pp-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>

      <View
        testID="pp-board"
        accessibilityLabel="Mirror beam grid"
        style={[styles.board, { borderColor: accent }]}
      >
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((coord) => {
              const key = coordKey(coord);
              const mirror = mirrorByCoord.get(key);
              const isEntry =
                coord.row === config.entry.row &&
                coord.column === config.entry.column;
              const isTarget =
                coord.row === config.target.row &&
                coord.column === config.target.column;
              const isBlocker = blockerSet.has(key);
              const isBeam = pathSet.has(key);
              const baseStyles = [
                styles.cell,
                isBeam && styles.beamCell,
                isEntry && { borderColor: accent },
                isTarget && { borderColor: accent },
                isBlocker && styles.blockerCell,
              ];

              if (mirror) {
                const orientation = orientations[mirror.id] ?? 'slash';
                return (
                  <Pressable
                    key={key}
                    testID={`pp-mirror-${mirror.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Mirror ${mirror.id}: ${orientation}`}
                    onPress={() => handleRotate(mirror.id)}
                    style={({ pressed }) => [
                      ...baseStyles,
                      styles.mirrorCell,
                      pressed && styles.mirrorPressed,
                    ]}
                  >
                    <Text style={[styles.mirrorGlyph, { color: accent }]}>
                      {mirrorGlyph(orientation)}
                    </Text>
                  </Pressable>
                );
              }

              return (
                <View key={key} testID={`pp-cell-${key}`} style={baseStyles}>
                  {isEntry ? (
                    <Text style={[styles.entryText, { color: accent }]}>IN</Text>
                  ) : isTarget ? (
                    <Text accessibilityLabel="target" style={[styles.targetText, { color: accent }]}>
                      ★
                    </Text>
                  ) : isBlocker ? (
                    <Text accessibilityLabel="blocker" style={styles.blockerText}>
                      ×
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <Pressable
        testID="pp-submit"
        accessibilityRole="button"
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: accent },
          pressed && styles.submitPressed,
        ]}
      >
        <Text style={styles.submitText}>Fire beam</Text>
      </Pressable>

      <Text
        testID="pp-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {trace.reachedTarget
          ? 'Beam preview reaches the star.'
          : `Beam currently ${trace.exitReason.replace('_', ' ')}.`}
      </Text>
    </View>
  );
}

PrismPathCard.displayName = 'PrismPathCard';

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  board: {
    gap: space.xs,
    padding: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    ...elevation.card,
  },
  row: {
    flexDirection: 'row',
    gap: space.xs,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  beamCell: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(91, 140, 255, 0.18)',
  },
  mirrorCell: {
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  mirrorPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.98 }],
  },
  blockerCell: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mirrorGlyph: {
    fontSize: 28,
    fontWeight: fontWeight.heavy,
    lineHeight: 30,
  },
  entryText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  targetText: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
  },
  blockerText: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: fontWeight.bold,
  },
  submit: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  submitPressed: {
    transform: [{ scale: 0.99 }],
  },
  submitText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  status: {
    minHeight: fontSize.md,
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
