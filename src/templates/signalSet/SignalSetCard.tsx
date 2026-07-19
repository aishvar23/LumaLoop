import { useCallback, useEffect, useRef, useState } from 'react';

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

// ── Demo (teaching example) — mirrors the Prism Path / Circuit Flow convention:
// a "Watch demo" pill that opens a stepped overlay showing a SEPARATE example
// trio (never this card's puzzle), then a "your turn" banner. The example trio
// is a fixed, hand-checked VALID trio under the evaluator's rule (each feature
// all-same OR all-different): same shape (circle), same fill (solid), all
// different counts (1/2/3). It deliberately keeps TWO features the same, a
// shape no catalog solution uses, so it can never reveal a real answer.
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';
const DEMO_SHAPE_MS = 1500;
const DEMO_FILL_MS = 3000;
const DEMO_COUNT_MS = 4500;
const DEMO_CLOSE_MS = 6000;

type DemoStep = 0 | 1 | 2 | 3;

export const DEMO_TILES: readonly [SignalTile, SignalTile, SignalTile] = [
  { id: 'demo-1', shape: 'circle', fill: 'solid', count: 1 },
  { id: 'demo-2', shape: 'circle', fill: 'solid', count: 2 },
  { id: 'demo-3', shape: 'circle', fill: 'solid', count: 3 },
];

const DEMO_STEPS: ReadonlyArray<{
  feature: 'shape' | 'fill' | 'count' | null;
  text: string;
}> = [
  {
    feature: null,
    text: 'A valid trio needs each feature to be all the same or all different.',
  },
  { feature: 'shape', text: 'Shape: all three are circles — all the same.' },
  { feature: 'fill', text: 'Fill: all three are solid — all the same.' },
  {
    feature: 'count',
    text: 'Count: one, two, three — all different. Every feature checks out, so the trio is valid.',
  },
];

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
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(0);
  const [showYourTurn, setShowYourTurn] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const finishDemo = useCallback(() => {
    setDemoOpen(false);
    setDemoStep(0);
    setShowYourTurn(true);
  }, []);

  useEffect(() => {
    if (!demoOpen) return undefined;
    setDemoStep(0);
    const shapeTimer = setTimeout(() => setDemoStep(1), DEMO_SHAPE_MS);
    const fillTimer = setTimeout(() => setDemoStep(2), DEMO_FILL_MS);
    const countTimer = setTimeout(() => setDemoStep(3), DEMO_COUNT_MS);
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(shapeTimer);
      clearTimeout(fillTimer);
      clearTimeout(countTimer);
      clearTimeout(closeTimer);
    };
  }, [demoOpen, finishDemo]);

  const openDemo = useCallback(() => {
    if (resolvedRef.current || hasInteracted) return;
    setShowYourTurn(false);
    setDemoStep(0);
    setDemoOpen(true);
  }, [hasInteracted]);

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
    setHasInteracted(true);
    setShowYourTurn(false);
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
      <div style={demoLaunchRowStyle}>
        <div style={eyebrowStyle}>SIGNAL SET · PICK 3</div>
        {!hasInteracted ? (
          <button
            type="button"
            data-testid="ss-demo-button"
            aria-label="Watch Signal Set demo"
            title={DEMO_TIME_HINT}
            onClick={openDemo}
            style={demoButtonStyle}
          >
            Watch demo
          </button>
        ) : null}
      </div>
      <p data-testid="ss-prompt" style={promptStyle}>
        {card.prompt}
      </p>
      {showYourTurn && !hasInteracted ? (
        <p
          data-testid="ss-your-turn"
          role="status"
          aria-live="polite"
          style={yourTurnStyle}
        >
          Your turn — pick three so each feature is all same or all different.
        </p>
      ) : null}
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
              {/* No visible fill label: the glyph itself shows fill (solid ●,
                  striped ◉, outline ○). Printing "solid"/"striped"/"outline"
                  telegraphed the puzzle; the full description stays on the tile's
                  aria-label for screen readers. */}
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
      {demoOpen ? <SignalSetDemo step={demoStep} onClose={finishDemo} /> : null}
    </section>
  );
}

SignalSetCard.displayName = 'SignalSetCard';

function SignalSetDemo({
  step,
  onClose,
}: {
  step: DemoStep;
  onClose: () => void;
}) {
  const current = DEMO_STEPS[step];
  return (
    <div style={demoBackdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Signal Set demonstration"
        style={demoPanelStyle}
      >
        <h2 style={demoTitleStyle}>How Signal Set works</h2>
        <p
          data-testid="ss-demo-instruction"
          aria-live="polite"
          style={demoInstructionStyle}
        >
          {current.text}
        </p>
        <div
          data-testid="ss-demo-board"
          role="group"
          aria-label="Separate Signal Set demo trio"
          style={demoBoardStyle}
        >
          {DEMO_TILES.map((tile) => {
            const highlighted = current.feature !== null;
            return (
              <div
                key={tile.id}
                data-testid={`ss-demo-tile-${tile.id}`}
                aria-label={tileLabel(tile)}
                style={{
                  ...demoTileStyle,
                  ...(highlighted ? demoTileHighlightStyle : null),
                }}
              >
                <span aria-hidden="true" style={demoGlyphRowStyle}>
                  {Array.from({ length: tile.count }, (_, index) => (
                    <span key={index}>{GLYPHS[tile.shape][tile.fill]}</span>
                  ))}
                </span>
                <span style={demoTileMetaStyle}>
                  {current.feature === 'shape'
                    ? tile.shape
                    : current.feature === 'count'
                      ? `count ${tile.count}`
                      : tile.fill}
                </span>
              </div>
            );
          })}
        </div>
        <p style={demoCaptionStyle}>
          Demo uses a separate trio, not this card’s answer.
        </p>
        <div aria-hidden="true" style={demoProgressStyle}>
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              style={{
                ...demoDotStyle,
                background:
                  item <= step ? 'var(--accent)' : 'var(--color-border)',
              }}
            />
          ))}
        </div>
        <button
          type="button"
          data-testid="ss-demo-skip"
          onClick={onClose}
          style={demoSkipStyle}
        >
          Skip demo
        </button>
      </div>
    </div>
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
const demoLaunchRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
} as const;
const demoButtonStyle = {
  minHeight: 'var(--tap-target-min)',
  padding: '0 var(--space-3)',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface, transparent)',
  color: 'var(--accent)',
  fontWeight: 700,
} as const;
const yourTurnStyle = {
  margin: 0,
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--accent)',
  background: 'var(--accent-tint)',
  color: 'var(--accent)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 700,
} as const;
const demoBackdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-5)',
  background: 'rgba(4, 6, 12, 0.88)',
} as const;
const demoPanelStyle = {
  width: 'min(390px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-lg)',
} as const;
const demoTitleStyle = {
  margin: 0,
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  textAlign: 'center',
} as const;
const demoInstructionStyle = {
  minHeight: 52,
  margin: 0,
  color: 'var(--color-text-muted)',
  textAlign: 'center',
} as const;
const demoBoardStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 'var(--space-2)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
  background: 'var(--game-board, rgba(3,8,18,.58))',
} as const;
const demoTileStyle = {
  minHeight: 76,
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, rgba(255,255,255,0.055))',
  color: 'var(--color-text)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
} as const;
const demoTileHighlightStyle = {
  borderColor: 'var(--accent)',
  boxShadow: '0 0 16px color-mix(in srgb, var(--accent) 18%, transparent)',
} as const;
const demoGlyphRowStyle = {
  display: 'flex',
  gap: 3,
  fontSize: 22,
  lineHeight: 1,
} as const;
const demoTileMetaStyle = {
  color: 'var(--color-text-muted)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  textAlign: 'center',
} as const;
const demoCaptionStyle = {
  margin: 0,
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-xs)',
  textAlign: 'center',
} as const;
const demoProgressStyle = {
  display: 'flex',
  justifyContent: 'center',
  gap: 'var(--space-2)',
} as const;
const demoDotStyle = {
  width: 8,
  height: 8,
  borderRadius: '50%',
} as const;
const demoSkipStyle = {
  minHeight: 'var(--tap-target-min)',
  border: 0,
  background: 'transparent',
  color: 'var(--color-text-muted)',
  fontWeight: 700,
} as const;
