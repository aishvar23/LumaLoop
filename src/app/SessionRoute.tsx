/**
 * Session-route container (Azure DevOps #69/#70, Technical Design §12 / §14).
 *
 * Owns the start→session PHASE state for the `/` route. App and the router stay
 * routing-only (CLAUDE.md §4): routing selects which element renders, but the
 * decision of *which phase of the session surface* to show lives here, not in
 * the route table. This keeps session progression out of routing while giving
 * `/` a single mount point.
 *
 * Phases:
 *   - "start"        → the real {@link StartScreen}; choosing a mode advances.
 *   - "in_progress"  → the real, playable feed ({@link FeedSession}).
 *
 * The feed is mounted via {@link FeedSession}, a child component so the session
 * controller hook is called unconditionally (hooks rules) while the route still
 * switches phases. Cards play in-feed: no loading screen, no nested modal
 * (Technical Design §14).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { catalog } from '../cards/catalog';
import type { ChallengeCategory } from '../cards/types';
import { composeSession } from '../session/composeSession';
import { computeSessionSummary } from '../session/sessionSummary';
import type { SessionCardInput } from '../session/useSessionController';
import { useSessionController } from '../session/useSessionController';
import type { RendererRegistry } from '../session/rendererRegistry';
import { type SessionMode } from '../session/sessionTypes';
import FeedFrame from '../ui/FeedFrame';
import { feedRegistry } from '../ui/feedRegistry';
import SessionReceipt from '../ui/SessionReceipt';
import StartScreen from '../ui/StartScreen';

type Phase =
  | { name: 'start' }
  | { name: 'in_progress'; mode: SessionMode };

/**
 * PLACEHOLDER anonymous user id — the SEAM for Azure DevOps #74 (the real
 * anonymous-user identity is NOT built yet). `composeSession` is deterministic
 * per `(anonymousUserId, day, mode)`, so a stable local constant keeps the
 * prototype's composition stable and reproducible until #74 supplies the real
 * id. Do NOT treat this as a user identifier or persist it anywhere.
 */
const PLACEHOLDER_ANONYMOUS_USER_ID = 'anon-local-dev';

export default function SessionRoute() {
  const [phase, setPhase] = useState<Phase>({ name: 'start' });

  if (phase.name === 'start') {
    return (
      <StartScreen
        onStart={(mode) => setPhase({ name: 'in_progress', mode })}
      />
    );
  }

  return <FeedSession mode={phase.mode} />;
}

export type FeedSessionProps = {
  /** The chosen session length. */
  mode: SessionMode;
  /**
   * Test seams (default to the real feed registry / composition / clock). Real
   * usage passes none — `SessionRoute` mounts `<FeedSession mode=… />`.
   */
  registry?: RendererRegistry;
  now?: () => number;
  anonymousUserId?: string;
  day?: string;
  /**
   * Explicit cards to play, bypassing seeded composition. Lets a focused test
   * drive a deterministic deck (typed cards or cardIds); production composes
   * from the catalog.
   */
  cards?: ReadonlyArray<SessionCardInput>;
};

/**
 * Mounts the real session controller + playable feed for one `mode`. Kept
 * separate from {@link SessionRoute} so the controller hook runs
 * unconditionally regardless of the route's phase (hooks rules).
 */
export function FeedSession({
  mode,
  registry = feedRegistry,
  now,
  anonymousUserId = PLACEHOLDER_ANONYMOUS_USER_ID,
  day,
  cards,
}: FeedSessionProps) {
  const controller = useSessionController({ registry, now });

  // Compose the session deterministically (or use the injected deck). Stable per
  // (mode, user, day) so the effect below arms the session exactly once.
  const deck = useMemo<ReadonlyArray<SessionCardInput>>(
    () => cards ?? composeSession({ mode, anonymousUserId, day }),
    [cards, mode, anonymousUserId, day],
  );

  // cardId -> performance category for the receipt's category mix. Cards passed
  // by value carry their own `category`; cardId-only decks (production
  // composition) resolve against the authored catalog. Kept as an injected
  // lookup so `computeSessionSummary` stays pure (it never imports the catalog).
  const cardCategoryById = useMemo<ReadonlyMap<string, ChallengeCategory>>(() => {
    const map = new Map<string, ChallengeCategory>();
    for (const card of catalog) {
      map.set(card.cardId, card.category);
    }
    for (const card of deck) {
      if (typeof card !== 'string') {
        map.set(card.cardId, card.category);
      }
    }
    return map;
  }, [deck]);
  const categoryOf = useCallback(
    (cardId: string): ChallengeCategory | undefined =>
      cardCategoryById.get(cardId),
    [cardCategoryById],
  );

  // Arm the session once on mount. `start` is a reducer no-op unless idle, so a
  // re-render can't restart a live session; the ref guards against a duplicate
  // arm within the same idle window.
  const armedRef = useRef(false);
  const { start } = controller;
  useEffect(() => {
    if (armedRef.current) return;
    armedRef.current = true;
    start(mode, deck);
  }, [start, mode, deck]);

  // The session is over: render the real receipt (#71). The summary is computed
  // by the pure `computeSessionSummary` (#62) — the UI never recomputes stats.
  // At this seam the terminal status is `completed`, so the session reached its
  // bounded end and `completedOnTime` is `true` (the pure fn derives the exit
  // badge from it). #72 will add the exit/continue controls AROUND this receipt
  // and supply `completedOnTime: false` on the `exited` path.
  if (controller.status === 'completed') {
    const summary = computeSessionSummary({
      sessionId: controller.state.sessionId,
      mode,
      resolutions: controller.results,
      categoryOf,
      completedOnTime: true,
    });
    return <SessionReceipt summary={summary} />;
  }

  return (
    <FeedFrame
      activeCardElement={controller.activeCardElement}
      index={controller.index}
      total={controller.total}
    />
  );
}
