/**
 * Odd One Out renderer — React Native (Design §9; Technical Design §6, §7, §14).
 *
 * Native rebuild of web `src/templates/oddOneOut/OddOneOutCard.tsx` — same
 * behaviour and signals, RN primitives instead of DOM. A conceptual
 * pattern-recognition template and a single-phase, one-move pick (the shape of
 * tiny_logic, but the "options" are the items themselves — tap the one that does
 * not belong). Stem-free: the items mount immediately, so interaction is enabled
 * at the engage instant and `elapsedMs`/`interactionElapsedMs` share an origin.
 *
 * Resolution semantics: the FIRST committed pick resolves the card — correct iff
 * `oddItemId`, else incorrect (the wrong pick is the recorded distractor). No
 * retry affordance. Correctness + the chosen distractor come from the pure
 * {@link evaluateOddOneOut} (the single source of truth), never re-derived. The
 * feed-level FeedbackGate shows the uniform explanation (which states the shared
 * rule) after resolution, so this renderer does not reveal it itself.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` is armed via the
 * shared {@link useCardTimer}; on expiry the card resolves TIMEOUT.
 *
 * Accessibility (Technical Design §14): items are real buttons, large (≥
 * {@link TAP_TARGET_MIN}), labelled by their value, with explicit
 * `accessibilityState.selected` plus a polite live region — never colour or
 * position alone (the item LABEL carries the meaning).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderOptions } from '../../core/cards/optionOrder';
import type { OddOneOutCard as OddOneOutCardType } from '../../core/cards/types';
import type { CardResolution, TemplateProps } from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { evaluateOddOneOut } from '../../core/templates/oddOneOut/oddOneOutEvaluator';
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

export type OddOneOutCardProps = TemplateProps<OddOneOutCardType> & {
  now?: () => number;
};

export default function OddOneOutCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: OddOneOutCardProps) {
  const { config } = card;
  const theme = useGameTheme();

  const firstPickElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      time_to_interaction: firstPickElapsedRef.current ?? -1,
      selected_item_id: selectedId ?? '',
      distractor_item_id: '',
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handlePick = useCallback(
    (itemId: string) => {
      if (resolvedRef.current) return;

      const pickedAtMs = now();

      if (firstPickElapsedRef.current === null) {
        const tti = pickedAtMs - context.interactionEnabledAtMs;
        firstPickElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(itemId);

      const { isCorrect, distractorItemId } = evaluateOddOneOut(config, itemId);

      timer.resolve({
        cardId: card.cardId,
        resolutionType: isCorrect ? 'correct' : 'incorrect',
        isCorrect,
        elapsedMs: pickedAtMs - context.activeAtMs,
        interactionElapsedMs: pickedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_interaction: firstPickElapsedRef.current,
          selected_item_id: itemId,
          distractor_item_id: distractorItemId ?? '',
          correct: isCorrect,
          elapsed: pickedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      config,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      now,
      onAttempt,
      timer,
    ],
  );

  const selectedLabel = selectedId
    ? (config.items.find((item) => item.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.oddItemId
      ? `Correct: ${selectedLabel}`
      : `Incorrect: ${selectedLabel}.`;

  // Present items in a deterministic, card-seeded order so the odd one is not
  // positionally guessable (keyed by `oddItemId`, not slot). Stable across
  // renders and identical on web↔mobile.
  const orderedItems = useMemo(
    () => orderOptions(card.cardId, config.items),
    [card.cardId, config.items],
  );

  return (
    <View style={styles.section} accessibilityLabel="Odd one out">
      <Text testID="ooo-prompt" style={styles.prompt}>
        {card.prompt}
      </Text>
      <View
        accessibilityLabel="Tap the item that does not belong"
        style={styles.items}
      >
        {orderedItems.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              testID={`ooo-item-${item.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={item.label}
              onPress={() => handlePick(item.id)}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
                pressed && { backgroundColor: theme.surfaceStrong },
                isSelected && {
                  backgroundColor: theme.surfaceStrong,
                  borderColor: theme.accent,
                },
              ]}
            >
              {/* Non-colour selected cue: an explicit ▸ marker, not hue alone. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[
                  styles.itemText,
                  isSelected && styles.itemTextSelected,
                  isSelected && { color: theme.accent },
                ]}
              >
                {isSelected ? '▸ ' : ''}
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text testID="ooo-status" accessibilityLiveRegion="polite" style={styles.status}>
        {resultText}
      </Text>
    </View>
  );
}
OddOneOutCard.displayName = 'OddOneOutCard';

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
  // A two-column tappable grid of items (parity with the web layout).
  items: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    width: '100%',
  },
  item: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: TAP_TARGET_MIN + 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  itemText: {
    color: colors.text,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  itemTextSelected: {
    fontWeight: fontWeight.bold,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
