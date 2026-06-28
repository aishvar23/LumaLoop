/**
 * Memory Match renderer — a flip-and-match pairs board (concentration).
 *
 * A rows×columns grid of face-down tiles is flipped two at a time: a matching
 * pair (same `pairKey`) stays revealed, a mismatch flips back after a brief
 * 700ms reveal. The card resolves CORRECT once every tile is matched; the shared
 * {@link useCardTimer} resolves a TIMEOUT on expiry. Unlike the pick-one
 * templates there is no terminal "incorrect" — mismatches are normal play and
 * are recorded as a signal.
 *
 * Bookkeeping mirrors the other renderers: the FIRST ever tap fires `onAttempt`
 * once and `timer.markAttempt()`, and the same elapsed/interaction-elapsed math
 * is emitted on resolution.
 *
 * Accessibility (Technical Design §14): meaning is carried by distinct SHAPES,
 * never colour. Every tile is a real `<button>` labelled "Tile N, hidden" when
 * down and "Tile N, <glyph>" when up; a polite live region announces progress.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MemoryMatchCard as MemoryMatchCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { allPairsMatched, tilesMatch } from './memoryMatchEvaluator';

const FLIP_BACK_MS = 700;

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
  const { tiles, rows, columns } = config;
  const totalPairs = tiles.length / 2;

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
    timeoutSignals: () => ({
      pairs: pairsRef.current,
      total_pairs: totalPairs,
      mismatches: mismatchesRef.current,
      time_to_interaction: firstSelectionElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
    now,
  });

  // Clear any pending flip-back timeout on unmount.
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

      // 0 face up so far → reveal the first of a pair.
      if (faceUp.length === 0) {
        setFaceUp([tileId]);
        return;
      }

      // 1 face up → this is the second; compare the two.
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

      // Mismatch: keep both shown, lock the board, flip back after a beat.
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

  return (
    <section aria-label="Memory match" style={sectionStyle}>
      <p style={promptStyle}>
        Flip the tiles two at a time to find the matching pairs.
      </p>

      <div
        role="group"
        aria-label="Memory board"
        style={{
          ...gridStyle,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {tiles.map((tile, index) => {
          const isMatched = matched.has(tile.id);
          const isFaceUp = faceUp.includes(tile.id);
          const revealed = isMatched || isFaceUp;
          const label = revealed
            ? `Tile ${index + 1}, ${tile.glyph}`
            : `Tile ${index + 1}, hidden`;
          return (
            <button
              key={tile.id}
              type="button"
              data-testid={`mm-tile-${tile.id}`}
              aria-label={label}
              aria-pressed={revealed}
              disabled={isMatched}
              onClick={() => handleTap(tile.id)}
              style={
                isMatched
                  ? tileMatchedStyle
                  : isFaceUp
                    ? tileFaceUpStyle
                    : tileBackStyle
              }
            >
              <span aria-hidden="true">{revealed ? tile.glyph : '?'}</span>
            </button>
          );
        })}
      </div>

      <p
        data-testid="mm-status"
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
  gap: 'var(--space-2)',
  width: 'min(80vw, 360px)',
} as const;

const tileBase = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1 / 1',
  minWidth: 'var(--tap-target-min)',
  minHeight: 'var(--tap-target-min)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-xl)',
  cursor: 'pointer',
  lineHeight: 1,
} as const;

const tileBackStyle = tileBase;

const tileFaceUpStyle = {
  ...tileBase,
  border: '1px solid var(--accent, var(--color-accent))',
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
} as const;

const tileMatchedStyle = {
  ...tileBase,
  cursor: 'default',
  opacity: 0.55,
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
