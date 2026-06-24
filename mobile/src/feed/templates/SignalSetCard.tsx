import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
      <Text style={[styles.eyebrow, { color: accent }]}>
        SIGNAL SET · PICK 3
      </Text>
      <Text testID="ss-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>
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
              <Text style={styles.meta}>{tile.fill.toUpperCase()}</Text>
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
    </View>
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
  meta: { color: colors.textMuted, fontSize: 10, letterSpacing: 1 },
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
});
