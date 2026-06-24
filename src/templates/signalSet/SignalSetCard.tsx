import { useCallback, useRef, useState } from 'react';

import type {
  SignalFill,
  SignalSetCard as SignalSetCardType,
  SignalShape,
  SignalTile,
} from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateSignalSet } from './signalSetEvaluator';

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

  const handleTile = useCallback(
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

  const handleSubmit = useCallback(() => {
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
    <section aria-label="Signal set" style={sectionStyle}>
      <div style={eyebrowStyle}>SIGNAL SET · PICK 3</div>
      <p data-testid="ss-prompt" style={promptStyle}>
        {card.prompt}
      </p>
      <div role="group" aria-label="Signal tiles" style={gridStyle}>
        {card.config.tiles.map((tile) => {
          const selected = selectedIds.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              data-testid={`ss-tile-${tile.id}`}
              aria-label={tileLabel(tile)}
              aria-pressed={selected}
              onClick={() => handleTile(tile.id)}
              style={{ ...tileStyle, ...(selected ? selectedTileStyle : null) }}
            >
              <span aria-hidden="true" style={glyphRowStyle}>
                {Array.from({ length: tile.count }, (_, index) => (
                  <span key={index}>{GLYPHS[tile.shape][tile.fill]}</span>
                ))}
              </span>
              <span style={tileMetaStyle}>{tile.fill}</span>
            </button>
          );
        })}
      </div>
      <div style={footerStyle}>
        <p role="status" aria-live="polite" style={statusStyle}>
          {selectedIds.length}/3 selected
        </p>
        <button
          type="button"
          data-testid="ss-submit"
          disabled={selectedIds.length !== 3}
          onClick={handleSubmit}
          style={{
            ...submitStyle,
            ...(selectedIds.length !== 3 ? disabledStyle : null),
          }}
        >
          Lock trio
        </button>
      </div>
    </section>
  );
}

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;
const eyebrowStyle = {
  color: 'var(--accent)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.16em',
} as const;
const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-hero)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-tight)',
} as const;
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--space-2)',
} as const;
const tileStyle = {
  minHeight: 92,
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border:
    '1px solid color-mix(in srgb, var(--accent) 28%, var(--game-border, var(--color-border)))',
  background: 'var(--game-surface-raised, rgba(255,255,255,0.055))',
  color: 'var(--color-text)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
} as const;
const selectedTileStyle = {
  border: '2px solid var(--accent)',
  background: 'color-mix(in srgb, var(--accent) 16%, rgba(255,255,255,.04))',
  boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 18%, transparent)',
} as const;
const glyphRowStyle = {
  display: 'flex',
  gap: 4,
  fontSize: 28,
  lineHeight: 1,
} as const;
const tileMetaStyle = {
  color: 'var(--color-text-muted)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
} as const;
const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
} as const;
const statusStyle = {
  margin: 0,
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-sm)',
} as const;
const submitStyle = {
  minHeight: 'var(--control-height-md)',
  padding: '0 var(--space-4)',
  border: 0,
  borderRadius: 'var(--radius-pill)',
  background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
  color: 'var(--color-accent-on)',
  fontWeight: 800,
} as const;
const disabledStyle = { opacity: 0.42 } as const;
