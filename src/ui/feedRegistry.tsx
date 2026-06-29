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

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { LiquidCard, TemplateType } from '../cards/types';
import type {
  RendererRegistry,
  TemplateRenderer,
} from '../session/rendererRegistry';
import { defaultRendererRegistry } from '../session/rendererRegistry';
import { useCardScoreLookup } from '../feed/cardScoreContext';
import { recordCardBest } from '../feed/cardBestStore';
import type { CardResolution, TemplateProps } from '../templates/contract';
import CardShareButton from '../social/CardShareButton';
import CardFeedback from './CardFeedback';

/**
 * Notified once when a card's EXPLANATION step becomes visible — the minimal,
 * TEMPLATE-AGNOSTIC and TELEMETRY-AGNOSTIC seam for the §10
 * `Card_Explanation_Viewed` event (#76). It is a plain `(card) => void` callback,
 * so the feed/UI layer stays decoupled from the telemetry client: `SessionRoute`
 * supplies a handler through {@link ExplanationViewedProvider} and the gate fires
 * it. Provided via context (not threaded through the controller's `TemplateProps`)
 * so the controller stays progression-only and the gate stays generic.
 */
export type ExplanationViewedHandler = (card: LiquidCard) => void;

const ExplanationViewedContext = createContext<ExplanationViewedHandler | null>(
  null,
);

/** Provide the explanation-viewed handler to the gates rendered beneath it. */
export function ExplanationViewedProvider({
  handler,
  children,
}: {
  handler: ExplanationViewedHandler;
  children: ReactNode;
}) {
  return (
    <ExplanationViewedContext.Provider value={handler}>
      {children}
    </ExplanationViewedContext.Provider>
  );
}

/**
 * Records ONE finished attempt as a play when the player taps "Play again" to
 * replay the same card (product decision 2026-06 — each replay counts as a new
 * play). Threaded via context — like {@link ExplanationViewedHandler} — so the
 * gate stays template-agnostic and the engine's per-index resolution latch
 * (which deliberately ignores repeat resolutions of the same slide) is left
 * untouched. `FeedRoute` supplies a handler that records a `game_plays` row from
 * the card + resolution; absent a provider (tests/standalone) replay just
 * remounts the card with no recording.
 */
export type CardReplayHandler = (
  card: LiquidCard,
  resolution: CardResolution,
) => void;

const CardReplayContext = createContext<CardReplayHandler | null>(null);

/** Provide the replay-record handler to the gates rendered beneath it. */
export function CardReplayProvider({
  handler,
  children,
}: {
  handler: CardReplayHandler;
  children: ReactNode;
}) {
  return (
    <CardReplayContext.Provider value={handler}>
      {children}
    </CardReplayContext.Provider>
  );
}

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
    isActive,
    onAttempt,
    onResolve,
  }: TemplateProps<LiquidCard>) {
    // The captured resolution doubles as the state discriminant: null → the card
    // is in play; set → show the feedback/explanation step. Gate state resets
    // per card because the controller keys each card's element by session+index,
    // so every new card mounts a fresh gate.
    const [resolution, setResolution] = useState<CardResolution | null>(null);

    // "Play again" remounts the SAME card fresh by bumping this counter, which is
    // part of the inner renderer's React key — a fresh mount resets the renderer's
    // internal state AND re-arms its countdown (the slide is still active). The
    // gate's own state is reset explicitly (resolution → null) at the same time.
    const [replayKey, setReplayKey] = useState(0);
    const recordReplay = useContext(CardReplayContext);

    // Fire the explanation-viewed seam exactly once, when the feedback +
    // explanation step first becomes visible for this card. The gate remounts
    // per card (keyed by session+index), so `resolution` transitions null→set
    // a single time per card; the handler is also latched downstream (#76).
    const onExplanationViewed = useContext(ExplanationViewedContext);
    useEffect(() => {
      if (resolution && onExplanationViewed) onExplanationViewed(card);
    }, [resolution, onExplanationViewed, card]);

    // Phase 4: look up this slide's GAME-POINTS by its feed index (the score
    // accumulator records it when the resolution fires). Null when no provider
    // (standalone renders) → the result card omits the chip.
    const scoreLookup = useCardScoreLookup();
    const cardScore = scoreLookup ? scoreLookup(context.cardIndex) : null;

    // Engagement §4.4: the LOCAL per-card personal best — "something to chase".
    // When a scored resolution becomes visible, record its points against this
    // card's stored best ONCE (a ref latch guards re-renders), and surface the
    // outcome so CardFeedback can celebrate a "New best!" or show the prior best.
    // The latch resets when `resolution` returns to null on "Play again", so the
    // NEXT attempt records again. Best-effort, never throws into the feed.
    const [cardBest, setCardBest] = useState<{
      personalBest: number;
      isNewBest: boolean;
    } | null>(null);
    const bestRecordedRef = useRef(false);
    useEffect(() => {
      if (!resolution) {
        bestRecordedRef.current = false;
        setCardBest(null);
        return;
      }
      if (bestRecordedRef.current) return;
      if (cardScore && cardScore.points > 0) {
        bestRecordedRef.current = true;
        const { best, isNewBest } = recordCardBest(card.cardId, cardScore.points);
        setCardBest({ personalBest: best, isNewBest });
      }
    }, [resolution, cardScore, card.cardId]);

    if (resolution) {
      // KNOWN TRADEOFF (tracked: ADO #99). Because we delay the controller's
      // `onResolve` until "Next", the controller still considers this card
      // `resolving_card` during the feedback step — so the session duration
      // timer keeps running while the player reads, and if the window elapses
      // mid-feedback the controller force-completes and this captured answer is
      // dropped (its `onResolve` then no-ops). This is inherent to the feed-
      // layer-only design (controller intentionally untouched, CLAUDE.md §4);
      // a proper fix is controller territory (#58/#59), deliberately not done
      // here. Acceptable for the prototype (feedback steps are short).
      return (
        <CardFeedback
          resolution={resolution}
          explanation={card.explanation}
          cardScore={cardScore}
          personalBest={cardBest?.personalBest}
          isNewBest={cardBest?.isNewBest}
          timeLimitMs={card.config.timeLimitMs}
          // Inject the social Share-to-status action (a feed-layer concern keyed
          // by cardId; renders nothing without a social provider, so the engine
          // stays auth-free). It captures the game + result (outcome + points).
          footer={
            <CardShareButton
              cardId={card.cardId}
              outcome={resolution.resolutionType}
              points={cardScore?.points ?? 0}
            />
          }
          // Advancing is the controller's job: only now do we fire its real
          // `onResolve`, which records the result and auto-advances the feed.
          onContinue={() => onResolve(resolution)}
          // "Play again": record THIS finished attempt as a play (each attempt
          // counts once — here, or via `onContinue`'s `onResolve` for the attempt
          // the player ends on), then remount the same card fresh.
          onReplay={() => {
            recordReplay?.(card, resolution);
            setResolution(null);
            setReplayKey((key) => key + 1);
          }}
        />
      );
    }

    return (
      <Inner
        // Bumped by "Play again" to force a fresh mount of the same card.
        key={replayKey}
        card={card}
        context={context}
        // Forward the feed's ACTIVATION signal verbatim (#137): renderers with a
        // timed PRE-phase (memory_sequence's watch, what_changed's preview) hold
        // until they are the focused slide, so a pre-mounted off-screen card does
        // not run its pre-phase early. Template-agnostic; most renderers ignore it.
        isActive={isActive}
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
