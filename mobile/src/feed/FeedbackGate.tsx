/**
 * Feedback gate — decorates each template renderer with the uniform in-feed
 * FEEDBACK + EXPLANATION step for React Native (ADO #133; Design §8.2; Technical
 * Design §4, §14). Native counterpart of web `src/ui/feedRegistry.tsx`'s
 * `withFeedbackGate`.
 *
 * Why a feed-layer decorator, not per-renderer special-casing (CLAUDE.md §4/§6)
 * ---------------------------------------------------------------------------
 * The native renderers own only card interaction; only ONE of them
 * (`tiny_logic`) used to surface the card's explanation, and only on a WRONG
 * commit — correct answers and the other three templates resolved silently. To
 * make the feedback/explanation step UNIFORM across every template without a
 * `switch` on `templateType`, it must live in the feed layer, shared by all.
 *
 * Rather than teach `FeedScreen` or the controller about a "feedback" status, the
 * pause is inserted through the EXISTING dependency-inversion seam: the renderer
 * registry. {@link createFeedRegistry} wraps every real renderer in a
 * {@link FeedbackGate}. The gate renders the real renderer but hands IT a private
 * `onResolve` that CAPTURES the {@link CardResolution} and replaces the resolved
 * card in-flow with {@link CardFeedback}. `FeedScreen` and its lifecycle stay
 * template-agnostic and untouched.
 *
 * Difference from web: the web controller AUTO-ADVANCES on resolve, so its gate
 * had to DELAY the controller's `onResolve` until a "Next" tap. The native feed
 * never auto-advances — the player swipes to the next game (FEED_DIRECTION §3.2) —
 * so the gate forwards `onResolve` outward IMMEDIATELY (telemetry `Card_Resolved`
 * timing unchanged) and simply keeps the feedback step on screen until the swipe.
 *
 * Skip/abandon semantics (FEED_DIRECTION §3.2): the gate only shows feedback for a
 * resolution on the ACTIVE/focused slide. A SKIPPED card never resolves (no
 * feedback). An ABANDONED card is left before resolving; if its still-armed timer
 * later fires a timeout while the slide is OFF-SCREEN, the gate forwards that
 * resolution (the feed drops it as abandoned) but surfaces NO feedback and fires
 * NO explanation seam — that card was left, not played.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { LiquidCard, TemplateType } from '../core/cards/types';
import type { CardResolution, TemplateProps } from '../core/templates/contract';
import { useCardScoreLookup } from './cardScoreContext';
import { recordCardBest } from './cardBestStore';
import CardShareButton from '../social/CardShareButton';
import CardFeedback from './CardFeedback';
import { defaultRendererRegistry } from './rendererRegistry';
import type { RendererRegistry, TemplateRenderer } from './rendererRegistry';

/**
 * Records ONE replayed attempt as a play when the player taps "Play again" to
 * replay the same card (product decision 2026-06 — each replay counts as a new
 * play). Threaded via context so the gate stays template-agnostic and the feed's
 * per-index resolution latch (which ignores repeat resolutions of one slide) is
 * left untouched: the FIRST attempt records on resolve through the normal latched
 * path; each REPLAY (which that latch would drop) records here instead. Absent a
 * provider (tests/standalone), replay just remounts the card with no recording.
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
 * explanation step until the player swipes on.
 *
 * Typed at the {@link LiquidCard} base: a gate is template-agnostic (it reads only
 * `card.explanation`, shared by every card), so a single generic wrapper serves
 * every slot. {@link createFeedRegistry} re-attaches the precise per-template type
 * via the same localized cast the registry already documents.
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
    onExplanationViewed,
  }: TemplateProps<LiquidCard>) {
    // The captured resolution doubles as the state discriminant: null → the card
    // is in play; set → it resolved. The gate remounts per card (FeedScreen keys
    // each slide by feedId+index), so this transitions null→set once per card.
    const [resolution, setResolution] = useState<CardResolution | null>(null);

    // Forward the resolution OUTWARD immediately (the native feed records it but
    // does not advance, so telemetry timing is unchanged) AND capture it to drive
    // the feedback step. Stable handler so the inner renderer never re-renders on
    // a moved `onResolve` identity.
    // Latch "played WHILE active" at resolve time. We must not recompute feedback
    // visibility from the LIVE `isActive`: once a played card scrolls off-screen
    // (`isActive` → false) that would unmount the feedback and re-mount `Inner`,
    // re-arming its `useCardTimer` — a phantom off-screen timeout then overwrites
    // the captured outcome (correct → timeout) and a stray timer fires per left
    // card. So we capture activeness at the resolve instant: resolved-while-active
    // ⇒ played (feedback persists even after leaving); resolved-while-inactive
    // (an abandoned off-screen timeout) ⇒ not played (no feedback). `isActive`
    // omitted ≡ active, so a standalone render still shows feedback.
    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;
    const [played, setPlayed] = useState(false);

    // "Play again" remounts the SAME card fresh by bumping this counter (it is
    // part of the inner renderer's React key), resetting the renderer's state and
    // re-arming its countdown. Read via a ref inside the stable resolve handler.
    const [replayKey, setReplayKey] = useState(0);
    const replayKeyRef = useRef(0);
    replayKeyRef.current = replayKey;
    const recordReplay = useContext(CardReplayContext);
    const recordReplayRef = useRef(recordReplay);
    recordReplayRef.current = recordReplay;

    const onResolveRef = useRef(onResolve);
    onResolveRef.current = onResolve;
    const handleResolve = useCallback(
      (next: CardResolution) => {
        setResolution(next);
        if (isActiveRef.current !== false) setPlayed(true);
        // First play (replayKey 0) records through the normal latched path. A
        // REPLAY's resolution would be dropped by the feed's per-index latch, so
        // record it here off that path — at resolve time, so it still counts even
        // if the player swipes away instead of tapping "Play again" again.
        if (replayKeyRef.current === 0) {
          onResolveRef.current(next);
        } else {
          recordReplayRef.current?.(card, next);
        }
      },
      [card],
    );

    const showFeedback = resolution !== null && played;

    // Fire the explanation-viewed seam (M5 telemetry `Card_Explanation_Viewed`)
    // exactly once, when the feedback step — and thus the explanation — first
    // becomes visible. Latched in a ref so a re-activation never refires and a
    // moved handler identity cannot double-fire.
    const explanationFiredRef = useRef(false);
    const onExplanationViewedRef = useRef(onExplanationViewed);
    onExplanationViewedRef.current = onExplanationViewed;
    useEffect(() => {
      if (showFeedback && !explanationFiredRef.current) {
        explanationFiredRef.current = true;
        onExplanationViewedRef.current?.();
      }
    }, [showFeedback]);

    // Phase 4: look up this slide's GAME-POINTS by its feed index (the score
    // accumulator records it when the resolution fires). Null when no provider
    // (standalone renders) → the result card omits the chip.
    const scoreLookup = useCardScoreLookup();
    const cardScore = scoreLookup ? scoreLookup(context.cardIndex) : null;

    // Engagement §4.4: the LOCAL per-card personal best — "something to chase".
    // When a scored feedback step becomes visible, record its points against this
    // card's stored best ONCE (a ref latch guards re-renders), and surface the
    // outcome so CardFeedback can celebrate a "New best!" or show the prior best.
    // The latch resets when `resolution` returns to null on "Play again", so the
    // NEXT attempt records again. Best-effort; recordCardBest never rejects.
    const [cardBest, setCardBest] = useState<{
      personalBest: number;
      isNewBest: boolean;
    } | null>(null);
    const bestRecordedRef = useRef(false);
    useEffect(() => {
      if (resolution === null) {
        bestRecordedRef.current = false;
        setCardBest(null);
        return undefined;
      }
      if (!showFeedback || bestRecordedRef.current) return undefined;
      if (cardScore && cardScore.points > 0) {
        bestRecordedRef.current = true;
        let cancelled = false;
        void (async () => {
          const { best, isNewBest } = await recordCardBest(
            card.cardId,
            cardScore.points,
          );
          if (!cancelled) setCardBest({ personalBest: best, isNewBest });
        })();
        return () => {
          cancelled = true;
        };
      }
      return undefined;
    }, [resolution, showFeedback, cardScore, card.cardId]);

    if (showFeedback && resolution) {
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
          // stays auth-free). Captures the game + result (outcome + points).
          footer={
            <CardShareButton
              cardId={card.cardId}
              outcome={resolution.resolutionType}
              points={cardScore?.points ?? 0}
            />
          }
          // "Play again": remount the same card fresh. Recording is done at
          // resolve time (see `handleResolve`), so this only resets the gate.
          onReplay={() => {
            setResolution(null);
            setPlayed(false);
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
        isActive={isActive}
        onAttempt={onAttempt}
        // Capture + forward — but DO NOT show its own explanation; the gate owns
        // the uniform explanation step now.
        onResolve={handleResolve}
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
 * {@link FeedbackGate}. Absent slots stay absent so the feed's missing-renderer
 * fail-safe still applies (a wrapped gate is never registered for a template that
 * had no renderer).
 *
 * The per-key cast mirrors the one sound escape hatch documented in
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
