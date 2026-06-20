/**
 * Session-route container (Azure DevOps #69/#70/#72, Technical Design §12 / §14).
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
import { getAnonymousUserId } from '../telemetry/anonymousUser';
import {
  createTelemetryClient,
  type TelemetryClient,
} from '../telemetry/telemetryClient';
import { parseTelemetrySource } from '../telemetry/sessionTelemetry';
import type { TelemetrySource } from '../telemetry/telemetryEvents';
import { useSessionTelemetry } from '../telemetry/useSessionTelemetry';
import { continueSeedUserId } from './continueSeed';
import { computeSessionSummary } from '../session/sessionSummary';
import type { SessionCardInput } from '../session/useSessionController';
import { useSessionController } from '../session/useSessionController';
import type { RendererRegistry } from '../session/rendererRegistry';
import { type SessionMode } from '../session/sessionTypes';
import Button from '../ui/Button';
import ExitControl from '../ui/ExitControl';
import FeedFrame from '../ui/FeedFrame';
import { ExplanationViewedProvider, feedRegistry } from '../ui/feedRegistry';
import SessionReceipt from '../ui/SessionReceipt';
import StartScreen from '../ui/StartScreen';

/** Read `window.location.search` defensively (SSR/test-safe). Never throws. */
function safeLocationSearch(): string {
  try {
    return globalThis.location?.search ?? '';
  } catch {
    return '';
  }
}

/**
 * Best-effort native share of the just-finished session (#76). Non-throwing: a
 * missing `navigator.share`, a user cancel, or any failure degrades silently —
 * the `Receipt_Shared` telemetry has already fired on the tap. Copy stays within
 * the positioning guardrails (Design §7): a session record, never an ability
 * claim.
 */
function shareSessionReceipt(): void {
  try {
    const nav = globalThis.navigator;
    if (nav && typeof nav.share === 'function') {
      void nav
        .share({
          title: 'LumaLoop',
          text: 'I just finished a LumaLoop session.',
          url: globalThis.location?.href ?? '',
        })
        .catch(() => {
          // User cancelled or share unavailable — best-effort.
        });
    }
  } catch {
    // Best-effort: never let sharing throw into the receipt.
  }
}

type Phase =
  | { name: 'start' }
  | { name: 'in_progress'; mode: SessionMode };

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
  /**
   * Test seam: inject a fixed anonymous id for deterministic composition. When
   * omitted (real usage), the default resolves to the real persisted anonymous
   * id from {@link getAnonymousUserId} (Technical Design §10).
   */
  anonymousUserId?: string;
  day?: string;
  /**
   * Explicit cards to play, bypassing seeded composition. Lets a focused test
   * drive a deterministic deck (typed cards or cardIds); production composes
   * from the catalog.
   */
  cards?: ReadonlyArray<SessionCardInput>;
  /**
   * Test seam: inject a FAKE telemetry client so a test can assert the exact
   * §10 events fired with NO real network/transport. Real usage passes none —
   * one {@link createTelemetryClient} instance is created once per mount.
   */
  telemetryClient?: TelemetryClient;
  /**
   * Test seam: pin the §10 attribution `source`. Defaults to the parsed
   * `?source=` query param (→ `'direct'` when absent/invalid).
   */
  source?: TelemetrySource;
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
  anonymousUserId,
  day,
  cards,
  telemetryClient,
  source,
}: FeedSessionProps) {
  // Resolve the real persisted anonymous id ONCE per mount (Technical Design
  // §10): a best-effort localStorage identity, generated once. Tests still
  // inject a fixed `anonymousUserId` to keep composition deterministic — only
  // the DEFAULT changed, from a constant string to the real persisted id. The
  // `useState` initializer runs the (best-effort, non-throwing) storage read a
  // single time, never on every render, so the composed deck stays stable
  // across renders and the arm-once effect below is not disturbed.
  const [persistedAnonymousUserId] = useState(getAnonymousUserId);
  const resolvedAnonymousUserId = anonymousUserId ?? persistedAnonymousUserId;

  // ONE telemetry client per FeedSession mount (#76). Tests inject a FAKE
  // client; real usage lazily creates a single real client whose once-latches
  // and retry queue live for the session's lifetime. The `useState` initializer
  // builds it exactly once, never per render.
  const [client] = useState<TelemetryClient>(
    () => telemetryClient ?? createTelemetryClient({}),
  );

  // The §10 instrumentation handle (#76): turns the controller's card/session
  // lifecycle callbacks + the UI actions into the eleven events,
  // TEMPLATE-AGNOSTICALLY. `source`/`routeKind` are captured once at mount; the
  // anon id and `now` reuse the existing seams.
  const telemetry = useSessionTelemetry({
    client,
    getAnonymousUserId: () => resolvedAnonymousUserId,
    now,
    routeKind: 'session',
    source: source ?? parseTelemetrySource(safeLocationSearch()),
  });

  // The controller OWNS progression; the telemetry handle merely SUBSCRIBES to
  // its lifecycle callbacks (the controller imports no telemetry — CLAUDE.md §4).
  const controller = useSessionController({
    registry,
    now,
    onAttempt: telemetry.onAttempt,
    onCardResolved: telemetry.onCardResolved,
    onSessionCompleted: telemetry.onSessionCompleted,
  });

  // How many times the user has chosen to keep playing after completion (#72).
  // Bumped on each intentional continue; folded into the composition seed below
  // so a continued loop is not a verbatim replay of the one just finished.
  const [continueCount, setContinueCount] = useState(0);

  // Compose the session deterministically (or use the injected deck). Stable per
  // (mode, user, day, continueCount) so the arm effect below fires exactly once
  // per armable window.
  //
  // CONTINUE-DECK DECISION (#72): `composeSession` is deterministic per
  // (mode, user, day), so a naive recompose after an intentional continue would
  // replay the IDENTICAL cards. We must not modify `composeSession`, and it
  // exposes no dedicated "continue" seed input — so we vary the seed locally by
  // suffixing the user dimension with the continue counter (the suffix never
  // leaves composition; it is NOT a user identity and is never persisted). Each
  // continue therefore reshuffles the eligible pool deterministically. On the
  // small prototype catalog this re-orders the same pool rather than producing
  // wholly new content, which is acceptable and intended for the prototype. The
  // first session (continueCount === 0) keeps the plain seed, preserving the
  // documented "deterministic per (user, day, mode)" contract.
  const deck = useMemo<ReadonlyArray<SessionCardInput>>(() => {
    if (cards) return cards;
    const seedUserId = continueSeedUserId(resolvedAnonymousUserId, continueCount);
    return composeSession({ mode, anonymousUserId: seedUserId, day });
  }, [cards, mode, resolvedAnonymousUserId, day, continueCount]);

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

  // Arm the session at each armable seam: on mount (`idle`) and after an
  // intentional continue (`intentional_continue`). `start` is a reducer no-op
  // from any other status, so a re-render can never restart a LIVE session; the
  // ref additionally arms each window exactly once. We key the guard on
  // `continueCount` — the value that uniquely identifies an armable window
  // (0 = first/idle, N = the Nth continue) — so the idle→active and
  // intentional_continue→active transitions each arm once with their own deck.
  // Session_Initialized (#76, §10): fire once the session id is known. The
  // factory latches per sessionId, so each armed window (including every
  // intentional continue, which mints a fresh id) emits exactly one
  // Session_Initialized; Return_Session_Started fires only for the first window.
  const sessionId = controller.state.sessionId;
  const { observeSession, observeActiveCard } = telemetry;
  useEffect(() => {
    observeSession(sessionId);
  }, [sessionId, observeSession]);

  // Card_Rendered (#76, §10): fire when a card becomes the ACTIVE card — NOT on
  // mount, NOT on unrelated re-renders. Keyed on the active card identity +
  // index so a re-render during the feedback step does not re-fire while
  // advancing to the next card does; the factory additionally latches per
  // (sessionId:cardIndex). `observeActiveCard` no-ops on a null card (the gap
  // between cards). Template-agnostic — no switch on templateType.
  const activeCard = controller.currentCard;
  const activeCardIndex = controller.index;
  useEffect(() => {
    observeActiveCard(activeCard, activeCardIndex, sessionId);
  }, [activeCard, activeCardIndex, sessionId, observeActiveCard]);

  const armedForRef = useRef<number | null>(null);
  const { start, status } = controller;
  useEffect(() => {
    if (status !== 'idle' && status !== 'intentional_continue') return;
    if (armedForRef.current === continueCount) return;
    armedForRef.current = continueCount;
    start(mode, deck);
  }, [status, continueCount, start, mode, deck]);

  // Begin a fresh loop after completion — only on an explicit tap (Tech §14:
  // "Continue after completion requires an intentional tap"). Bumping
  // `continueCount` recomposes the deck and re-opens the arm window above; the
  // controller's `continueSession` moves `completed → intentional_continue`
  // (the only status `start` will then re-arm from).
  const { continueSession } = controller;
  const handleContinue = useCallback(() => {
    // Intentional_Continue_Clicked (#76): fire on the tap, THEN re-arm. The
    // event carries the just-completed session's context (continue mints a new
    // id on the next arm).
    telemetry.continueClicked();
    continueSession();
    setContinueCount((count) => count + 1);
  }, [telemetry, continueSession]);

  // Exit_Clicked (#76): emit on the deliberate confirm, THEN end the session, so
  // the event carries the still-live session context.
  const { exitSession } = controller;
  const handleExit = useCallback(() => {
    telemetry.exitClicked();
    exitSession();
  }, [telemetry, exitSession]);

  // Receipt_Shared (#76): fire on the tap, then best-effort native share. The
  // event fires regardless of whether the platform share succeeds.
  const handleShare = useCallback(() => {
    telemetry.receiptShared();
    shareSessionReceipt();
  }, [telemetry]);

  // The session reached its bounded end: render the real receipt (#71) WITH the
  // intentional-continue control (#72). The summary is computed by the pure
  // `computeSessionSummary` (#62) — the UI never recomputes stats. The terminal
  // status here is `completed`, so the session ended on time and
  // `completedOnTime` is `true`: the pure fn earns the on-time exit badge from
  // it. Continuing is allowed but never automatic (Design §8.3 / Tech §14) — it
  // is a single, clearly-labelled tap that re-arms a fresh loop.
  if (controller.status === 'completed') {
    const summary = computeSessionSummary({
      sessionId: controller.state.sessionId,
      mode,
      resolutions: controller.results,
      categoryOf,
      completedOnTime: true,
    });
    return (
      <SessionReceipt
        summary={summary}
        outcome="completed"
        onShare={handleShare}
        footer={
          <Button
            variant="ghost"
            data-testid="continue-control"
            style={{ width: '100%' }}
            onClick={handleContinue}
          >
            Keep going
          </Button>
        }
      />
    );
  }

  // The user left early: render the SAME receipt with `completedOnTime: false`
  // (so `earnedExitBadge` is false — no on-time badge for an early leave) and
  // the early-exit framing (modest, not punitive). No continue control: the
  // user chose to stop. `exited` is terminal, so the loop ends here (#72).
  if (controller.status === 'exited') {
    const summary = computeSessionSummary({
      sessionId: controller.state.sessionId,
      mode,
      resolutions: controller.results,
      categoryOf,
      completedOnTime: false,
    });
    return (
      <SessionReceipt summary={summary} outcome="exited" onShare={handleShare} />
    );
  }

  // Active feed: the card plays in-flow with a clear exit path beneath it (#72).
  // There is NO skip affordance anywhere (Tech §14) — leaving ends the session,
  // it never advances past a card.
  return (
    <ExplanationViewedProvider handler={telemetry.onExplanationViewed}>
      <FeedFrame
        activeCardElement={controller.activeCardElement}
        index={controller.index}
        total={controller.total}
        exitSlot={<ExitControl onExit={handleExit} />}
      />
    </ExplanationViewedProvider>
  );
}
