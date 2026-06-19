/**
 * Feed registry — decorates each template renderer with the uniform in-feed
 * FEEDBACK + EXPLANATION step (Design §8.2; Technical Design §4, §14).
 *
 * Why a decorator, not a controller change (CLAUDE.md §4/§6)
 * ---------------------------------------------------------
 * The session controller OWNS progression and AUTO-ADVANCES the moment a card's
 * `onResolve` fires; renderers own only card interaction. Three of the four
 * template renderers resolve immediately, so a UNIFORM feedback/explanation
 * pause cannot live inside each renderer — it must be a feed-layer concern.
 *
 * Rather than teach the controller/reducer about a new "feedback" status, we
 * insert the pause through the EXISTING dependency-inversion seam: the renderer
 * registry. {@link createFeedRegistry} wraps every real renderer in a
 * {@link FeedbackGate}. The gate renders the real renderer but hands IT a
 * private `onResolve` that merely CAPTURES the {@link CardResolution}. The card
 * is then replaced in-flow by {@link CardFeedback}; only when the player taps
 * "Next" does the gate call the controller's real `onResolve`, advancing the
 * feed. The controller stays progression-owning and template-agnostic, and the
 * reducer is untouched — adding the feedback step is a localized feed decorator.
 *
 * Replacing (not appending) the resolved card is deliberate: it gives a clean
 * card → feedback → explanation state transition and avoids double-rendering the
 * one renderer (tiny_logic) that surfaces its own on-error explanation.
 */

import { useState } from 'react';

import type { LiquidCard, TemplateType } from '../cards/types';
import type {
  RendererRegistry,
  TemplateRenderer,
} from '../session/rendererRegistry';
import { defaultRendererRegistry } from '../session/rendererRegistry';
import type { CardResolution, TemplateProps } from '../templates/contract';
import CardFeedback from './CardFeedback';

/**
 * Wraps one renderer so its resolution pauses on the uniform feedback +
 * explanation step before the feed advances.
 *
 * Typed at the {@link LiquidCard} base: a gate is template-agnostic (it only
 * reads `card.explanation`, shared by every card), so a single generic wrapper
 * serves every slot. {@link createFeedRegistry} re-attaches the precise
 * per-template type via the same localized cast the registry already documents.
 */
export function withFeedbackGate(
  Inner: TemplateRenderer<LiquidCard>,
): TemplateRenderer<LiquidCard> {
  function FeedbackGate({
    card,
    context,
    onAttempt,
    onResolve,
  }: TemplateProps<LiquidCard>) {
    // The captured resolution doubles as the state discriminant: null → the card
    // is in play; set → show the feedback/explanation step. Gate state resets
    // per card because the controller keys each card's element by session+index,
    // so every new card mounts a fresh gate.
    const [resolution, setResolution] = useState<CardResolution | null>(null);

    if (resolution) {
      return (
        <CardFeedback
          resolution={resolution}
          explanation={card.explanation}
          // Advancing is the controller's job: only now do we fire its real
          // `onResolve`, which records the result and auto-advances the feed.
          onContinue={() => onResolve(resolution)}
        />
      );
    }

    return (
      <Inner
        card={card}
        context={context}
        onAttempt={onAttempt}
        // Capture only — do NOT advance. The card stays put until "Next".
        onResolve={setResolution}
      />
    );
  }

  FeedbackGate.displayName = `FeedbackGate(${
    Inner.displayName ?? Inner.name ?? 'Renderer'
  })`;
  return FeedbackGate;
}

/**
 * Builds a feed registry by wrapping every renderer in `base` with a
 * {@link FeedbackGate}. Absent slots stay absent so the controller's missing-
 * renderer fail-safe still applies (a wrapped gate is never registered for a
 * template that had no renderer).
 *
 * The per-key cast mirrors the one sound escape hatch already documented in
 * `rendererRegistry.ts`: at runtime `base[key]` is the renderer for exactly that
 * template's card variant, and the gate forwards the same props verbatim, so the
 * wrapped renderer is assignable to the same precise slot.
 */
export function createFeedRegistry(base: RendererRegistry): RendererRegistry {
  const out: {
    -readonly [K in TemplateType]?: TemplateRenderer<LiquidCard>;
  } = {};
  for (const key of Object.keys(base) as TemplateType[]) {
    const inner = base[key] as TemplateRenderer<LiquidCard> | undefined;
    if (inner) out[key] = withFeedbackGate(inner);
  }
  return out as RendererRegistry;
}

/** The app's feed registry: the shipped renderers, each behind a feedback gate. */
export const feedRegistry: RendererRegistry =
  createFeedRegistry(defaultRendererRegistry);
