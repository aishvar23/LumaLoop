/**
 * Feed route container (docs/FEED_DIRECTION.md §2 / §3.6 / §6; Azure DevOps #107,
 * #108).
 *
 * The endless swipe feed is the DEFAULT app surface: `/` mounts this thin wrapper,
 * which renders the {@link FeedScreen} with the one-time first-run data notice
 * layered over it (§3.6). #108 makes this container the FEED TELEMETRY entry
 * point: it instantiates ONE telemetry client + the {@link useFeedTelemetry} hook
 * for the feed's lifetime and wires the feed's #106 seam callbacks (and the
 * explanation-viewed gate) to it, so `/` actually POSTs the §6 feed events.
 *
 * Separation of concerns (CLAUDE.md §4): routing/wiring stays out of progression.
 * {@link FeedScreen} + {@link useFeedController} own the deck and active card; the
 * controller stays telemetry-free — instrumentation lives here, fed only by the
 * feed's callbacks (mirroring the retired `SessionRoute` wiring). The notice owns
 * only its own dismissal state.
 *
 * One id per visit: this container generates the per-mount `feedId` and passes it
 * to BOTH the feed (per-card `context.sessionId`) and telemetry (the `sessionId`
 * envelope), so every event and start-context agree on a single feed-instance id.
 *
 * Test seams: every external dependency (telemetry client, anonymous id, source,
 * clock, feed id, deck source, renderer registry, card lookup) is an optional
 * prop with a production default, so tests inject a FAKE telemetry client and a
 * deterministic feed and assert events with NO real network/storage. Real router
 * usage passes none of them.
 */
import { useEffect, useRef, useState } from 'react';

import { getCardById as defaultGetCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import type { RendererRegistry } from '../session/rendererRegistry';
import { getAnonymousUserId } from '../telemetry/anonymousUser';
import { parseTelemetrySource } from '../telemetry/feedTelemetry';
import {
  createTelemetryClient,
  type TelemetryClient,
} from '../telemetry/telemetryClient';
import type { TelemetrySource } from '../telemetry/telemetryEvents';
import { useFeedTelemetry } from '../telemetry/useFeedTelemetry';
import { ExplanationViewedProvider } from '../ui/feedRegistry';
import { SocialConfigProvider } from '../social/SocialContext';
import { useOptionalAuth } from '../auth/AuthProvider';
import { supabase } from '../auth/supabaseClient';
import type { AuthClient } from '../auth/authClient';
import { ROUTES } from '../app/routes';
import type { FeedBatchSource } from './feedDeck';
import FeedScreen from './FeedScreen';
import FirstRunNotice from './FirstRunNotice';
import { useRecordGamePlay } from './useRecordGamePlay';
import { usePlayedCardIds } from './usePlayedCardIds';

export interface FeedRouteProps {
  /** Test seam: telemetry client. Defaults to the real `/api/event` client. */
  telemetryClient?: TelemetryClient;
  /** Test seam: fixed anonymous id. Defaults to the persisted id (§10). */
  anonymousUserId?: string;
  /** Test seam: attribution source. Defaults to parsing `?source=` from the URL. */
  source?: TelemetrySource;
  /** Test seam: wall clock for telemetry + the feed start context. Defaults to `Date.now`. */
  now?: () => number;
  /** Test seam: the feed instance id. Defaults to a fresh per-mount UUID. */
  feedId?: string;
  /** Test seam: deterministic feed batch source. Defaults to seeded catalog. */
  feedSource?: FeedBatchSource;
  /** Test seam: renderer registry. Defaults to the shipped feed registry. */
  registry?: RendererRegistry;
  /**
   * Test seam: cardId → card resolver, shared by the feed AND telemetry so both
   * read the same card. Defaults to the authored catalog.
   */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /**
   * Test seam: the Supabase client used for the D2 already-played read and the
   * `game_plays` write. Defaults to the auth provider's client (the injected fake
   * in tests), falling back to the real browser client when mounted standalone.
   */
  authClient?: AuthClient;
}

/** Best-effort read of the current URL query string. Never throws (SSR/tests). */
function currentSearch(): string {
  try {
    return globalThis.location?.search ?? '';
  } catch {
    return '';
  }
}

export default function FeedRoute({
  telemetryClient,
  anonymousUserId,
  source,
  now,
  feedId: feedIdProp,
  feedSource,
  registry,
  getCardById = defaultGetCardById,
  authClient,
}: FeedRouteProps = {}) {
  // Resolve identity + attribution ONCE per mount (Technical Design §10): the
  // persisted anon id, the parsed `?source=` (headline return uses 'direct'),
  // and a single feed-instance id shared with the feed below.
  const [resolvedAnonymousUserId] = useState(
    () => anonymousUserId ?? getAnonymousUserId(),
  );
  const [resolvedSource] = useState<TelemetrySource>(
    () => source ?? parseTelemetrySource(currentSearch()),
  );
  const [feedId] = useState(
    () =>
      feedIdProp ??
      globalThis.crypto?.randomUUID?.() ??
      `feed-${resolvedAnonymousUserId}`,
  );

  // One telemetry client for the feed's lifetime (real `/api/event` client by
  // default; a fake is injected in tests). The client embeds no secret (§16).
  const clientRef = useRef<TelemetryClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = telemetryClient ?? createTelemetryClient();
  }

  const telemetry = useFeedTelemetry({
    client: clientRef.current,
    feedId,
    getAnonymousUserId: () => resolvedAnonymousUserId,
    now,
    routeKind: 'session',
    source: resolvedSource,
    getCardById,
  });

  // The feed was opened (Session_Initialized + the headline Return_Session_Started
  // on the first visit). `feedOpened` is idempotent, so this is exactly-once.
  const { observeFeedOpened } = telemetry;
  useEffect(() => {
    observeFeedOpened();
  }, [observeFeedOpened]);

  // Accounts pivot: record each resolved card as a `game_plays` row for the
  // signed-in user, best-effort, off the SAME resolution path Phase-4 scoring
  // uses (FeedScreen's `onCardScored` seam). Anonymous telemetry above is
  // untouched. `RequireAuth` gates `/`, so in production there is always a user;
  // the recorder no-ops when there isn't (e.g. a directly-mounted test feed).
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  // Use the SAME client the provider authenticated against (the fake in tests),
  // overridable via the `authClient` prop, falling back to the real client when
  // the feed is mounted standalone (no provider).
  const effectiveClient = authClient ?? auth?.client ?? supabase;
  const recordGamePlay = useRecordGamePlay({
    userId,
    getCardById,
    client: effectiveClient,
  });

  // D2: best-effort fetch of the signed-in user's already-played games so the
  // feed skips them. The controller captures the exclusion set ONCE at mount, so
  // we wait for `ready` before mounting the feed — that way even the first batch
  // skips played cards. `ready` flips true on success OR error (empty set), so a
  // failed/slow fetch never blocks gameplay; an explicit `feedSource` (tests)
  // bypasses the exclusion entirely. Re-runs (and remounts the feed) on user
  // change so a fresh sign-in re-reads the played set.
  const played = usePlayedCardIds(effectiveClient, userId);

  return (
    <>
      {/* Minimal feed chrome to escape the immersive feed back to Home / the
          profile (the feed itself owns no routing). Plain anchors (not react-
          router Links) so the feed can mount standalone in tests without a Router
          context; in the real app under BrowserRouter they navigate normally. */}
      <FeedNav />
      {/* The gate fires Card_Explanation_Viewed through this seam (no telemetry
          coupling inside the gate/renderer — CLAUDE.md §4/§6). */}
      <ExplanationViewedProvider handler={telemetry.onExplanationViewed}>
        {/* Supply the per-card social surface (likes + comments) with the SAME
            client the provider authenticated against + the signed-in user id.
            Feed-layer concern keyed by cardId — the feed/engine stays auth-free
            (the rail reads this context; no provider → it renders nothing). */}
        <SocialConfigProvider value={{ client: effectiveClient, userId }}>
          {played.ready && (
            <FeedScreen
            key={userId ?? 'anon'}
            registry={registry}
            source={feedSource}
            excludeCardIds={played.cardIds}
            anonymousUserId={resolvedAnonymousUserId}
            getCardById={getCardById}
            now={now}
            feedId={feedId}
            onCardActive={telemetry.onCardActive}
            onCardEngaged={telemetry.onCardEngaged}
            onCardSkipped={telemetry.onCardSkipped}
            onCardAbandoned={telemetry.onCardAbandoned}
            onCardResolved={telemetry.onCardResolved}
            onCardScored={recordGamePlay}
          />
          )}
        </SocialConfigProvider>
      </ExplanationViewedProvider>
      <FirstRunNotice />
    </>
  );
}

/**
 * Tiny overlay nav so the immersive feed isn't a dead-end: a link back to Home
 * (`/`) and to the profile (`/you`). Plain anchors keep the feed mountable with
 * no Router in tests; the `.feed-nav` styles ship with `FeedScreen.css` (always
 * loaded while the feed is on screen).
 */
function FeedNav() {
  return (
    <nav className="feed-nav" aria-label="Feed navigation">
      <a className="feed-nav__link" href={ROUTES.home} aria-label="Back to home">
        ⌂ Home
      </a>
      <a className="feed-nav__link" href={ROUTES.profile} aria-label="Open your profile">
        You
      </a>
    </nav>
  );
}
