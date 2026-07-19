/**
 * Odd One Out renderer (Design §9; Technical Design §6, §7, §14).
 *
 * A conceptual pattern-recognition template. A single phase, no preview and no
 * stream: the items mount immediately, so interaction is enabled at card start —
 * the controller sets `interactionEnabledAtMs === activeAtMs`, and `elapsedMs`
 * and `interactionElapsedMs` share the same origin. Essentially `tiny_logic`'s
 * one-move choice, but the "options" are the items themselves (tap the one that
 * does not belong) rather than answer buttons under a stem.
 *
 * Resolution semantics: a single committed pick resolves the card — correct if it
 * is `oddItemId`, otherwise incorrect (the wrong pick is the recorded distractor).
 * No retry affordance. Correctness + the chosen distractor come from the pure
 * {@link evaluateOddOneOut} (the single source of truth), never re-derived inline.
 * The feed-level FeedbackGate shows the uniform explanation (which states the
 * shared rule) after the resolution, so this renderer does not reveal it itself.
 *
 * Timeout semantics (Technical Design §7): `config.timeLimitMs` is armed on mount
 * via the shared {@link useCardTimer}; on expiry the card resolves TIMEOUT
 * (`isCorrect: false`, `signals.timedOut: true`).
 *
 * Accessibility (Technical Design §14): items are real `<button>`s, large
 * (≥ `--tap-target-min`), labeled by their value, and keyboard-focusable; the
 * picked item is conveyed by `aria-pressed` plus a polite `role="status"` live
 * region — never by colour or position alone (the item LABEL carries the meaning).
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { orderOptions } from '../../cards/optionOrder';
import type { OddOneOutCard as OddOneOutCardType } from '../../cards/types';
import type { CardResolution, TemplateProps } from '../contract';
import { useCardTimer } from '../useCardTimer';
import { evaluateOddOneOut } from './oddOneOutEvaluator';

export type OddOneOutCardProps = TemplateProps<OddOneOutCardType> & {
  now?: () => number;
};

export default function OddOneOutCard({
  card,
  context,
  onAttempt,
  onResolve,
  now = Date.now,
}: OddOneOutCardProps) {
  const { config } = card;

  const firstPickElapsedRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const resolvedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      time_to_interaction: firstPickElapsedRef.current ?? -1,
      selected_item_id: selectedId ?? '',
      distractor_item_id: '',
      correct: false,
      elapsed: now() - context.interactionEnabledAtMs,
    }),
  });

  const handlePick = useCallback(
    (itemId: string) => {
      if (resolvedRef.current) return;

      const pickedAtMs = now();

      if (firstPickElapsedRef.current === null) {
        const tti = pickedAtMs - context.interactionEnabledAtMs;
        firstPickElapsedRef.current = tti;
        onAttempt({ time_to_interaction: tti });
        attemptCountRef.current = timer.markAttempt();
      }
      setSelectedId(itemId);

      const { isCorrect, distractorItemId } = evaluateOddOneOut(config, itemId);

      timer.resolve({
        cardId: card.cardId,
        resolutionType: isCorrect ? 'correct' : 'incorrect',
        isCorrect,
        elapsedMs: pickedAtMs - context.activeAtMs,
        interactionElapsedMs: pickedAtMs - context.interactionEnabledAtMs,
        attemptCount: attemptCountRef.current,
        signals: {
          time_to_interaction: firstPickElapsedRef.current,
          selected_item_id: itemId,
          distractor_item_id: distractorItemId ?? '',
          correct: isCorrect,
          elapsed: pickedAtMs - context.interactionEnabledAtMs,
        },
      });
    },
    [
      card.cardId,
      config,
      context.activeAtMs,
      context.interactionEnabledAtMs,
      now,
      onAttempt,
      timer,
    ],
  );

  const selectedLabel = selectedId
    ? (config.items.find((item) => item.id === selectedId)?.label ?? null)
    : null;
  const resultText = !selectedLabel
    ? ''
    : selectedId === config.oddItemId
      ? `Correct: ${selectedLabel}`
      : `Incorrect: ${selectedLabel}.`;

  // Present items in a deterministic, card-seeded order so the odd one is not
  // positionally guessable (it is keyed by `oddItemId`, not slot). Stable across
  // renders and identical on web↔mobile.
  const orderedItems = useMemo(
    () => orderOptions(card.cardId, config.items),
    [card.cardId, config.items],
  );

  return (
    <section aria-label="Odd one out" style={sectionStyle}>
      <p data-testid="ooo-prompt" style={promptStyle}>
        {card.prompt}
      </p>
      <div
        role="group"
        aria-label="Tap the item that does not belong"
        style={itemsStyle}
      >
        {orderedItems.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`ooo-item-${item.id}`}
              aria-pressed={isSelected}
              aria-label={item.label}
              onClick={() => handlePick(item.id)}
              style={isSelected ? itemSelectedStyle : itemStyle}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" style={liveRegionStyle}>
        {resultText}
      </p>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens) ──────────

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

const itemsStyle = {
  display: 'grid',
  gap: 'var(--space-2)',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  width: '100%',
} as const;

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--tap-target-min)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--game-border, var(--color-border))',
  background: 'var(--game-surface-raised, var(--color-surface-raised))',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-sans)',
  textAlign: 'center',
  cursor: 'pointer',
} as const;

const itemSelectedStyle = {
  ...itemStyle,
  border: '1px solid var(--accent, var(--color-accent))',
  background:
    'var(--accent-tint, var(--game-surface-raised, var(--color-surface-raised)))',
} as const;

const liveRegionStyle = {
  margin: 0,
  minHeight: 'var(--font-size-md)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
