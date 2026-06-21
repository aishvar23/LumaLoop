/**
 * Prism Path renderer — a feed-native mirror-routing game.
 *
 * The renderer owns only interaction and visuals: it toggles mirror orientation,
 * shows the live beam trace, and submits the current orientation map through the
 * pure evaluator. Beam correctness is never reimplemented here.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  GridCoordinate,
  PrismMirrorOrientation,
  PrismPathCard as PrismPathCardType,
} from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluatePrismPath,
  initialOrientationMap,
  tracePrismPath,
  type PrismPathOrientationMap,
} from './prismPathEvaluator';

export type PrismPathCardProps = TemplateProps<PrismPathCardType> & {
  now?: () => number;
};

function coordKey(coord: GridCoordinate): string {
  return `${coord.row}:${coord.column}`;
}

function toggleOrientation(
  orientation: PrismMirrorOrientation,
): PrismMirrorOrientation {
  return orientation === 'slash' ? 'backslash' : 'slash';
}

function mirrorGlyph(orientation: PrismMirrorOrientation): string {
  return orientation === 'slash' ? '/' : '\\';
}

export default function PrismPathCard({
  card,
  context,
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: PrismPathCardProps) {
  const { config } = card;
  const [orientations, setOrientations] = useState<PrismPathOrientationMap>(() =>
    initialOrientationMap(config.mirrors),
  );
  const rotationsRef = useRef(0);
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
    timeoutSignals: () => {
      const result = evaluatePrismPath(
        config,
        orientations,
        rotationsRef.current,
      );
      return {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: false,
        elapsed: now() - context.interactionEnabledAtMs,
      };
    },
  });

  const markFirstInput = useCallback(() => {
    if (firstInputElapsedRef.current !== null) return;
    const tti = now() - context.interactionEnabledAtMs;
    firstInputElapsedRef.current = tti;
    onAttempt({ time_to_interaction: tti });
    attemptCountRef.current = timer.markAttempt();
  }, [context.interactionEnabledAtMs, now, onAttempt, timer]);

  const handleRotate = useCallback(
    (mirrorId: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      rotationsRef.current += 1;
      setOrientations((prev) => ({
        ...prev,
        [mirrorId]: toggleOrientation(prev[mirrorId] ?? 'slash'),
      }));
    },
    [markFirstInput],
  );

  const handleSubmit = useCallback(() => {
    if (resolvedRef.current) return;
    markFirstInput();
    const result = evaluatePrismPath(config, orientations, rotationsRef.current);
    const resolvedAtMs = now();
    timer.resolve({
      cardId: card.cardId,
      resolutionType: result.resolutionType,
      isCorrect: result.isCorrect,
      elapsedMs: resolvedAtMs - context.activeAtMs,
      interactionElapsedMs: resolvedAtMs - context.interactionEnabledAtMs,
      attemptCount: attemptCountRef.current,
      signals: {
        ...result.signals,
        time_to_interaction: firstInputElapsedRef.current ?? -1,
        correct: result.isCorrect,
        elapsed: resolvedAtMs - context.interactionEnabledAtMs,
      },
    });
  }, [
    card.cardId,
    config,
    context.activeAtMs,
    context.interactionEnabledAtMs,
    markFirstInput,
    now,
    orientations,
    timer,
  ]);

  const trace = useMemo(
    () => tracePrismPath(config, orientations),
    [config, orientations],
  );
  const pathSet = useMemo(
    () => new Set(trace.cells.map(coordKey)),
    [trace.cells],
  );
  const blockerSet = useMemo(
    () => new Set(config.blockers.map(coordKey)),
    [config.blockers],
  );
  const mirrorByCoord = useMemo(() => {
    const map = new Map<string, PrismPathCardType['config']['mirrors'][number]>();
    for (const mirror of config.mirrors) map.set(coordKey(mirror), mirror);
    return map;
  }, [config.mirrors]);

  const cells = useMemo(() => {
    const out: GridCoordinate[] = [];
    for (let row = 0; row < config.rows; row++) {
      for (let column = 0; column < config.columns; column++) {
        out.push({ row, column });
      }
    }
    return out;
  }, [config.rows, config.columns]);

  return (
    <section aria-label="Prism path" style={sectionStyle}>
      <p data-testid="pp-prompt" style={promptStyle}>
        {card.prompt}
      </p>

      <div
        role="grid"
        aria-label="Mirror beam grid"
        style={{
          ...boardStyle,
          gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((coord) => {
          const key = coordKey(coord);
          const mirror = mirrorByCoord.get(key);
          const isEntry =
            coord.row === config.entry.row &&
            coord.column === config.entry.column;
          const isTarget =
            coord.row === config.target.row &&
            coord.column === config.target.column;
          const isBlocker = blockerSet.has(key);
          const isBeam = pathSet.has(key);
          const cellStyle = {
            ...baseCellStyle,
            ...(isBeam ? beamCellStyle : null),
            ...(isEntry ? entryCellStyle : null),
            ...(isTarget ? targetCellStyle : null),
            ...(isBlocker ? blockerCellStyle : null),
          };

          if (mirror) {
            const orientation = orientations[mirror.id] ?? 'slash';
            return (
              <button
                key={key}
                type="button"
                data-testid={`pp-mirror-${mirror.id}`}
                aria-label={`Mirror ${mirror.id}: ${orientation}`}
                onClick={() => handleRotate(mirror.id)}
                style={{
                  ...cellStyle,
                  ...mirrorCellStyle,
                }}
              >
                <span aria-hidden="true" style={mirrorGlyphStyle}>
                  {mirrorGlyph(orientation)}
                </span>
              </button>
            );
          }

          return (
            <div key={key} role="gridcell" data-testid={`pp-cell-${key}`} style={cellStyle}>
              {isEntry ? (
                <span style={entryTextStyle}>IN</span>
              ) : isTarget ? (
                <span aria-label="target" style={targetTextStyle}>
                  ★
                </span>
              ) : isBlocker ? (
                <span aria-label="blocker" style={blockerTextStyle}>
                  ×
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="pp-submit"
        onClick={handleSubmit}
        style={submitStyle}
      >
        Fire beam
      </button>

      <p role="status" aria-live="polite" style={statusStyle}>
        {trace.reachedTarget
          ? 'Beam preview reaches the star.'
          : `Beam currently ${trace.exitReason.replace('_', ' ')}.`}
      </p>
    </section>
  );
}

PrismPathCard.displayName = 'PrismPathCard';

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;

const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-hero)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-tight)',
} as const;

const boardStyle = {
  display: 'grid',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
  borderRadius: 'var(--radius-md)',
  background:
    'radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 58%), var(--surface)',
  boxShadow: '0 18px 50px rgb(0 0 0 / 0.24)',
} as const;

const baseCellStyle = {
  aspectRatio: '1 / 1',
  minWidth: 0,
  minHeight: 'var(--tap-target-min)',
  display: 'grid',
  placeItems: 'center',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  background: 'rgb(255 255 255 / 0.055)',
  font: 'inherit',
} as const;

const beamCellStyle = {
  borderColor: 'color-mix(in srgb, var(--accent) 72%, white)',
  background:
    'linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, transparent), rgb(255 255 255 / 0.07))',
  boxShadow: 'inset 0 0 18px color-mix(in srgb, var(--accent) 34%, transparent)',
} as const;

const entryCellStyle = {
  borderColor: 'var(--accent)',
} as const;

const targetCellStyle = {
  borderColor: 'color-mix(in srgb, var(--accent) 65%, white)',
} as const;

const blockerCellStyle = {
  color: 'var(--muted)',
  borderColor: 'rgb(255 255 255 / 0.1)',
  background: 'rgb(0 0 0 / 0.28)',
} as const;

const mirrorCellStyle = {
  cursor: 'pointer',
  appearance: 'none',
  padding: 0,
  background:
    'linear-gradient(160deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.045))',
} as const;

const mirrorGlyphStyle = {
  fontSize: '2rem',
  lineHeight: 1,
  color: 'var(--accent)',
  textShadow: '0 0 18px color-mix(in srgb, var(--accent) 72%, transparent)',
} as const;

const entryTextStyle = {
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--accent)',
} as const;

const targetTextStyle = {
  fontSize: '1.35rem',
  color: 'var(--accent)',
  textShadow: '0 0 16px color-mix(in srgb, var(--accent) 76%, transparent)',
} as const;

const blockerTextStyle = {
  fontSize: '1.25rem',
} as const;

const submitStyle = {
  minHeight: 'var(--tap-target-min)',
  border: 0,
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-bold)',
  cursor: 'pointer',
} as const;

const statusStyle = {
  minHeight: 'var(--font-size-md)',
  margin: 0,
  color: 'var(--muted)',
  fontSize: 'var(--font-size-sm)',
} as const;
