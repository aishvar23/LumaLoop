/**
 * Maze Path renderer — React Native. Native rebuild of web
 * `src/templates/mazePath/MazePathCard.tsx` — same navigation state machine,
 * signals, and timeout behaviour, RN primitives instead of DOM.
 *
 * A rows×columns grid of 'open'/'wall' cells: the player starts on the start
 * cell and taps adjacent open cells to step 4-directionally toward the exit
 * (backtracking allowed). Reaching the exit resolves the card CORRECT;
 * {@link useCardTimer} resolves a TIMEOUT on expiry. There is no terminal
 * "incorrect" — illegal taps (walls, diagonals, non-adjacent) are ignored and
 * recorded as a `bumps` signal.
 *
 * Accessibility: meaning is carried by SHAPE/label, never colour. Open cells are
 * labelled buttons (row/column + role start/exit/open, current announced);
 * walls are non-interactive and labelled "wall". A polite line reports progress.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MazePathCard as MazePathCardType } from '../../core/cards/types';
import type {
  CardResolution,
  TemplateProps,
} from '../../core/templates/contract';
import { useCardTimer } from '../../core/templates/useCardTimer';
import { canMoveTo } from '../../core/templates/mazePath/mazePathEvaluator';
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

const CELL = 56;

export type MazePathCardProps = TemplateProps<MazePathCardType> & {
  now?: () => number;
};

export default function MazePathCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: MazePathCardProps) {
  const { config } = card;
  const { rows, columns, cells, startIndex, exitIndex } = config;
  const theme = useGameTheme();

  const firstSelectionElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const bumpsRef = useRef(0);

  const [current, setCurrent] = useState(startIndex);
  const [visited, setVisited] = useState<number[]>([startIndex]);

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
      steps: visited.length - 1,
      bumps: bumpsRef.current,
      reached_exit: false,
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handleTap = useCallback(
    (tappedIndex: number) => {
      if (resolvedRef.current) return;
      const tappedAtMs = now();

      if (firstSelectionElapsedRef.current === null) {
        const tti = tappedAtMs - context.interactionEnabledAtMs;
        firstSelectionElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      if (!canMoveTo(cells, columns, current, tappedIndex)) {
        bumpsRef.current += 1;
        return;
      }

      const nextVisited = [...visited, tappedIndex];
      setCurrent(tappedIndex);
      setVisited(nextVisited);

      if (tappedIndex === exitIndex) {
        timer.resolve({
          cardId: card.cardId,
          resolutionType: 'correct',
          isCorrect: true,
          elapsedMs: tappedAtMs - context.activeAtMs,
          interactionElapsedMs: tappedAtMs - context.interactionEnabledAtMs,
          attemptCount: attemptCountRef.current,
          signals: {
            steps: nextVisited.length - 1,
            bumps: bumpsRef.current,
            reached_exit: true,
            time_to_interaction: firstSelectionElapsedRef.current ?? -1,
            correct: true,
            elapsed: tappedAtMs - context.interactionEnabledAtMs,
          },
        });
      }
    },
    [
      card.cardId,
      cells,
      columns,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      current,
      exitIndex,
      now,
      onAttempt,
      timer,
      visited,
    ],
  );

  const reachedExit = current === exitIndex;
  const statusText = reachedExit
    ? 'Reached the exit'
    : visited.length === 1
      ? ''
      : `${visited.length - 1} steps taken`;

  const boardWidth = columns * CELL + space.xs * (columns - 1);

  return (
    <View style={styles.section} accessibilityLabel="Maze path">
      <Text style={styles.prompt}>
        Tap your way through the open squares from the start to the exit.
      </Text>

      <View
        accessibilityLabel="Maze grid"
        style={[styles.grid, { width: boardWidth }]}
      >
        {cells.map((cell, index) => {
          const row = Math.floor(index / columns) + 1;
          const col = (index % columns) + 1;
          const isWall = cell === 'wall';
          const isStart = index === startIndex;
          const isExit = index === exitIndex;
          const isCurrent = index === current;
          const isVisited = visited.includes(index);

          const role = isWall
            ? 'wall'
            : isStart
              ? 'start'
              : isExit
                ? 'exit'
                : 'open';
          const label = `Row ${row} column ${col}, ${role}${
            isCurrent ? ', current position' : ''
          }`;
          const glyph = isExit ? '★' : isStart ? '●' : isCurrent ? '◉' : '';

          if (isWall) {
            return (
              <View
                key={index}
                testID={`maze-cell-${index}`}
                accessibilityLabel={label}
                style={[styles.wall, { backgroundColor: colors.text }]}
              />
            );
          }

          return (
            <Pressable
              key={index}
              testID={`maze-cell-${index}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              accessibilityLabel={label}
              onPress={() => handleTap(index)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: theme.surfaceRaised,
                  borderColor: theme.border,
                },
                isVisited && { backgroundColor: theme.surfaceStrong },
                pressed && { backgroundColor: theme.surfaceStrong },
                isCurrent && {
                  borderWidth: 2,
                  borderColor: theme.accent,
                  backgroundColor: theme.surfaceStrong,
                },
              ]}
            >
              <Text style={styles.cellGlyph}>{glyph}</Text>
              {isExit ? <Text style={styles.exitLabel}>Exit</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Text
        testID="maze-status"
        accessibilityLiveRegion="polite"
        style={styles.status}
      >
        {statusText}
      </Text>
    </View>
  );
}
MazePathCard.displayName = 'MazePathCard';

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
    gap: space.xs,
    justifyContent: 'center',
  },
  cell: {
    width: CELL,
    height: CELL,
    minWidth: TAP_TARGET_MIN,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    ...elevation.tile,
  },
  wall: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.text,
  },
  cellGlyph: {
    color: colors.text,
    fontSize: fontSize.lg,
  },
  exitLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  status: {
    minHeight: fontSize.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
