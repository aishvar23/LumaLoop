/**
 * Step Logic renderer (Azure DevOps #139; Technical Design §6, §7, §14).
 *
 * A MULTI-STEP logical-reasoning template: the player answers a short chain of
 * 2–3 LINKED multiple-choice sub-questions that build on a shared `premise`.
 * Unlike `memory_sequence`/`what_changed` there is NO timed PRE-phase — the
 * premise and the first sub-question's options mount immediately, so the renderer
 * treats interaction as enabled at card start. In the engage-gated feed (#106)
 * the interaction origin (`interactionEnabledAtMs`) is the first-pick instant,
 * which can be later than `activeAtMs`; the renderer uses each origin
 * INDEPENDENTLY (`elapsedMs` from `activeAtMs`,
 * `interactionElapsedMs`/TTI from `interactionEnabledAtMs`) and never relies on
 * the two being equal.
 *
 * Step flow: the renderer presents sub-question N's `stem` + `options`; on a pick
 * it advances to sub-question N+1, until every step is answered. `onAttempt`
 * fires exactly once, on the FIRST pick.
 *
 * Resolution semantics — NON-STRICT (documented UX choice, consistent with
 * `pattern_chain`): the player always completes the whole chain (one pick per
 * step); a wrong pick does NOT end the card early. `onResolve` fires EXACTLY
 * ONCE, after the final step, routing the collected pick order through the pure
 * {@link evaluateStepLogic} (the single source of truth). This keeps the
 * interaction predictable — each step's options are self-contained, so a wrong
 * early pick never strands the player on an unanswerable later step — and lets
 * the evaluator report richer signals (`steps_correct`, `first_error_step`) than
 * a fail-fast would.
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
 * `role="status"` live region announces step progress, so progress is never
 * conveyed by colour or position alone.
 */

import { useCallback, useRef, useState } from 'react';

import type { StepLogicCard as StepLogicCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateStepLogic } from './stepLogicEvaluator';

/**
 * The renderer accepts the shared {@link TemplateProps} plus an optional
 * injectable `now` clock (defaults to `Date.now`). The extra prop is optional,
 * so the component stays assignable to the registry's
 * `ComponentType<TemplateProps<StepLogicCard>>` slot while remaining testable
 * under fake timers without a real wall-clock dependency.
 *
 * `isActive` is the shared {@link TemplateProps} ACTIVATION signal; Step Logic
 * has no timed pre-phase, so it accepts the flag for contract consistency but
 * does not gate any behaviour on it. Omitted ≡ active.
 */
export type StepLogicCardProps = TemplateProps<StepLogicCardType> & {
  now?: () => number;
};

export default function StepLogicCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: StepLogicCardProps) {
  const { config } = card;
  const { premise, steps } = config;

  // The current step index drives which sub-question's stem + options are shown.
  // The chosen labels are mirrored into state for display + the live region; refs
  // carry the resolution-time reads so a pick does not depend on render timing.
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
    (optionId: string) => {
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

      const pickedLabel =
        steps[chosenIdsRef.current.length]?.options.find(
          (option) => option.id === optionId,
        )?.label ?? optionId;

      const nextChosenIds = [...chosenIdsRef.current, optionId];
      chosenIdsRef.current = nextChosenIds;
      setChosenLabels((prev) => [...prev, pickedLabel]);

      // Not the final step yet: advance to the next sub-question.
      if (nextChosenIds.length < steps.length) {
        setCurrentStep((step) => step + 1);
        return;
      }

      // Final step answered: route the full chain through the pure evaluator
      // (the single source of truth) and resolve via the hook to keep the
      // single-fire guarantee + disarm the timer.
      const result = evaluateStepLogic({ steps }, nextChosenIds);
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

  // Once every step is answered the chain is complete and resolves; hide the
  // step options so no latched option lingers (in the feed the FeedbackGate also
  // replaces the resolved card, but the renderer is correct standalone).
  const chainComplete = chosenLabels.length >= steps.length;
  const activeStep = chainComplete ? undefined : steps[currentStep];

  return (
    <section aria-label="Step logic" style={sectionStyle}>
      <p data-testid="sl-prompt" style={promptStyle}>
        {card.prompt}
      </p>

      <p data-testid="sl-premise" style={premiseStyle}>
        {premise}
      </p>

      {activeStep ? (
        <div
          role="group"
          aria-label={`Sub-question ${currentStep + 1} of ${steps.length}`}
          style={stepStyle}
        >
          <p data-testid="sl-stem" style={stemStyle}>
            {activeStep.stem}
          </p>
          <div style={optionsStyle}>
            {activeStep.options.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`sl-option-${option.id}`}
                onClick={() => handlePick(option.id)}
                style={optionStyle}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {`Step ${Math.min(currentStep + 1, steps.length)} of ${steps.length}`}
        {chosenLabels.length > 0 ? `. Answered: ${chosenLabels.join(', ')}` : ''}
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

// The shared premise stays visible above every sub-question for the whole solve.
const premiseStyle = {
  margin: 0,
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  lineHeight: 'var(--line-height-snug)',
  fontFamily: 'var(--font-sans)',
} as const;

const stepStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  width: '100%',
} as const;

const stemStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  lineHeight: 'var(--line-height-snug)',
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
