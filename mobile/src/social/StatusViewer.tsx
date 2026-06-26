/**
 * Status story viewer (accounts pivot) — React Native counterpart of web
 * `src/social/StatusViewer.tsx`. A WhatsApp/IG-style full-screen modal that plays
 * through ONE user's recent shares (a {@link UserStatus}).
 *
 * Segmented progress bars on top (one per share); the active segment animates over
 * `autoAdvanceMs` and then advances, closing past the last share. Tapping the
 * right half advances, the left half goes back. Each share shows the game + the
 * player's result and a "Play" CTA back into the feed.
 *
 * Presentational only (CLAUDE.md §4): navigation is the caller's job via `onPlay`
 * / `onClose`. Pass `autoAdvanceMs={0}` to disable auto-advance (reduce motion /
 * tests).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRelativeTime } from './relativeTime';
import type { ShareItem, UserStatus } from './statusFeed';
import { useReducedMotion } from '../feed/useReducedMotion';
import {
  categoryAccent,
  colors,
  fontSize,
  fontWeight,
  radius,
  space,
} from '../feed/templates/tokens';

export interface StatusViewerProps {
  status: UserStatus;
  onClose: () => void;
  onPlay: (item: ShareItem) => void;
  /** ms each share is shown before auto-advancing; 0 disables it. Default 4000. */
  autoAdvanceMs?: number;
  /** Optional cardId → category for accent tinting. */
  categoryForCard?: (cardId: string) => string | undefined;
}

export default function StatusViewer({
  status,
  onClose,
  onPlay,
  autoAdvanceMs = 4000,
  categoryForCard,
}: StatusViewerProps) {
  const [index, setIndex] = useState(0);
  const items = status.items;
  const item = items[index];
  const reducedMotion = useReducedMotion();
  const effectiveMs = reducedMotion ? 0 : autoAdvanceMs;

  const progress = useRef(new Animated.Value(0)).current;

  function next() {
    setIndex((i) => {
      if (i >= items.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // Animate the active segment + auto-advance when it completes.
  useEffect(() => {
    if (effectiveMs <= 0) return undefined;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: effectiveMs,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) next();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, effectiveMs, items.length]);

  if (!item) return null;
  const accent = categoryAccent(categoryForCard?.(item.cardId)).accent;
  const who = status.handle ? `@${status.handle}` : status.displayName ?? 'Someone';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} testID="status-viewer">
        {/* Tap zones behind the content. */}
        <Pressable
          style={[styles.zone, styles.zoneLeft]}
          accessibilityLabel="Previous"
          testID="status-prev"
          onPress={prev}
        />
        <Pressable
          style={[styles.zone, styles.zoneRight]}
          accessibilityLabel="Next"
          testID="status-next"
          onPress={next}
        />

        <View style={styles.top} pointerEvents="box-none">
          <View style={styles.segments} pointerEvents="none">
            {items.map((it, i) => (
              <View key={it.id} style={styles.segment}>
                <Animated.View
                  style={[
                    styles.segmentFill,
                    i < index && styles.segmentFull,
                    i === index && effectiveMs > 0
                      ? {
                          width: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        }
                      : i === index
                        ? styles.segmentFull
                        : null,
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.head}>
            <View style={[styles.avatar, { backgroundColor: accent }]}>
              {status.avatarUrl ? (
                <Image
                  source={{ uri: status.avatarUrl }}
                  style={styles.avatarImg}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.avatarText}>{status.monogram}</Text>
              )}
            </View>
            <View style={styles.id}>
              <Text style={styles.who}>{who}</Text>
              <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="status-close"
              hitSlop={12}
              onPress={onClose}
            >
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { borderColor: accent }]} pointerEvents="box-none">
          <Text style={styles.kicker}>SHARED A GAME</Text>
          <Text style={styles.game}>{item.gameTitle}</Text>
          <Text style={styles.result}>
            {item.outcomeLabel}
            {item.points > 0 ? ` · +${item.points} pts` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.gameTitle}`}
            testID="status-play"
            onPress={() => onPlay(item)}
            style={[styles.play, { backgroundColor: accent }]}
          >
            <Text style={styles.playText}>▶ Play</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(6,7,11,0.96)',
    paddingHorizontal: space.lg,
    paddingTop: 60,
    paddingBottom: space.xl,
  },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
  },
  zoneLeft: { left: 0 },
  zoneRight: { right: 0 },
  top: {
    width: '100%',
    gap: space.md,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    width: '0%',
    backgroundColor: colors.text,
    borderRadius: radius.pill,
  },
  segmentFull: {
    width: '100%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    color: colors.accentContrast,
    fontWeight: fontWeight.bold,
  },
  id: { flex: 1 },
  who: { color: colors.text, fontWeight: fontWeight.semibold },
  time: { color: colors.textMuted, fontSize: fontSize.sm },
  close: { color: colors.text, fontSize: fontSize.lg, paddingHorizontal: space.sm },
  card: {
    marginTop: 'auto',
    marginBottom: 'auto',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  kicker: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    letterSpacing: 1.5,
  },
  game: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  result: { color: colors.textMuted, fontSize: fontSize.md },
  play: {
    marginTop: space.md,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  playText: {
    color: colors.accentContrast,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
});
