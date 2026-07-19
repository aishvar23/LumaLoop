/**
 * Prism Path renderer — a feed-native mirror-routing game.
 *
 * The renderer owns only interaction and visuals: it toggles mirror orientation,
 * shows the live beam trace, and submits the current orientation map through the
 * pure evaluator. Beam correctness is never reimplemented here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const PRISM_PATH_DESCRIPTION =
  'Rotate mirrors to bend the beam from IN to the star while avoiding blocker squares. Use the live preview, then fire only when the route reaches the target.';
const DEMO_TIME_HINT =
  'Watching the demo adds about 5 seconds to your overall solve time.';
const DEMO_CONNECT_MS = 1300;
const DEMO_TARGET_MS = 2600;
const DEMO_CLOSE_MS = 4200;

type DemoStep = 0 | 1 | 2;

const DEMO_CONFIG: PrismPathCardType['config'] = {
  rows: 3,
  columns: 4,
  entry: { row: 2, column: 0 },
  entryDirection: 'right',
  target: { row: 0, column: 3 },
  mirrors: [
    { id: 'demo-a', row: 2, column: 1, initialOrientation: 'backslash' },
    { id: 'demo-b', row: 0, column: 1, initialOrientation: 'backslash' },
  ],
  blockers: [{ row: 0, column: 0 }],
  solution: [
    { mirrorId: 'demo-a', orientation: 'slash' },
    { mirrorId: 'demo-b', orientation: 'slash' },
  ],
  timeLimitMs: 0,
};

function demoOrientationsForStep(step: DemoStep): PrismPathOrientationMap {
  if (step === 0) {
    return { 'demo-a': 'backslash', 'demo-b': 'backslash' };
  }
  if (step === 1) {
    return { 'demo-a': 'slash', 'demo-b': 'backslash' };
  }
  return { 'demo-a': 'slash', 'demo-b': 'slash' };
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
    const connectTimer = setTimeout(
      () => setDemoStep(1),
      DEMO_CONNECT_MS,
    );
    const targetTimer = setTimeout(() => setDemoStep(2), DEMO_TARGET_MS);
    const closeTimer = setTimeout(finishDemo, DEMO_CLOSE_MS);
    return () => {
      clearTimeout(connectTimer);
      clearTimeout(targetTimer);
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
    setHasInteracted(true);
    setShowYourTurn(false);
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
    <section
      aria-label={`Prism path. ${PRISM_PATH_DESCRIPTION}`}
      style={sectionStyle}
    >
      <div style={demoLaunchRowStyle}>
        <div style={introCopyStyle}>
          <div
            data-testid="pp-description-trigger"
            title={PRISM_PATH_DESCRIPTION}
            tabIndex={0}
            style={eyebrowStyle}
          >
            PRISM PATH · MIRROR ROUTING
          </div>
        </div>
        {!hasInteracted ? (
          <button
            type="button"
            data-testid="pp-demo-button"
            aria-label="Watch Prism Path demo"
            title={DEMO_TIME_HINT}
            onClick={openDemo}
            style={demoButtonStyle}
          >
            Watch demo
          </button>
        ) : null}
      </div>
      <p data-testid="pp-prompt" style={promptStyle}>
        {card.prompt}
      </p>
      {showYourTurn && !hasInteracted ? (
        <p
          data-testid="pp-your-turn"
          role="status"
          aria-live="polite"
          style={yourTurnStyle}
        >
          Your turn — rotate mirrors until the preview reaches the star.
        </p>
      ) : null}

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
      {demoOpen ? (
        <PrismDemo step={demoStep} onClose={finishDemo} />
      ) : null}
    </section>
  );
}

PrismPathCard.displayName = 'PrismPathCard';

function PrismDemo({
  step,
  onClose,
}: {
  step: DemoStep;
  onClose: () => void;
}) {
  const orientations = demoOrientationsForStep(step);
  const trace = tracePrismPath(DEMO_CONFIG, orientations);
  const pathSet = new Set(trace.cells.map(coordKey));
  const blockerSet = new Set(DEMO_CONFIG.blockers.map(coordKey));
  const mirrorByCoord = new Map<string, (typeof DEMO_CONFIG.mirrors)[number]>();
  for (const mirror of DEMO_CONFIG.mirrors) {
    mirrorByCoord.set(coordKey(mirror), mirror);
  }
  const instruction =
    step === 0
      ? 'The beam starts at IN and follows the current mirror angle.'
      : step === 1
        ? 'One mirror turns the beam upward, but the next angle still hits a block.'
        : 'Rotate the second mirror and the beam reaches the star.';
  const cells: GridCoordinate[] = [];
  for (let row = 0; row < DEMO_CONFIG.rows; row++) {
    for (let column = 0; column < DEMO_CONFIG.columns; column++) {
      cells.push({ row, column });
    }
  }

  return (
    <div style={demoBackdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prism Path demonstration"
        style={demoPanelStyle}
      >
        <h2 style={demoTitleStyle}>How Prism Path works</h2>
        <p
          data-testid="pp-demo-instruction"
          aria-live="polite"
          style={demoInstructionStyle}
        >
          {instruction}
        </p>
        <div
          data-testid="pp-demo-board"
          role="grid"
          aria-label="Separate Prism Path demo board"
          style={{
            ...demoBoardStyle,
            gridTemplateColumns: `repeat(${DEMO_CONFIG.columns}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((coord) => {
            const key = coordKey(coord);
            const mirror = mirrorByCoord.get(key);
            const isEntry =
              coord.row === DEMO_CONFIG.entry.row &&
              coord.column === DEMO_CONFIG.entry.column;
            const isTarget =
              coord.row === DEMO_CONFIG.target.row &&
              coord.column === DEMO_CONFIG.target.column;
            const isBlocker = blockerSet.has(key);
            const isBeam = pathSet.has(key);
            const cellStyle = {
              ...demoCellStyle,
              ...(isBeam ? demoBeamCellStyle : null),
              ...(isEntry ? entryCellStyle : null),
              ...(isTarget ? targetCellStyle : null),
              ...(isBlocker ? blockerCellStyle : null),
              ...(mirror ? mirrorCellStyle : null),
            };

            return (
              <div
                key={key}
                role="gridcell"
                data-testid={`pp-demo-cell-${key}`}
                data-beam={isBeam ? 'true' : 'false'}
                style={cellStyle}
              >
                {mirror ? (
                  <span aria-hidden="true" style={demoMirrorGlyphStyle}>
                    {mirrorGlyph(orientations[mirror.id] ?? 'slash')}
                  </span>
                ) : isEntry ? (
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
        <p style={demoCaptionStyle}>
          Demo uses a separate mini board, not this puzzle’s answer.
        </p>
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
          data-testid="pp-demo-skip"
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

const introCopyStyle = {
  minWidth: 0,
} as const;

const eyebrowStyle = {
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.16em',
  outline: 'none',
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

const boardStyle = {
  display: 'grid',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
  borderRadius: 'var(--radius-md)',
  background:
    'radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 58%), var(--game-board, var(--surface))',
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
  background: 'var(--game-surface-raised, rgb(255 255 255 / 0.055))',
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
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
  background: 'var(--game-board, rgba(3,8,18,.58))',
} as const;

const demoCellStyle = {
  ...baseCellStyle,
  minHeight: 54,
} as const;

const demoBeamCellStyle = {
  ...beamCellStyle,
  boxShadow: 'inset 0 0 16px color-mix(in srgb, var(--accent) 42%, transparent)',
} as const;

const demoMirrorGlyphStyle = {
  ...mirrorGlyphStyle,
  fontSize: '1.75rem',
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
