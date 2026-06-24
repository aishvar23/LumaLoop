/**
 * Prism Path renderer — React Native.
 *
 * A visually focused mirror-routing game: tap mirrors to rotate them, watch the
 * beam preview update, then fire the beam. Correctness and trace signals come
 * from the shared pure evaluator.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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

const PRISM_PATH_DESCRIPTION =
  'Rotate mirrors to bend the beam from IN to the star while avoiding blocker squares. Use the live preview, then fire only when the route reaches the target.';
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';
const DEMO_CONNECT_MS = 1300;
const DEMO_TARGET_MS = 2600;
const DEMO_CLOSE_MS = 4200;

type DemoStep = 0 | 1 | 2;

const DEMO_CONFIG: PrismPathCardType['config'] = {
  rows: 3,
  columns: 4,
  entry: { row: 2, column: 0 },
  entryDirection: 'right',
  target: { row: 0, column: 3 },
  mirrors: [
    { id: 'demo-a', row: 2, column: 1, initialOrientation: 'backslash' },
    { id: 'demo-b', row: 0, column: 1, initialOrientation: 'backslash' },
  ],
  blockers: [{ row: 0, column: 0 }],
  solution: [
    { mirrorId: 'demo-a', orientation: 'slash' },
    { mirrorId: 'demo-b', orientation: 'slash' },
  ],
  timeLimitMs: 0,
};

function demoOrientationsForStep(step: DemoStep): PrismPathOrientationMap {
  if (step === 0) {
    return { 'demo-a': 'backslash', 'demo-b': 'backslash' };
  }
  if (step === 1) {
    return { 'demo-a': 'slash', 'demo-b': 'backslash' };
  }
  return { 'demo-a': 'slash', 'demo-b': 'slash' };
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
  const theme = useGameTheme();
  const { accent } = theme;
  const [orientations, setOrientations] = useState<PrismPathOrientationMap>(() =>
    initialOrientationMap(config.mirrors),
  );
  const rotationsRef = useRef(0);
  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(0);
  const [showYourTurn, setShowYourTurn] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const finishDemo = useCallback(() => {
    setDemoOpen(false);
    setDemoStep(0);
    setShowYourTurn(true);
  }, []);

  useEffect(() => {
    if (!demoOpen) return undefined;
    setDemoStep(0);
    const connectTimer = setTimeout(
      () => setDemoStep(1),
      DEMO_CONNECT_MS,
    );
    const targetTimer = setTimeout(() => setDemoStep(2), DEMO_TARGET_MS);
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(connectTimer);
      clearTimeout(targetTimer);
      clearTimeout(closeTimer);
    };
  }, [demoOpen, finishDemo]);

  const openDemo = useCallback(() => {
    if (resolvedRef.current || hasInteracted) return;
    setShowYourTurn(false);
    setDemoStep(0);
    setDemoOpen(true);
  }, [hasInteracted]);

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
    setHasInteracted(true);
    setShowYourTurn(false);
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
    <View
      style={styles.section}
      accessibilityLabel="Prism path"
      accessibilityHint={PRISM_PATH_DESCRIPTION}
    >
      <View style={styles.demoLaunchRow}>
        <Text
          testID="pp-description-trigger"
          accessibilityHint={PRISM_PATH_DESCRIPTION}
          style={[styles.eyebrow, { color: accent }]}
        >
          PRISM PATH · MIRROR ROUTING
        </Text>
        {!hasInteracted ? (
          <Pressable
            testID="pp-demo-button"
            accessibilityRole="button"
            accessibilityLabel="Watch Prism Path demo"
            accessibilityHint={DEMO_TIME_HINT}
            onPress={openDemo}
            style={({ pressed }) => [
              styles.demoButton,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.surfaceStrong },
            ]}
          >
            <Text style={[styles.demoButtonText, { color: accent }]}>
              Watch demo
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text testID="pp-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>
      {showYourTurn && !hasInteracted ? (
        <Text
          testID="pp-your-turn"
          accessibilityLiveRegion="polite"
          style={[styles.yourTurn, { borderColor: accent, color: accent }]}
        >
          Your turn — rotate mirrors until the preview reaches the star.
        </Text>
      ) : null}

      <View
        testID="pp-board"
        accessibilityLabel="Mirror beam grid"
        style={[
          styles.board,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
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
                {
                  backgroundColor: theme.surfaceRaised,
                  borderColor: theme.border,
                },
                isBeam && {
                  backgroundColor: theme.surfaceStrong,
                  borderColor: accent,
                },
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
                      { backgroundColor: theme.surfaceRaised },
                      pressed && {
                        backgroundColor: theme.surfaceStrong,
                        borderColor: accent,
                      },
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
          pressed && { backgroundColor: theme.deep },
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
      <PrismDemo
        visible={demoOpen}
        step={demoStep}
        accent={accent}
        surface={theme.surface}
        surfaceRaised={theme.surfaceRaised}
        border={theme.border}
        onClose={finishDemo}
      />
    </View>
  );
}

PrismPathCard.displayName = 'PrismPathCard';

function PrismDemo({
  visible,
  step,
  accent,
  surface,
  surfaceRaised,
  border,
  onClose,
}: {
  visible: boolean;
  step: DemoStep;
  accent: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  onClose: () => void;
}) {
  const orientations = demoOrientationsForStep(step);
  const trace = tracePrismPath(DEMO_CONFIG, orientations);
  const pathSet = new Set(trace.cells.map(coordKey));
  const blockerSet = new Set(DEMO_CONFIG.blockers.map(coordKey));
  const mirrorByCoord = new Map<string, (typeof DEMO_CONFIG.mirrors)[number]>();
  for (const mirror of DEMO_CONFIG.mirrors) {
    mirrorByCoord.set(coordKey(mirror), mirror);
  }
  const instruction =
    step === 0
      ? 'The beam starts at IN and follows the current mirror angle.'
      : step === 1
        ? 'One mirror turns the beam upward, but the next angle still hits a block.'
        : 'Rotate the second mirror and the beam reaches the star.';
  const rows = Array.from({ length: DEMO_CONFIG.rows }, (_, row) =>
    Array.from({ length: DEMO_CONFIG.columns }, (_, column) => ({
      row,
      column,
    })),
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={styles.demoBackdrop}
        accessibilityViewIsModal
        accessibilityLabel="Prism Path demonstration"
      >
        <View style={styles.demoPanel}>
          <Text style={styles.demoTitle}>How Prism Path works</Text>
          <Text
            testID="pp-demo-instruction"
            accessibilityLiveRegion="polite"
            style={styles.demoInstruction}
          >
            {instruction}
          </Text>
          <View
            testID="pp-demo-board"
            accessibilityLabel="Separate Prism Path demo board"
            style={[
              styles.demoBoard,
              { backgroundColor: surface, borderColor: border },
            ]}
          >
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((coord) => {
                  const key = coordKey(coord);
                  const mirror = mirrorByCoord.get(key);
                  const isEntry =
                    coord.row === DEMO_CONFIG.entry.row &&
                    coord.column === DEMO_CONFIG.entry.column;
                  const isTarget =
                    coord.row === DEMO_CONFIG.target.row &&
                    coord.column === DEMO_CONFIG.target.column;
                  const isBlocker = blockerSet.has(key);
                  const isBeam = pathSet.has(key);

                  return (
                    <View
                      key={key}
                      testID={`pp-demo-cell-${key}`}
                      style={[
                        styles.demoCell,
                        { backgroundColor: surfaceRaised, borderColor: border },
                        isBeam && {
                          backgroundColor: 'rgba(91, 140, 255, 0.22)',
                          borderColor: accent,
                        },
                        isEntry && { borderColor: accent },
                        isTarget && { borderColor: accent },
                        isBlocker && styles.blockerCell,
                      ]}
                    >
                      {mirror ? (
                        <Text style={[styles.demoMirrorGlyph, { color: accent }]}>
                          {mirrorGlyph(orientations[mirror.id] ?? 'slash')}
                        </Text>
                      ) : isEntry ? (
                        <Text style={[styles.entryText, { color: accent }]}>
                          IN
                        </Text>
                      ) : isTarget ? (
                        <Text
                          accessibilityLabel="target"
                          style={[styles.targetText, { color: accent }]}
                        >
                          ★
                        </Text>
                      ) : isBlocker ? (
                        <Text
                          accessibilityLabel="blocker"
                          style={styles.blockerText}
                        >
                          ×
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.demoCaption}>
            Demo uses a separate mini board, not this puzzle’s answer.
          </Text>
          <View style={styles.demoProgress} accessibilityElementsHidden>
            {[0, 1, 2].map((item) => (
              <View
                key={item}
                style={[
                  styles.demoDot,
                  { backgroundColor: item <= step ? accent : colors.border },
                ]}
              />
            ))}
          </View>
          <Pressable
            testID="pp-demo-skip"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.demoSkip}
          >
            <Text style={styles.demoSkipText}>Skip demo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  demoLaunchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: fontWeight.heavy,
    letterSpacing: 2,
  },
  demoButton: {
    minHeight: TAP_TARGET_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.heavy,
    lineHeight: fontSize.hero * lineHeight.tight,
  },
  yourTurn: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
  demoBackdrop: {
    flex: 1,
    padding: space.xl,
    backgroundColor: 'rgba(4,6,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPanel: {
    width: '100%',
    maxWidth: 390,
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#151923',
    ...elevation.card,
  },
  demoTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
  },
  demoInstruction: {
    minHeight: 52,
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  demoBoard: {
    gap: space.xs,
    padding: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  demoCell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  demoMirrorGlyph: {
    fontSize: 24,
    fontWeight: fontWeight.heavy,
    lineHeight: 26,
  },
  demoCaption: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  demoProgress: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: space.sm,
  },
  demoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demoSkip: {
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoSkipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
