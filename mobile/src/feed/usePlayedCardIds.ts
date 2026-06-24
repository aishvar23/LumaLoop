/**
 * React hook wiring the already-played set (D2) into the feed — mobile port of
 * web `src/feed/usePlayedCardIds.ts`.
 *
 * Fetches the signed-in user's already-played `card_id`s (best-effort, via
 * {@link fetchPlayedCardIds}) and exposes them plus a `ready` flag. The feed
 * controller captures the exclusion set ONCE at mount (so it never re-seeds an
 * in-flight deck), so the wiring layer waits for `ready` before mounting the
 * feed — that way the very first batch already skips played games.
 *
 * BEST-EFFORT (task constraint): this never blocks gameplay. On a signed-out
 * user, an error, or a slow/failed fetch, it resolves to an EMPTY set and still
 * flips `ready` true, so the feed mounts and simply skips nothing (the composer's
 * exhaustion fallback keeps it endless regardless). Re-runs when the user
 * changes (sign-in / sign-out / account switch).
 */
import { useEffect, useState } from 'react';

import type { AuthClient } from '../auth/authClient';
import { fetchPlayedCardIds } from './playedCardsApi';

export interface PlayedCardIdsState {
  /** The user's already-played cardIds; empty when signed out / on error. */
  cardIds: ReadonlySet<string>;
  /** True once the fetch has settled (success OR error) for the current user. */
  ready: boolean;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Resolve the already-played exclusion set for `userId` (null when signed out).
 * `client` is the Supabase client (injected in tests).
 */
export function usePlayedCardIds(
  client: AuthClient,
  userId: string | null,
): PlayedCardIdsState {
  // Signed out: nothing to fetch → ready immediately with an empty set, so the
  // feed mounts synchronously (no async gate, no flicker) and skips nothing.
  const [state, setState] = useState<PlayedCardIdsState>(() => ({
    cardIds: EMPTY_SET,
    ready: userId === null,
  }));

  useEffect(() => {
    if (userId === null) {
      // No user → there is nothing to read; settle synchronously.
      setState({ cardIds: EMPTY_SET, ready: true });
      return;
    }
    let active = true;
    // Reset to "not ready" so a sign-out → sign-in re-gates the feed mount and
    // the very first batch is composed from the freshly-read played set.
    setState({ cardIds: EMPTY_SET, ready: false });
    void (async () => {
      const { cardIds } = await fetchPlayedCardIds(client, userId);
      if (!active) return;
      setState({ cardIds, ready: true });
    })();
    return () => {
      active = false;
    };
  }, [client, userId]);

  return state;
}
