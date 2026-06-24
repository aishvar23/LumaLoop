/**
 * Code Break renderer (Azure DevOps #143; Technical Design §6, §7, §14).
 *
 * A DEDUCTIVE, MULTI-GUESS template (Mastermind / Bulls-and-Cows): the player
 * builds a guess of `codeLength` symbols from the `palette`, submits it, and
 * reads per-guess peg feedback (exact = right symbol + slot; partial = right
 * symbol, wrong slot) computed by the pure {@link evaluateCodeBreak} family. The
 * board grows a row per submitted guess; the player wins by submitting the
 * secret. Unlike `memory_sequence`/`what_changed` there is NO timed PRE-phase —
 * the board and palette mount immediately, so interaction is enabled at card
 * start and the controller sets `interactionEnabledAtMs === activeAtMs`.
 *
 * Timing convention (multi-step): `elapsedMs` runs from `context.activeAtMs`;
 * `interactionElapsedMs` / TTI runs from the FIRST interaction
 * (`context.interactionEnabledAtMs`), captured on the first slot/palette tap.
 * The two origins are used INDEPENDENTLY and never assumed equal.
 *
 * Resolution semantics: the renderer collects each submitted guess and routes
 * the whole list through the pure evaluator (the single source of truth — peg
 * logic is NEVER re-implemented in the UI). It resolves CORRECT the instant a
 * submitted guess equals the secret, INCORRECT once `maxGuesses` are used without
 * solving. `onResolve` fires EXACTLY ONCE. `onAttempt` fires once, on the first
 * meaningful input.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` covers the whole
 * solve, armed on mount via the shared {@link useCardTimer}; on expiry the card
 * resolves TIMEOUT (`isCorrect: false`, `signals.timedOut: true`). The shared
 * `isActive` ACTIVATION signal is accepted and passed through for contract
 * consistency; with no off-screen timed pre-phase, nothing branches on it.
 * Resolution is latched per slide so a late tap on a finished card is inert.
 *
 * Accessibility (Technical Design §14): slots and palette symbols are real
 * `<button>`s, large (≥ `--tap-target-min`), labelled, and keyboard-focusable;
 * peg feedback is announced as text ("2 exact, 1 partial") so it is never
 * conveyed by colour alone, and a polite `role="status"` live region announces
 * the latest result and remaining guesses.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { CodeBreakCard as CodeBreakCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import {
  evaluateCodeBreak,
  isSolved,
  scoreGuess,
  type CodeBreakFeedback,
} from './codeBreakEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The optional prop keeps it
 * assignable to the registry's `ComponentType<TemplateProps<CodeBreakCard>>` slot
 * while staying testable under fake timers.
 *
 * `isActive` is the shared ACTIVATION signal; Code Break has no timed pre-phase,
 * so it accepts the flag for contract consistency but does not gate any behaviour
 * on it. Omitted ≡ active.
 */
export type CodeBreakCardProps = TemplateProps<CodeBreakCardType> & {
  now?: () => number;
};

/** One submitted board row: the guess and its evaluated pegs. */
type BoardRow = { guess: string[]; feedback: CodeBreakFeedback };

export default function CodeBreakCard({
  card,
  context,
  // Accepted for contract consistency; no off-screen timed pre-phase to gate.
  isActive: _isActive = true,
  onAttempt,
  onResolve,
  now = Date.now,
}: CodeBreakCardProps) {
  const { config } = card;
  const { palette, codeLength, secret, maxGuesses } = config;

  // Submitted rows (mirrored to state for display + a ref for resolution-time
  // reads outside the render cycle, e.g. the timeout signal getter).
  const [rows, setRows] = useState<BoardRow[]>([]);
  const submittedGuessesRef = useRef<string[][]>([]);

  // The guess currently being built. `null` slots are empty; the active slot is
  // where the next palette tap lands.
  const [draft, setDraft] = useState<(string | null)[]>(() =>
    Array.from({ length: codeLength }, () => null),
  );
  const [activeSlot, setActiveSlot] = useState(0);

  const firstInputElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);

  // Latch both resolution paths (own completion + the hook's timeout) so any
  // late tap is inert and cannot re-submit or re-announce on a finished card.
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
    // Read at expiry: report how far the player got before the clock ran out.
    timeoutSignals: () => ({
      guesses_allowed: maxGuesses,
      guesses_used: submittedGuessesRef.current.length,
      code_length: codeLength,
      time_to_interaction: firstInputElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  // First meaningful input: record the attempt exactly once and capture TTI.
  const markFirstInput = useCallback(() => {
    if (firstInputElapsedRef.current !== null) return;
    const tti = now() - context.interactionEnabledAtMs;
    firstInputElapsedRef.current = tti;
    onAttempt({ time_to_interaction: tti });
    attemptCountRef.current = timer.markAttempt();
  }, [now, context.interactionEnabledAtMs, onAttempt, timer]);

  const handleSlotTap = useCallback(
    (slot: number) => {
      if (resolvedRef.current) return;
      markFirstInput();
      setActiveSlot(slot);
    },
    [markFirstInput],
  );

  const handlePaletteTap = useCallback(
    (symbol: string) => {
      if (resolvedRef.current) return;
      markFirstInput();
      setDraft((prev) => {
        const next = [...prev];
        next[activeSlot] = symbol;
        return next;
      });
      // Advance to the next empty-ish slot for fast entry; wraps to keep it cheap.
      setActiveSlot((slot) => (slot + 1) % codeLength);
    },
    [activeSlot, codeLength, markFirstInput],
  );

  const draftComplete = draft.every((s) => s !== null);

  const handleSubmit = useCallback(() => {
    if (resolvedRef.current || !draftComplete) return;

    const guess = draft.map((s) => s as string);
    const feedback = scoreGuess(secret, guess);

    const nextGuesses = [...submittedGuessesRef.current, guess];
    submittedGuessesRef.current = nextGuesses;
    setRows((prev) => [...prev, { guess, feedback }]);

    // Reset the draft for the next attempt.
    setDraft(Array.from({ length: codeLength }, () => null));
    setActiveSlot(0);

    const solved = isSolved(secret, guess);
    const exhausted = nextGuesses.length >= maxGuesses;

    // Resolve only on a solve or when the last guess is spent; otherwise the
    // player keeps deducing ("one more try" loop).
    if (!solved && !exhausted) return;

    const result = evaluateCodeBreak({ secret }, nextGuesses, maxGuesses);
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
    context.activeAtMs,
    context.interactionEnabledAtMs,
    draft,
    draftComplete,
    codeLength,
    maxGuesses,
    secret,
    now,
    timer,
  ]);

  const guessesLeft = maxGuesses - rows.length;
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

  // Stable slot indices for the draft grid template.
  const slotIndices = useMemo(
    () => Array.from({ length: codeLength }, (_, i) => i),
    [codeLength],
  );

  return (
    <section aria-label="Code break" style={sectionStyle}>
      <p data-testid="cb-prompt" style={promptStyle}>
        {card.prompt}
      </p>

      {/* Submitted history: each guess + its peg feedback as TEXT. */}
      <div role="list" aria-label="Your guesses so far" style={historyStyle}>
        {rows.map((row, rowIndex) => (
          <div
            // Rows are append-only; index is a stable key by construction.
            key={rowIndex}
            role="listitem"
            data-testid={`cb-row-${rowIndex}`}
            style={rowStyle}
          >
            <div style={rowSymbolsStyle}>
              {row.guess.map((symbol, slot) => (
                <span key={slot} style={historyChipStyle}>
                  {symbol}
                </span>
              ))}
            </div>
            <span
              data-testid={`cb-feedback-${rowIndex}`}
              style={feedbackStyle}
            >
              {`${row.feedback.exact} exact, ${row.feedback.partial} partial`}
            </span>
          </div>
        ))}
      </div>

      {/* The current guess builder. */}
      <div
        role="group"
        aria-label="Your current guess"
        style={{
          ...draftStyle,
          gridTemplateColumns: `repeat(${codeLength}, 1fr)`,
        }}
      >
        {slotIndices.map((slot) => (
          <button
            key={slot}
            type="button"
            data-testid={`cb-slot-${slot}`}
            aria-label={`Slot ${slot + 1}${
              draft[slot] ? `: ${draft[slot]}` : ': empty'
            }${slot === activeSlot ? ' (active)' : ''}`}
            aria-pressed={slot === activeSlot}
            onClick={() => handleSlotTap(slot)}
            style={slot === activeSlot ? activeSlotStyle : slotStyle}
          >
            {draft[slot] ?? '·'}
          </button>
        ))}
      </div>

      {/* The palette: fills the active slot. */}
      <div role="group" aria-label="Symbol palette" style={paletteStyle}>
        {palette.map((symbol) => (
          <button
            key={symbol}
            type="button"
            data-testid={`cb-palette-${symbol}`}
            aria-label={`Place ${symbol}`}
            onClick={() => handlePaletteTap(symbol)}
            style={paletteButtonStyle}
          >
            {symbol}
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="cb-submit"
        disabled={!draftComplete}
        onClick={handleSubmit}
        style={draftComplete ? submitStyle : submitDisabledStyle}
      >
        Submit guess
      </button>

      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {lastRow
          ? `Last guess: ${lastRow.feedback.exact} exact, ${lastRow.feedback.partial} partial. `
          : ''}
        {`${guessesLeft} ${guessesLeft === 1 ? 'guess' : 'guesses'} left.`}
      </p>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

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
  letterSpacing: '-0.01em',
} as const;

const historyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  width: '100%',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-board, transparent)',
  // Cap the history height so a long board scrolls instead of pushing the
  // builder off-screen on small viewports.
  maxHeight: '34vh',
  overflowY: 'auto',
} as const;

const rowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
} as const;

const rowSymbolsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-1)',
} as const;

const historyChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--tap-target-min)',
  minHeight: 'calc(var(--tap-target-min) * 0.7)',
  padding: 'var(--space-1)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-sans)',
} as const;

const feedbackStyle = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--accent, var(--color-accent))',
  whiteSpace: 'nowrap',
} as const;

const draftStyle = {
  display: 'grid',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const slotStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  aspectRatio: '1 / 1',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  borderWidth: '2px',
  borderStyle: 'dashed',
  borderColor: 'var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
  transition:
    'border-color var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out)',
} as const;

// The active slot: a solid accent ring (+ the "(active)" label) so the focus
// target is never conveyed by colour alone.
const activeSlotStyle = {
  ...slotStyle,
  borderStyle: 'solid',
  borderColor: 'var(--accent, var(--color-accent))',
  transform: 'scale(1.04)',
} as const;

const paletteStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const paletteButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '1 1 auto',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const submitStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--accent, var(--color-accent))',
  color: 'var(--color-accent-on)',
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-bold)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
  transition: 'transform var(--motion-fast) var(--ease-out)',
} as const;

const submitDisabledStyle = {
  ...submitStyle,
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text-muted)',
  cursor: 'not-allowed',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
