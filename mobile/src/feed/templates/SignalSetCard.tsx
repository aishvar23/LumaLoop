import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  SignalFill,
  SignalSetCard as SignalSetCardType,
  SignalShape,
  SignalTile,
} from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateSignalSet } from '../../core/templates/signalSet/signalSetEvaluator';
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

export type SignalSetCardProps = TemplateProps<SignalSetCardType> & {
  now?: () => number;
};
const GLYPHS: Readonly<
  Record<SignalShape, Readonly<Record<SignalFill, string>>>
> = {
  circle: { solid: '●', striped: '◉', outline: '○' },
  triangle: { solid: '▲', striped: '⟁', outline: '△' },
  diamond: { solid: '◆', striped: '◈', outline: '◇' },
};
function tileLabel(tile: SignalTile): string {
  return `${tile.count} ${tile.fill} ${tile.shape}${tile.count === 1 ? '' : 's'}`;
}

// ── Demo (teaching example) — mirrors the Prism Path / Circuit Flow convention:
// a "Watch demo" pill that opens a stepped overlay showing a SEPARATE example
// trio (never this card's puzzle). The example is a fixed, hand-checked VALID
// trio under the evaluator's rule (each feature all-same OR all-different): same
// shape (circle), same fill (solid), all different counts (1/2/3). Keeping TWO
// features the same is a signature no catalog solution uses, so it can never
// reveal a real answer.
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';
const DEMO_SHAPE_MS = 1500;
const DEMO_FILL_MS = 3000;
const DEMO_COUNT_MS = 4500;
const DEMO_CLOSE_MS = 6000;

type DemoStep = 0 | 1 | 2 | 3;

export const DEMO_TILES: readonly [SignalTile, SignalTile, SignalTile] = [
  { id: 'demo-1', shape: 'circle', fill: 'solid', count: 1 },
  { id: 'demo-2', shape: 'circle', fill: 'solid', count: 2 },
  { id: 'demo-3', shape: 'circle', fill: 'solid', count: 3 },
];

const DEMO_STEPS: ReadonlyArray<{
  feature: 'shape' | 'fill' | 'count' | null;
  text: string;
}> = [
  {
    feature: null,
    text: 'A valid trio needs each feature to be all the same or all different.',
  },
  { feature: 'shape', text: 'Shape: all three are circles — all the same.' },
  { feature: 'fill', text: 'Fill: all three are solid — all the same.' },
  {
    feature: 'count',
    text: 'Count: one, two, three — all different. Every feature checks out, so the trio is valid.',
  },
];

export default function SignalSetCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: SignalSetCardProps) {
  const theme = useGameTheme();
  const { accent } = theme;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
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
    const shapeTimer = setTimeout(() => setDemoStep(1), DEMO_SHAPE_MS);
    const fillTimer = setTimeout(() => setDemoStep(2), DEMO_FILL_MS);
    const countTimer = setTimeout(() => setDemoStep(3), DEMO_COUNT_MS);
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(shapeTimer);
      clearTimeout(fillTimer);
      clearTimeout(countTimer);
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
      ...evaluateSignalSet(card.config, selectedRef.current).signals,
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
  const toggle = useCallback(
    (tileId: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      setSelectedIds((current) => {
        const next = current.includes(tileId)
          ? current.filter((id) => id !== tileId)
          : current.length < 3
            ? [...current, tileId]
            : current;
        selectedRef.current = next;
        return next;
      });
    },
    [markFirstInput],
  );
  const submit = useCallback(() => {
    if (resolvedRef.current || selectedRef.current.length !== 3) return;
    const result = evaluateSignalSet(card.config, selectedRef.current);
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
  }, [card.cardId, card.config, context, now, timer]);
  return (
    <View accessibilityLabel="Signal set" style={styles.section}>
      <View style={styles.demoLaunchRow}>
        <Text style={[styles.eyebrow, { color: accent }]}>
          SIGNAL SET · PICK 3
        </Text>
        {!hasInteracted ? (
          <Pressable
            testID="ss-demo-button"
            accessibilityRole="button"
            accessibilityLabel="Watch Signal Set demo"
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
      <Text testID="ss-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>
      {showYourTurn && !hasInteracted ? (
        <Text
          testID="ss-your-turn"
          accessibilityLiveRegion="polite"
          style={[styles.yourTurn, { borderColor: accent, color: accent }]}
        >
          Your turn — pick three so each feature is all same or all different.
        </Text>
      ) : null}
      <View
        accessibilityRole="summary"
        style={[
          styles.grid,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {card.config.tiles.map((tile) => {
          const selected = selectedIds.includes(tile.id);
          return (
            <Pressable
              key={tile.id}
              testID={`ss-tile-${tile.id}`}
              accessibilityRole="button"
              accessibilityLabel={tileLabel(tile)}
              accessibilityState={{ selected }}
              onPress={() => toggle(tile.id)}
              style={({ pressed }) => [
                styles.tile,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceRaised,
                },
                selected && {
                  borderColor: accent,
                  backgroundColor: theme.surfaceStrong,
                },
                pressed && { backgroundColor: theme.surfaceStrong },
              ]}
            >
              <Text
                style={[
                  styles.glyph,
                  { color: selected ? accent : colors.text },
                ]}
              >
                {Array.from(
                  { length: tile.count },
                  () => GLYPHS[tile.shape][tile.fill],
                ).join(' ')}
              </Text>
              {/* No visible fill label: the glyph itself shows fill (solid ●,
                  striped ◉, outline ○). Printing "SOLID"/"STRIPED"/"OUTLINE"
                  telegraphed the puzzle; the full description stays on the tile's
                  accessibilityLabel for screen readers. */}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Text
          testID="ss-status"
          accessibilityLiveRegion="polite"
          style={styles.status}
        >
          {selectedIds.length}/3 selected
        </Text>
        <Pressable
          testID="ss-submit"
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedIds.length !== 3 }}
          disabled={selectedIds.length !== 3}
          onPress={submit}
          style={({ pressed }) => [
            styles.submit,
            { backgroundColor: accent },
            selectedIds.length !== 3 && styles.disabled,
            pressed && { backgroundColor: theme.deep },
          ]}
        >
          <Text style={styles.submitText}>Lock trio</Text>
        </Pressable>
      </View>
      <SignalSetDemo
        visible={demoOpen}
        step={demoStep}
        accent={accent}
        surfaceRaised={theme.surfaceRaised}
        border={theme.border}
        onClose={finishDemo}
      />
    </View>
  );
}

SignalSetCard.displayName = 'SignalSetCard';

function SignalSetDemo({
  visible,
  step,
  accent,
  surfaceRaised,
  border,
  onClose,
}: {
  visible: boolean;
  step: DemoStep;
  accent: string;
  surfaceRaised: string;
  border: string;
  onClose: () => void;
}) {
  const current = DEMO_STEPS[step];
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
        accessibilityLabel="Signal Set demonstration"
      >
        <View style={styles.demoPanel}>
          <Text style={styles.demoTitle}>How Signal Set works</Text>
          <Text
            testID="ss-demo-instruction"
            accessibilityLiveRegion="polite"
            style={styles.demoInstruction}
          >
            {current.text}
          </Text>
          <View
            testID="ss-demo-board"
            accessibilityLabel="Separate Signal Set demo trio"
            style={[styles.demoBoard, { borderColor: border }]}
          >
            {DEMO_TILES.map((tile) => {
              const highlighted = current.feature !== null;
              return (
                <View
                  key={tile.id}
                  testID={`ss-demo-tile-${tile.id}`}
                  accessibilityLabel={tileLabel(tile)}
                  style={[
                    styles.demoTile,
                    { backgroundColor: surfaceRaised, borderColor: border },
                    highlighted && { borderColor: accent },
                  ]}
                >
                  <Text style={[styles.demoGlyph, { color: accent }]}>
                    {Array.from(
                      { length: tile.count },
                      () => GLYPHS[tile.shape][tile.fill],
                    ).join(' ')}
                  </Text>
                  <Text style={styles.demoTileMeta}>
                    {current.feature === 'shape'
                      ? tile.shape.toUpperCase()
                      : current.feature === 'count'
                        ? `COUNT ${tile.count}`
                        : tile.fill.toUpperCase()}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.demoCaption}>
            Demo uses a separate trio, not this card’s answer.
          </Text>
          <View style={styles.demoProgress} accessibilityElementsHidden>
            {[0, 1, 2, 3].map((item) => (
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
            testID="ss-demo-skip"
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
  eyebrow: { fontSize: 11, fontWeight: fontWeight.heavy, letterSpacing: 2 },
  prompt: {
    color: colors.text,
    fontSize: fontSize.hero,
    lineHeight: 32,
    fontWeight: fontWeight.bold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  tile: {
    width: '48.5%',
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    ...elevation.tile,
  },
  glyph: { fontSize: 26, fontWeight: fontWeight.bold },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  status: { color: colors.textMuted, fontSize: fontSize.sm },
  submit: {
    minHeight: TAP_TARGET_MIN,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: colors.accentContrast, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.42 },
  pressed: { transform: [{ scale: 0.97 }] },
  demoLaunchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
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
  yourTurn: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  demoTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  demoGlyph: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  demoTileMeta: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'center',
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
