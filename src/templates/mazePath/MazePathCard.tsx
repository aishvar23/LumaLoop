/**
 * Maze Path renderer — a navigable grid maze.
 *
 * A rows×columns grid of 'open' and 'wall' cells. The player starts on the start
 * cell and taps adjacent open cells to step 4-directionally toward the exit
 * (backtracking allowed). Reaching the exit resolves the card CORRECT; the
 * shared {@link useCardTimer} resolves a TIMEOUT on expiry. Like memory_match
 * there is no terminal "incorrect" — the player navigates until the exit is
 * reached or the clock runs out. Illegal taps (walls, diagonals, non-adjacent)
 * are ignored and recorded as a `bumps` signal.
 *
 * Bookkeeping mirrors the other renderers: the FIRST ever tap fires `onAttempt`
 * once and `timer.markAttempt()`, and the same elapsed/interaction-elapsed math
 * is emitted on resolution.
 *
 * Accessibility (Technical Design §14): meaning is carried by SHAPE/label, never
 * colour. Open cells are real `<button>`s labelled with their row/column and
 * role (start/exit/open); walls are non-interactive and labelled "wall". The
 * current position is announced and a polite live region reports progress.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { MazePathCard as MazePathCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { canMoveTo } from './mazePathEvaluator';

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
    timeoutSignals: () => ({
      steps: visited.length - 1,
      bumps: bumpsRef.current,
      reached_exit: false,
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
    now,
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

  const grid = useMemo(() => cells, [cells]);

  return (
    <section aria-label="Maze path" style={sectionStyle}>
      <p style={promptStyle}>
        Tap your way through the open squares from the start to the exit.
      </p>

      <div
        role="group"
        aria-label="Maze grid"
        style={{
          ...gridStyle,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {grid.map((cell, index) => {
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
          const glyph = isWall ? '' : isExit ? '★' : isStart ? '●' : isCurrent ? '◉' : '';

          if (isWall) {
            return (
              <div
                key={index}
                data-testid={`maze-cell-${index}`}
                aria-label={label}
                style={wallCellStyle}
              />
            );
          }

          const style = isCurrent
            ? currentCellStyle
            : isVisited
              ? visitedCellStyle
              : openCellStyle;

          return (
            <button
              key={index}
              type="button"
              data-testid={`maze-cell-${index}`}
              aria-label={label}
              aria-current={isCurrent ? 'location' : undefined}
              onClick={() => handleTap(index)}
              style={style}
            >
              <span aria-hidden="true">{glyph}</span>
              {isExit && (
                <span style={exitLabelStyle} aria-hidden="true">
                  Exit
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p
        data-testid="maze-status"
        role="status"
        aria-live="polite"
        style={liveRegionStyle}
      >
        {statusText}
      </p>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'center',
} as const;

const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  textAlign: 'center',
} as const;

const gridStyle = {
  display: 'grid',
  gap: 'var(--space-1)',
  width: 'min(80vw, 360px)',
} as const;

const cellBase = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1 / 1',
  minWidth: 'var(--tap-target-min)',
  minHeight: 'var(--tap-target-min)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  cursor: 'pointer',
  lineHeight: 1,
} as const;

const openCellStyle = cellBase;

const visitedCellStyle = {
  ...cellBase,
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
} as const;

const currentCellStyle = {
  ...cellBase,
  border: '2px solid var(--accent, var(--color-accent))',
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
  fontWeight: 'var(--font-weight-bold)',
} as const;

const wallCellStyle = {
  display: 'flex',
  aspectRatio: '1 / 1',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-text)',
} as const;

const exitLabelStyle = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
