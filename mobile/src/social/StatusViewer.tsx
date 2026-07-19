/**
 * Status story viewer (accounts pivot) — React Native counterpart of web
 * `src/social/StatusViewer.tsx`. A WhatsApp/IG-style full-screen modal that plays
 * through ONE user's recent shares (a {@link UserStatus}), with an immersive,
 * category-tinted gradient background.
 *
 * Segmented progress bars on top (one per share); the active segment animates over
 * `autoAdvanceMs` and then advances, closing past the last share. Tapping the
 * right half advances, the left half goes back. Each share shows the game emblem,
 * the outcome + points, and a "Play" CTA back into the feed.
 *
 * Presentational only (CLAUDE.md §4): navigation is the caller's job via `onPlay`
 * / `onClose`. Pass `autoAdvanceMs={0}` to disable auto-advance (reduce motion /
 * tests).
 */
import { createElement, useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { getCardById as defaultGetCardById } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { CardStartContext } from '../core/templates/contract';
import {
  defaultRendererRegistry,
  resolveRenderer,
  type RendererRegistry,
  type TemplateRenderer,
} from '../feed/rendererRegistry';
import { formatRelativeTime } from './relativeTime';
import type { ShareItem, ShareOutcome, UserStatus } from './statusFeed';
import { useReducedMotion } from '../feed/useReducedMotion';
import { categoryAccent, colors, fontSize, fontWeight, radius, space } from '../feed/templates/tokens';

export interface StatusViewerProps {
  status: UserStatus;
  onClose: () => void;
  onPlay: (item: ShareItem) => void;
  /** ms each share is shown before auto-advancing; 0 disables it. Default 4000. */
  autoAdvanceMs?: number;
  /** Optional cardId → category for accent tinting. */
  categoryForCard?: (cardId: string) => string | undefined;
  /** Test seam: cardId → card for the faded preview. Defaults to the catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** Test seam: renderer registry for the faded preview. Defaults to the app's. */
  registry?: RendererRegistry;
}

/** Disarm the card's countdown so the faded preview never ticks (mirrors the feed). */
function previewCard(card: LiquidCard): LiquidCard {
  return {
    ...card,
    config: { ...card.config, timeLimitMs: Number.POSITIVE_INFINITY },
  } as LiquidCard;
}

function noop(): void {}
const PREVIEW_CONTEXT: CardStartContext = {
  sessionId: 'status-preview',
  cardIndex: 0,
  activeAtMs: 0,
  interactionEnabledAtMs: 0,
};

/** Outcome → badge glyph + word (the word carries the meaning, not colour). */
const OUTCOME_BADGE: Record<ShareOutcome, { glyph: string; text: string }> = {
  correct: { glyph: '✓', text: 'Solved' },
  timeout: { glyph: '⏱', text: 'Timed out' },
  incorrect: { glyph: '•', text: 'Played' },
};

export default function StatusViewer({
  status,
  onClose,
  onPlay,
  autoAdvanceMs = 4000,
  categoryForCard,
  getCardById = defaultGetCardById,
  registry = defaultRendererRegistry,
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
  const theme = categoryAccent(categoryForCard?.(item.cardId));
  const who = status.handle ? `@${status.handle}` : status.displayName ?? 'Someone';
  const badge = OUTCOME_BADGE[item.outcome];

  // The faded game-screen preview (the real renderer, disarmed + non-interactive).
  const card = getCardById(item.cardId);
  const Renderer = card ? resolveRenderer(registry, card) : undefined;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} testID="status-viewer">
        {/* Immersive category-tinted gradient backdrop. */}
        <LinearGradient
          colors={[theme.accent, theme.deep, '#0b0b0f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Faded preview of the ACTUAL game screen, behind everything. */}
        {card && Renderer ? (
          <View
            style={styles.preview}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="status-preview"
          >
            {createElement(Renderer as TemplateRenderer<LiquidCard>, {
              card: previewCard(card),
              context: PREVIEW_CONTEXT,
              isActive: false,
              onAttempt: noop,
              onResolve: noop,
            })}
          </View>
        ) : null}
        {/* Scrim over the preview so foreground text stays legible. */}
        <View style={styles.scrim} pointerEvents="none" />

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
            <View style={styles.headAvatar}>
              {status.avatarUrl ? (
                <Image
                  source={{ uri: status.avatarUrl }}
                  style={styles.headAvatarImg}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.headAvatarText}>{status.monogram}</Text>
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

        {/* Front: the full game name + status + score. */}
        <View style={styles.center} pointerEvents="box-none">
          <Text style={styles.kicker}>SHARED A GAME</Text>
          <Text style={styles.game}>{item.gameTitle}</Text>
          <View style={styles.outcomeBadge}>
            <Text style={styles.outcomeText}>
              {badge.glyph} {badge.text}
            </Text>
          </View>
          {item.points > 0 ? (
            <Text style={styles.points}>
              +{item.points} <Text style={styles.pointsUnit}>pts</Text>
            </Text>
          ) : null}
        </View>

        {/* Bottom CTA. */}
        <View style={styles.bottom} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.gameTitle}`}
            testID="status-play"
            onPress={() => onPlay(item)}
            style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
          >
            <Text style={styles.playText}>▶ Play this game</Text>
          </Pressable>
          <Text style={styles.hint}>Tap the sides to browse</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: 60,
    paddingBottom: space.xl,
  },
  // Faded game-screen preview behind the content (no blur lib → low opacity + scrim).
  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.22,
    transform: [{ scale: 1.06 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,14,0.45)',
  },
  zone: { position: 'absolute', top: 0, bottom: 0, width: '50%' },
  zoneLeft: { left: 0 },
  zoneRight: { right: 0 },
  top: { width: '100%', gap: space.md },
  segments: { flexDirection: 'row', gap: 4 },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    width: '0%',
    backgroundColor: '#fff',
    borderRadius: radius.pill,
  },
  segmentFull: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  headAvatarImg: { width: '100%', height: '100%' },
  headAvatarText: { color: '#fff', fontWeight: fontWeight.bold },
  id: { flex: 1 },
  who: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md },
  time: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  close: { color: '#fff', fontSize: fontSize.lg, paddingHorizontal: space.sm },
  // Center.
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  kicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 2,
  },
  outcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  outcomeText: { color: '#1a1330', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  game: {
    color: '#fff',
    fontSize: 34,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  points: {
    color: '#fff',
    fontSize: 32,
    fontWeight: fontWeight.heavy,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  pointsUnit: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  // Bottom.
  bottom: { alignItems: 'center', gap: space.sm },
  play: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
  },
  playPressed: { opacity: 0.85 },
  playText: { color: '#15101f', fontWeight: fontWeight.heavy, fontSize: fontSize.md },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: fontSize.sm },
});
