/**
 * Pattern Chain renderer (Azure DevOps #138; Technical Design §6, §7, §14).
 *
 * A MULTI-STEP pattern-recognition template: the player continues a visible
 * `sequence` by picking the next item, then the next (2–3 ordered steps). Unlike
 * `memory_sequence`/`what_changed` there is NO timed PRE-phase — the sequence
 * and the first step's options mount immediately, so interaction is enabled at
 * card start and the controller sets `interactionEnabledAtMs === activeAtMs`;
 * `elapsedMs` and `interactionElapsedMs` therefore share the same origin.
 *
 * Step flow: the renderer presents step N's `options`; on a pick it APPENDS the
 * chosen item to the shown sequence and advances to step N+1, until every step
 * is answered. `onAttempt` fires exactly once, on the FIRST pick.
 *
 * Resolution semantics — NON-STRICT (documented UX choice): the player always
 * completes the whole chain (one pick per step); a wrong pick does NOT end the
 * card early. `onResolve` fires EXACTLY ONCE, after the final step, routing the
 * collected pick order through the pure {@link evaluatePatternChain} (the single
 * source of truth). This keeps the interaction predictable — each step's options
 * are self-contained, so a wrong early pick never strands the player on an
 * unanswerable later step — and lets the evaluator report richer signals
 * (`steps_correct`, `first_error_step`) than a fail-fast would.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` covers the whole
 * solve and is armed on mount via the shared {@link useCardTimer}; on expiry it
 * resolves the card as a TIMEOUT (`isCorrect: false`, `signals.timedOut: true`).
 * There is no off-screen timed animation here, but the shared `isActive`
 * ACTIVATION signal is still accepted and passed through for contract
 * consistency; with no pre-phase to gate, the renderer does not branch on it.
 *
 * Accessibility (Technical Design §14): options are real `<button>`s, large
 * (≥ `--tap-target-min`), labeled, and keyboard-focusable; a polite
 * `role="status"` live region announces step progress and the running chain, so
 * progress is never conveyed by colour or position alone.
 */

import { useCallback, useRef, useState } from 'react';

import type { PatternChainCard as PatternChainCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluatePatternChain } from './patternChainEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<PatternChainCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
 *
 * `isActive` is the shared {@link TemplateProps} ACTIVATION signal; Pattern Chain
 * has no timed pre-phase, so it accepts the flag for contract consistency but
 * does not gate any behaviour on it. Omitted ≡ active.
 */
export type PatternChainCardProps = TemplateProps<PatternChainCardType> & {
  now?: () => number;
};

export default function PatternChainCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: PatternChainCardProps) {
  const { config } = card;
  const { sequence, steps } = config;

  // The current step index drives which step's options are shown. The chosen
  // labels (appended to the visible sequence) and the chain of picked ids are
  // mirrored into state for display + the live region; refs carry the
  // resolution-time reads so a pick does not depend on render timing.
  const [currentStep, setCurrentStep] = useState(0);
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const chosenIdsRef = useRef<string[]>([]);

  const firstPickElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);

  // Latch both resolution paths (own completion + the hook's timeout) so any
  // late pick is inert and cannot re-advance or re-announce on a finished card.
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
      steps_total: steps.length,
      steps_taken: chosenIdsRef.current.length,
      time_to_interaction: firstPickElapsedRef.current ?? -1,
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handlePick = useCallback(
    (optionId: string, optionLabel: string) => {
      // Once resolved (by completion or timeout), further picks are inert.
      if (resolvedRef.current) return;

      const pickedAtMs = now();

      // First meaningful input: record the attempt exactly once and capture
      // time-to-interaction from the (single-phase) interaction origin.
      if (firstPickElapsedRef.current === null) {
        const tti = pickedAtMs - context.interactionEnabledAtMs;
        firstPickElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }

      const nextChosenIds = [...chosenIdsRef.current, optionId];
      chosenIdsRef.current = nextChosenIds;
      setChosenLabels((prev) => [...prev, optionLabel]);

      // Not the final step yet: append the pick and advance to the next step.
      if (nextChosenIds.length < steps.length) {
        setCurrentStep((step) => step + 1);
        return;
      }

      // Final step answered: route the full chain through the pure evaluator
      // (the single source of truth) and resolve via the hook to keep the
      // single-fire guarantee + disarm the timer.
      const result = evaluatePatternChain({ steps }, nextChosenIds);
      timer.resolve({
        cardId: card.cardId,
        resolutionType: result.resolutionType,
        isCorrect: result.isCorrect,
        elapsedMs: pickedAtMs - context.activeAtMs,
        interactionElapsedMs: pickedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          ...result.signals,
          time_to_interaction: firstPickElapsedRef.current,
          correct: result.isCorrect,
          elapsed: pickedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      steps,
      now,
      onAttempt,
      timer,
    ],
  );

  // The visible chain: the authored sequence followed by the items the player
  // has picked so far. Rendered as plain chips (the answer-key options are the
  // only interactive elements).
  const shownItems = [...sequence, ...chosenLabels];

  // Once every step is answered the chain is complete and resolves; hide the
  // step options so no latched option lingers (in the feed the FeedbackGate
  // also replaces the resolved card, but the renderer is correct standalone).
  const chainComplete = chosenLabels.length >= steps.length;
  const activeStep = chainComplete ? undefined : steps[currentStep];

  return (
    <section aria-label="Pattern chain" style={sectionStyle}>
      <p data-testid="pc-prompt" style={promptStyle}>
        {card.prompt}
      </p>

      <div
        role="group"
        aria-label="The sequence so far"
        style={sequenceStyle}
      >
        {shownItems.map((item, index) => (
          <span
            // Items can repeat, so the index is part of the key by design.
            key={`${index}-${item}`}
            data-testid={`pc-seq-${index}`}
            style={index < sequence.length ? chipStyle : chosenChipStyle}
          >
            {item}
          </span>
        ))}
        <span aria-hidden="true" data-testid="pc-next-slot" style={nextSlotStyle}>
          ?
        </span>
      </div>

      {activeStep ? (
        <div
          role="group"
          aria-label={`Pick the next item (step ${currentStep + 1} of ${steps.length})`}
          style={optionsStyle}
        >
          {activeStep.options.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`pc-option-${option.id}`}
              onClick={() => handlePick(option.id, option.label)}
              style={optionStyle}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {`Step ${Math.min(currentStep + 1, steps.length)} of ${steps.length}`}
        {chosenLabels.length > 0 ? `. Picked: ${chosenLabels.join(', ')}` : ''}
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
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  lineHeight: 'var(--line-height-snug)',
} as const;

const sequenceStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-lg)',
  fontFamily: 'var(--font-sans)',
} as const;

// A picked item, appended to the chain: a stronger surface so the player's own
// additions read distinctly from the authored sequence (paired with the order,
// never colour alone).
const chosenChipStyle = {
  ...chipStyle,
  borderColor: 'var(--color-accent)',
  background: 'var(--color-accent)',
} as const;

const nextSlotStyle = {
  ...chipStyle,
  borderStyle: 'dashed',
  background: 'transparent',
  color: 'var(--color-text-muted)',
} as const;

const optionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const optionStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '1 1 auto',
  minHeight: 'var(--tap-target-min)',
  minWidth: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
