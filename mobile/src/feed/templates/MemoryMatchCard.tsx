/**
 * Memory Match renderer — React Native. Native rebuild of web
 * `src/templates/memoryMatch/MemoryMatchCard.tsx` — same flip-and-match state
 * machine, signals, and timeout behaviour, RN primitives instead of DOM.
 *
 * A rows×columns grid of face-down tiles is flipped two at a time: a matching
 * pair (same `pairKey`) stays revealed, a mismatch flips back after a brief
 * 700ms reveal. The card resolves CORRECT once every tile is matched;
 * {@link useCardTimer} resolves a TIMEOUT on expiry. There is no terminal
 * "incorrect" — mismatches are normal play, recorded as a signal.
 *
 * Accessibility: meaning is carried by distinct SHAPES, never colour. Each tile
 * is a labelled button ("Tile N, hidden" / "Tile N, <glyph>") with a polite
 * progress line.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MemoryMatchCard as MemoryMatchCardType } from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import {
  allPairsMatched,
  tilesMatch,
} from '../../core/templates/memoryMatch/memoryMatchEvaluator';
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

const FLIP_BACK_MS = 700;
const CELL = 72;

export type MemoryMatchCardProps = TemplateProps<MemoryMatchCardType> & {
  now?: () => number;
};

export default function MemoryMatchCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: MemoryMatchCardProps) {
  const { config } = card;
  const { tiles, columns } = config;
  const totalPairs = tiles.length / 2;
  const theme = useGameTheme();

  const tilesById = useMemo(() => {
    const map = new Map<string, (typeof tiles)[number]>();
    for (const tile of tiles) map.set(tile.id, tile);
    return map;
  }, [tiles]);

  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const lockedRef = useRef(false);
  const flipBackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pairsRef = useRef(0);
  const mismatchesRef = useRef(0);

  const [faceUp, setFaceUp] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());

  const clearFlipBack = useCallback(() => {
    if (flipBackRef.current !== null) {
      clearTimeout(flipBackRef.current);
      flipBackRef.current = null;
    }
  }, []);

  const handleResolve = useCallback(
    (resolution: CardResolution) => {
      resolvedRef.current = true;
      clearFlipBack();
      onResolve(resolution);
    },
    [clearFlipBack, onResolve],
  );

  const timer = useCardTimer({
    card,
    context,
    onResolve: handleResolve,
    now,
    timeoutSignals: () => ({
      pairs: pairsRef.current,
      total_pairs: totalPairs,
      mismatches: mismatchesRef.current,
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  useEffect(() => clearFlipBack, [clearFlipBack]);

  const handleTap = useCallback(
    (tileId: string) => {
      if (resolvedRef.current) return;
      if (lockedRef.current) return;
      if (matched.has(tileId)) return;
      if (faceUp.includes(tileId)) return;

      const tappedAtMs = now();

      if (firstSelectionElapsedRef.current === null) {
        const tti = tappedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      if (faceUp.length === 0) {
        setFaceUp([tileId]);
        return;
      }

      const firstTile = tilesById.get(faceUp[0]);
      const secondTile = tilesById.get(tileId);
      if (!firstTile || !secondTile) return;

      if (tilesMatch(firstTile, secondTile)) {
        const nextMatched = new Set(matched);
        nextMatched.add(faceUp[0]);
        nextMatched.add(tileId);
        pairsRef.current += 1;
        setMatched(nextMatched);
        setFaceUp([]);

        if (allPairsMatched(tiles.length, nextMatched.size)) {
          timer.resolve({
            cardId: card.cardId,
            resolutionType: 'correct',
            isCorrect: true,
            elapsedMs: tappedAtMs - context.activeAtMs,
            interactionElapsedMs: tappedAtMs - context.interactionEnabledAtMs,
            attemptCount: attemptCountRef.current,
            signals: {
              pairs: pairsRef.current,
              total_pairs: totalPairs,
              mismatches: mismatchesRef.current,
              time_to_interaction: firstSelectionElapsedRef.current ?? -1,
              correct: true,
              elapsed: tappedAtMs - context.interactionEnabledAtMs,
            },
          });
        }
        return;
      }

      mismatchesRef.current += 1;
      setFaceUp([faceUp[0], tileId]);
      lockedRef.current = true;
      flipBackRef.current = setTimeout(() => {
        flipBackRef.current = null;
        lockedRef.current = false;
        setFaceUp([]);
      }, FLIP_BACK_MS);
    },
    [
      card.cardId,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      faceUp,
      matched,
      now,
      onAttempt,
      tiles.length,
      tilesById,
      timer,
      totalPairs,
    ],
  );

  const pairsFound = matched.size / 2;
  const statusText =
    pairsFound === 0
      ? ''
      : pairsFound === totalPairs
        ? 'All pairs matched'
        : `${pairsFound} of ${totalPairs} pairs matched`;

  const boardWidth = columns * CELL + space.sm * (columns - 1);

  return (
    <View style={styles.section} accessibilityLabel="Memory match">
      <Text style={styles.prompt}>
        Flip the tiles two at a time to find the matching pairs.
      </Text>

      <View
        accessibilityLabel="Memory board"
        style={[styles.grid, { width: boardWidth }]}
      >
        {tiles.map((tile, index) => {
          const isMatched = matched.has(tile.id);
          const isFaceUp = faceUp.includes(tile.id);
          const revealed = isMatched || isFaceUp;
          const label = revealed
            ? `Tile ${index + 1}, ${tile.glyph}`
            : `Tile ${index + 1}, hidden`;
          return (
            <Pressable
              key={tile.id}
              testID={`mm-tile-${tile.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: revealed, disabled: isMatched }}
              accessibilityLabel={label}
              disabled={isMatched}
              onPress={() => handleTap(tile.id)}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: theme.surfaceRaised,
                  borderColor: theme.border,
                },
                pressed && !isMatched && { backgroundColor: theme.surfaceStrong },
                isFaceUp && {
                  backgroundColor: theme.surfaceStrong,
                  borderColor: theme.accent,
                },
                isMatched && styles.tileMatched,
              ]}
            >
              <Text style={styles.tileGlyph}>{revealed ? tile.glyph : '?'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        testID="mm-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {statusText}
      </Text>
    </View>
  );
}
MemoryMatchCard.displayName = 'MemoryMatchCard';

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
    alignItems: 'center',
  },
  prompt: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
  },
  tile: {
    width: CELL,
    height: CELL,
    minWidth: TAP_TARGET_MIN,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  tileMatched: {
    opacity: 0.55,
  },
  tileGlyph: {
    color: colors.text,
    fontSize: fontSize.lg,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
