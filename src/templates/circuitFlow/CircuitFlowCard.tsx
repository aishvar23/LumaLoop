import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CircuitFlowCard as CircuitFlowCardType,
  CircuitRotation,
  GridDirection,
} from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateCircuitFlow,
  initialCircuitRotations,
  rotatedCircuitConnections,
  type CircuitRotationMap,
} from './circuitFlowEvaluator';

export type CircuitFlowCardProps = TemplateProps<CircuitFlowCardType> & {
  now?: () => number;
};

const DEMO_CONNECT_MS = 1200;
const DEMO_COMPLETE_MS = 2400;
const DEMO_CLOSE_MS = 3600;
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';

type DemoStep = 0 | 1 | 2;

const LINE_ENDS: Readonly<Record<GridDirection, readonly [number, number]>> = {
  up: [50, 0],
  right: [100, 50],
  down: [50, 100],
  left: [0, 50],
};

export default function CircuitFlowCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: CircuitFlowCardProps) {
  const [rotations, setRotations] = useState<CircuitRotationMap>(() =>
    initialCircuitRotations(card.config.tiles),
  );
  const rotationsRef = useRef(rotations);
  const rotationsUsedRef = useRef(0);
  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(0);
  const [showYourTurn, setShowYourTurn] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const endpointTileIds = useMemo(
    () =>
      new Set(
        card.config.tiles
          .filter(
            (tile) =>
              tile.id !== card.config.sourceTileId &&
              tile.connections.length === 1,
          )
          .map((tile) => tile.id),
      ),
    [card.config.sourceTileId, card.config.tiles],
  );

  const finishDemo = useCallback(() => {
    setDemoOpen(false);
    setDemoStep(0);
    setShowYourTurn(true);
  }, []);

  useEffect(() => {
    if (!demoOpen) return undefined;
    setDemoStep(0);
    const connectTimer = setTimeout(
      () => setDemoStep(1),
      DEMO_CONNECT_MS,
    );
    const completeTimer = setTimeout(
      () => setDemoStep(2),
      DEMO_COMPLETE_MS,
    );
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(connectTimer);
      clearTimeout(completeTimer);
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
      ...evaluateCircuitFlow(
        card.config,
        rotationsRef.current,
        rotationsUsedRef.current,
      ).signals,
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
  const rotate = useCallback(
    (tileId: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      rotationsUsedRef.current += 1;
      setRotations((current) => {
        const nextRotation = (((current[tileId] ?? 0) + 1) %
          4) as CircuitRotation;
        const next = { ...current, [tileId]: nextRotation };
        rotationsRef.current = next;
        return next;
      });
    },
    [markFirstInput],
  );
  const preview = useMemo(
    () => evaluateCircuitFlow(card.config, rotations, rotationsUsedRef.current),
    [card.config, rotations],
  );
  const submit = useCallback(() => {
    if (resolvedRef.current) return;
    markFirstInput();
    const result = evaluateCircuitFlow(
      card.config,
      rotationsRef.current,
      rotationsUsedRef.current,
    );
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
  }, [card.cardId, card.config, context, markFirstInput, now, timer]);

  return (
    <section aria-label="Circuit flow" style={sectionStyle}>
      <div style={demoLaunchRowStyle}>
        <div style={eyebrowStyle}>CIRCUIT FLOW · ROTATE</div>
        {!hasInteracted ? (
          <button
            type="button"
            data-testid="cf-demo-button"
            aria-label="Watch Circuit Flow demo"
            title={DEMO_TIME_HINT}
            onClick={openDemo}
            style={demoButtonStyle}
          >
            Watch demo
          </button>
        ) : null}
      </div>
      <p data-testid="cf-prompt" style={promptStyle}>
        {card.prompt}
      </p>
      {showYourTurn && !hasInteracted ? (
        <p
          data-testid="cf-your-turn"
          role="status"
          aria-live="polite"
          style={yourTurnStyle}
        >
          Your turn — rotate the tiles, then tap Test flow.
        </p>
      ) : null}
      <div
        role="grid"
        aria-label="Circuit grid"
        style={{
          ...gridStyle,
          gridTemplateColumns: `repeat(${card.config.columns}, minmax(0, 1fr))`,
        }}
      >
        {card.config.tiles.map((tile) => {
          const rotation = rotations[tile.id] ?? tile.initialRotation;
          const connections = rotatedCircuitConnections(
            tile.connections,
            rotation,
          );
          const isSource = tile.id === card.config.sourceTileId;
          const isEndpoint = endpointTileIds.has(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              role="gridcell"
              data-testid={`cf-tile-${tile.id}`}
              aria-label={`${isSource ? 'Start, pulse source, ' : isEndpoint ? 'End, ' : ''}tile ${tile.id}, rotation ${rotation}`}
              onClick={() => rotate(tile.id)}
              style={{
                ...tileStyle,
                ...(isSource ? sourceTileStyle : null),
                ...(isEndpoint ? endpointTileStyle : null),
              }}
            >
              {isSource || isEndpoint ? (
                <span
                  data-testid={`cf-${isSource ? 'start' : 'end'}-${tile.id}`}
                  aria-hidden="true"
                  style={{
                    ...anchorBadgeStyle,
                    ...(isEndpoint ? endpointBadgeStyle : null),
                  }}
                >
                  {isSource ? 'START' : 'END'}
                </span>
              ) : null}
              <svg viewBox="0 0 100 100" aria-hidden="true" style={svgStyle}>
                {connections.map((direction) => {
                  const [x2, y2] = LINE_ENDS[direction];
                  return (
                    <line
                      key={direction}
                      x1="50"
                      y1="50"
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                  );
                })}
                <circle
                  cx="50"
                  cy="50"
                  r={isSource ? 19 : 13}
                  fill="currentColor"
                />
                {isEndpoint ? (
                  <circle
                    cx="50"
                    cy="50"
                    r="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                  />
                ) : null}
                {isSource ? (
                  <circle cx="50" cy="50" r="7" fill="var(--color-accent-on)" />
                ) : null}
              </svg>
            </button>
          );
        })}
      </div>
      <div style={footerStyle}>
        <p role="status" aria-live="polite" style={statusStyle}>
          {preview.signals.connected_tiles}/{preview.signals.total_tiles} linked
          · {preview.signals.dangling_connections} loose
        </p>
        <button
          type="button"
          data-testid="cf-submit"
          onClick={submit}
          style={submitStyle}
        >
          Test flow
        </button>
      </div>
      {demoOpen ? (
        <CircuitDemo step={demoStep} onClose={finishDemo} />
      ) : null}
    </section>
  );
}

function CircuitDemo({
  step,
  onClose,
}: {
  step: DemoStep;
  onClose: () => void;
}) {
  const instruction =
    step === 0
      ? 'Tap a tile to rotate its wires.'
      : step === 1
        ? 'Rotate until neighboring wires meet.'
        : 'Connected! Build one path with no loose ends.';
  const [sourceX2, sourceY2] =
    step === 0 ? LINE_ENDS.down : LINE_ENDS.right;
  return (
    <div style={demoBackdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Circuit Flow demonstration"
        style={demoPanelStyle}
      >
        <h2 style={demoTitleStyle}>How Circuit Flow works</h2>
        <p
          data-testid="cf-demo-instruction"
          aria-live="polite"
          style={demoInstructionStyle}
        >
          {instruction}
        </p>
        <div style={demoCircuitStyle}>
          <div
            data-testid="cf-demo-source"
            data-connected={step >= 1 ? 'true' : 'false'}
            style={{
              ...demoTileStyle,
              ...(step >= 1 ? demoConnectedTileStyle : null),
            }}
          >
            <svg viewBox="0 0 100 100" aria-hidden="true" style={svgStyle}>
              <line
                x1="50"
                y1="50"
                x2={sourceX2}
                y2={sourceY2}
                stroke="currentColor"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <circle cx="50" cy="50" r="19" fill="currentColor" />
              <circle cx="50" cy="50" r="7" fill="var(--color-accent-on)" />
            </svg>
          </div>
          <div
            data-testid="cf-demo-target"
            data-connected={step >= 2 ? 'true' : 'false'}
            style={{
              ...demoTileStyle,
              ...(step >= 2 ? demoConnectedTileStyle : null),
            }}
          >
            <svg viewBox="0 0 100 100" aria-hidden="true" style={svgStyle}>
              <line
                x1="50"
                y1="50"
                x2="0"
                y2="50"
                stroke="currentColor"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <circle cx="50" cy="50" r="13" fill="currentColor" />
            </svg>
          </div>
        </div>
        <div aria-hidden="true" style={demoProgressStyle}>
          {[0, 1, 2].map((item) => (
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
          data-testid="cf-demo-skip"
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
const demoLaunchRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
} as const;
const eyebrowStyle = {
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.16em',
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
const promptStyle = {
  margin: 0,
  fontSize: 'var(--font-size-hero)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 'var(--line-height-tight)',
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
const gridStyle = {
  display: 'grid',
  gap: 6,
  padding: 8,
  borderRadius: 'var(--radius-lg)',
  background: 'var(--game-board, rgba(3,8,18,.48))',
  border:
    '1px solid color-mix(in srgb, var(--accent) 30%, var(--game-border, var(--color-border)))',
} as const;
const tileStyle = {
  position: 'relative',
  aspectRatio: '1',
  minWidth: 0,
  minHeight: 54,
  padding: 6,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, rgba(255,255,255,.08))',
  background:
    'linear-gradient(145deg, var(--game-surface-raised), var(--game-surface))',
  color: 'var(--accent)',
} as const;
const sourceTileStyle = {
  boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 40%, transparent)',
  border: '2px solid var(--accent)',
} as const;
const endpointTileStyle = {
  boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 28%, transparent)',
  border: '2px dashed var(--accent)',
} as const;
const anchorBadgeStyle = {
  position: 'absolute',
  zIndex: 1,
  top: 4,
  left: 4,
  padding: '2px 5px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--accent)',
  color: 'var(--color-accent-on)',
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: '0.06em',
  lineHeight: 1,
} as const;
const endpointBadgeStyle = {
  background: 'var(--game-surface-raised)',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
} as const;
const svgStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  filter:
    'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 48%, transparent))',
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
  fontSize: 12,
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
  width: 'min(360px, 100%)',
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
  minHeight: 42,
  margin: 0,
  color: 'var(--color-text-muted)',
  textAlign: 'center',
} as const;
const demoCircuitStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--space-2)',
} as const;
const demoTileStyle = {
  aspectRatio: '1',
  minHeight: 96,
  padding: 8,
  borderRadius: 'var(--radius-md)',
  border: '2px solid var(--color-border)',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--accent)',
  transition: 'border-color var(--motion-fast) var(--ease-out)',
} as const;
const demoConnectedTileStyle = {
  borderColor: 'var(--accent)',
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
