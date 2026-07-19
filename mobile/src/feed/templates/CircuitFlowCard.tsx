import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import type {
  CircuitFlowCard as CircuitFlowCardType,
  CircuitRotation,
  GridDirection,
} from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  evaluateCircuitFlow,
  initialCircuitRotations,
  rotatedCircuitConnections,
  type CircuitRotationMap,
} from '../../core/templates/circuitFlow/circuitFlowEvaluator';
import {
  colors,
  elevation,
  fontSize,
  fontWeight,
  radius,
  space,
  TAP_TARGET_MIN,
} from './tokens';
import { useGameTheme } from './GameTheme';

export type CircuitFlowCardProps = TemplateProps<CircuitFlowCardType> & {
  now?: () => number;
};

const DEMO_CONNECT_MS = 1200;
const DEMO_COMPLETE_MS = 2400;
const DEMO_CLOSE_MS = 3600;
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';

type DemoStep = 0 | 1 | 2;
function armStyle(direction: GridDirection, color: string): ViewStyle {
  const common: ViewStyle = {
    position: 'absolute',
    backgroundColor: color,
    borderRadius: 8,
  };
  if (direction === 'up')
    return {
      ...common,
      width: 8,
      height: '50%',
      left: '50%',
      top: 0,
      marginLeft: -4,
    };
  if (direction === 'down')
    return {
      ...common,
      width: 8,
      height: '50%',
      left: '50%',
      bottom: 0,
      marginLeft: -4,
    };
  if (direction === 'left')
    return {
      ...common,
      height: 8,
      width: '50%',
      left: 0,
      top: '50%',
      marginTop: -4,
    };
  return {
    ...common,
    height: 8,
    width: '50%',
    right: 0,
    top: '50%',
    marginTop: -4,
  };
}

export default function CircuitFlowCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: CircuitFlowCardProps) {
  const theme = useGameTheme();
  const { accent } = theme;
  const [rotations, setRotations] = useState<CircuitRotationMap>(() =>
    initialCircuitRotations(card.config.tiles),
  );
  const rotationsRef = useRef(rotations);
  const rotationsUsedRef = useRef(0);
  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(0);
  const [showYourTurn, setShowYourTurn] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const endpointTileIds = useMemo(
    () =>
      new Set(
        card.config.tiles
          .filter(
            (tile) =>
              tile.id !== card.config.sourceTileId &&
              tile.connections.length === 1,
          )
          .map((tile) => tile.id),
      ),
    [card.config.sourceTileId, card.config.tiles],
  );

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
    const completeTimer = setTimeout(
      () => setDemoStep(2),
      DEMO_COMPLETE_MS,
    );
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(connectTimer);
      clearTimeout(completeTimer);
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
    timeoutSignals: () => ({
      ...evaluateCircuitFlow(
        card.config,
        rotationsRef.current,
        rotationsUsedRef.current,
      ).signals,
      time_to_interaction: firstInputElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });
  const markFirstInput = useCallback(() => {
    if (firstInputElapsedRef.current !== null) return;
    setHasInteracted(true);
    setShowYourTurn(false);
    const elapsed = now() - context.interactionEnabledAtMs;
    firstInputElapsedRef.current = elapsed;
    onAttempt({ time_to_interaction: elapsed });
    attemptCountRef.current = timer.markAttempt();
  }, [context.interactionEnabledAtMs, now, onAttempt, timer]);
  const rotate = useCallback(
    (tileId: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      rotationsUsedRef.current += 1;
      setRotations((current) => {
        const next = {
          ...current,
          [tileId]: (((current[tileId] ?? 0) + 1) % 4) as CircuitRotation,
        };
        rotationsRef.current = next;
        return next;
      });
    },
    [markFirstInput],
  );
  const preview = useMemo(
    () => evaluateCircuitFlow(card.config, rotations, rotationsUsedRef.current),
    [card.config, rotations],
  );
  const submit = useCallback(() => {
    if (resolvedRef.current) return;
    markFirstInput();
    const result = evaluateCircuitFlow(
      card.config,
      rotationsRef.current,
      rotationsUsedRef.current,
    );
    const resolvedAt = now();
    timer.resolve({
      cardId: card.cardId,
      resolutionType: result.resolutionType,
      isCorrect: result.isCorrect,
      elapsedMs: resolvedAt - context.activeAtMs,
      interactionElapsedMs: resolvedAt - context.interactionEnabledAtMs,
      attemptCount: attemptCountRef.current,
      signals: {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: result.isCorrect,
        elapsed: resolvedAt - context.interactionEnabledAtMs,
      },
    });
  }, [card.cardId, card.config, context, markFirstInput, now, timer]);
  return (
    <View accessibilityLabel="Circuit flow" style={styles.section}>
      <View style={styles.demoLaunchRow}>
        <Text
          style={[styles.eyebrow, { color: accent }]}
        >
          CIRCUIT FLOW · ROTATE
        </Text>
        {!hasInteracted ? (
          <Pressable
            testID="cf-demo-button"
            accessibilityRole="button"
            accessibilityLabel="Watch Circuit Flow demo"
            accessibilityHint={DEMO_TIME_HINT}
            onPress={openDemo}
            style={({ pressed }) => [
              styles.demoButton,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.surfaceStrong },
            ]}
          >
            <Text
              style={[styles.demoButtonText, { color: accent }]}
            >
              Watch demo
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text testID="cf-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>
      {showYourTurn && !hasInteracted ? (
        <Text
          testID="cf-your-turn"
          accessibilityLiveRegion="polite"
          style={[styles.yourTurn, { borderColor: accent, color: accent }]}
        >
          Your turn — rotate the tiles, then tap Test flow.
        </Text>
      ) : null}
      <View
        testID="cf-grid"
        style={[
          styles.board,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {Array.from({ length: card.config.rows }, (_, row) => (
          <View key={row} style={styles.row}>
            {card.config.tiles
              .filter((tile) => tile.row === row)
              .sort((a, b) => a.column - b.column)
              .map((tile) => {
                const rotation = rotations[tile.id] ?? tile.initialRotation;
                const isSource = tile.id === card.config.sourceTileId;
                const isEndpoint = endpointTileIds.has(tile.id);
                const connections = rotatedCircuitConnections(
                  tile.connections,
                  rotation,
                );
                return (
                  <Pressable
                    key={tile.id}
                    testID={`cf-tile-${tile.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${isSource ? 'Start, pulse source, ' : isEndpoint ? 'End, ' : ''}tile ${tile.id}, rotation ${rotation}`}
                    onPress={() => rotate(tile.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      {
                        backgroundColor: theme.surfaceRaised,
                        borderColor: theme.border,
                      },
                      isSource && { borderColor: accent, borderWidth: 2 },
                      isEndpoint && {
                        borderColor: accent,
                        borderWidth: 2,
                        borderStyle: 'dashed',
                      },
                      pressed && { backgroundColor: theme.surfaceStrong },
                    ]}
                  >
                    {isSource || isEndpoint ? (
                      <Text
                        testID={`cf-${isSource ? 'start' : 'end'}-${tile.id}`}
                        style={[
                          styles.anchorBadge,
                          {
                            backgroundColor: isSource
                              ? accent
                              : theme.surfaceRaised,
                            borderColor: accent,
                            color: isSource
                              ? colors.accentContrast
                              : accent,
                          },
                        ]}
                      >
                        {isSource ? 'START' : 'END'}
                      </Text>
                    ) : null}
                    {connections.map((direction) => (
                      <View
                        key={direction}
                        style={armStyle(direction, accent)}
                      />
                    ))}
                    <View
                      style={[
                        styles.node,
                        { backgroundColor: accent },
                        isSource && styles.sourceNode,
                        isEndpoint && styles.endpointNode,
                      ]}
                    >
                      {isSource ? <View style={styles.sourceCore} /> : null}
                    </View>
                  </Pressable>
                );
              })}
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <Text
          testID="cf-status"
          accessibilityLiveRegion="polite"
          style={styles.status}
        >
          {preview.signals.connected_tiles}/{preview.signals.total_tiles} linked
          · {preview.signals.dangling_connections} loose
        </Text>
        <Pressable
          testID="cf-submit"
          accessibilityRole="button"
          onPress={submit}
          style={({ pressed }) => [
            styles.submit,
            { backgroundColor: accent },
            pressed && { backgroundColor: theme.deep },
          ]}
        >
          <Text style={styles.submitText}>Test flow</Text>
        </Pressable>
      </View>
      <CircuitDemo
        visible={demoOpen}
        step={demoStep}
        accent={accent}
        onClose={finishDemo}
      />
    </View>
  );
}

function CircuitDemo({
  visible,
  step,
  accent,
  onClose,
}: {
  visible: boolean;
  step: DemoStep;
  accent: string;
  onClose: () => void;
}) {
  const firstDirection: GridDirection = step === 0 ? 'down' : 'right';
  const instruction =
    step === 0
      ? 'Tap a tile to rotate its wires.'
      : step === 1
        ? 'Rotate until neighboring wires meet.'
        : 'Connected! Build one path with no loose ends.';
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
        accessibilityLabel="Circuit Flow demonstration"
      >
        <View style={styles.demoPanel}>
          <Text style={styles.demoTitle}>How Circuit Flow works</Text>
          <Text
            testID="cf-demo-instruction"
            accessibilityLiveRegion="polite"
            style={styles.demoInstruction}
          >
            {instruction}
          </Text>
          <View style={styles.demoCircuit}>
            <View
              testID="cf-demo-source"
              style={[
                styles.demoTile,
                step >= 1 && { borderColor: accent },
              ]}
            >
              <View style={armStyle(firstDirection, accent)} />
              <View
                style={[
                  styles.node,
                  styles.sourceNode,
                  { backgroundColor: accent },
                ]}
              >
                <View style={styles.sourceCore} />
              </View>
            </View>
            <View
              testID="cf-demo-target"
              style={[
                styles.demoTile,
                step >= 2 && { borderColor: accent },
              ]}
            >
              <View style={armStyle('left', accent)} />
              <View style={[styles.node, { backgroundColor: accent }]} />
            </View>
          </View>
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
            testID="cf-demo-skip"
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
  section: { gap: space.md },
  demoLaunchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  eyebrow: { fontSize: 11, fontWeight: fontWeight.heavy, letterSpacing: 2 },
  demoButton: {
    minHeight: TAP_TARGET_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    lineHeight: 32,
    fontWeight: fontWeight.bold,
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
    gap: 6,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(3,8,18,.48)',
  },
  row: { flexDirection: 'row', gap: 6 },
  tile: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...elevation.tile,
  },
  anchorBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    fontSize: 8,
    fontWeight: fontWeight.heavy,
    letterSpacing: 0.5,
  },
  node: { width: 18, height: 18, borderRadius: 9, zIndex: 2 },
  sourceNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endpointNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accentContrast,
  },
  sourceCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentContrast,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  status: { color: colors.textMuted, fontSize: 11, flexShrink: 1 },
  submit: {
    minHeight: TAP_TARGET_MIN,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: colors.accentContrast, fontWeight: fontWeight.bold },
  pressed: { transform: [{ scale: 0.97 }] },
  demoBackdrop: {
    flex: 1,
    padding: space.xl,
    backgroundColor: 'rgba(4,6,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPanel: {
    width: '100%',
    maxWidth: 360,
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
    minHeight: 42,
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  demoCircuit: { flexDirection: 'row', gap: space.sm },
  demoTile: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  demoProgress: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: space.sm,
  },
  demoDot: { width: 8, height: 8, borderRadius: 4 },
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
