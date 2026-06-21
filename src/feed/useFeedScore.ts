/**
 * Feed score accumulator hook (Phase 4 — GAME POINTS).
 *
 * Accumulates the game-points {@link ScoreState} across the endless feed by
 * observing the EXISTING resolution seam — it returns an `onCardResolved` handler
 * the feed wires to its `onCardResolved` callback, reusing the one path the feed
 * already uses to observe resolutions (no parallel observation). For each resolved
 * card it folds the resolution through the pure {@link applyResolution} core and
 * records the per-card {@link CardScore} delta keyed by feed index, so the result
 * card for that slide can show what the card earned.
 *
 * GUARDRAIL (Design §7/§21.8): GAME POINTS only — "points", "streak", "best run",
 * "combo". No skill/ability/IQ/trait framing.
 *
 * State lives in React state (drives the HUD) PLUS a ref (so the resolution
 * handler stays stable and folds synchronously without depending on render
 * timing). The per-card map is also a ref + a `version` counter that bumps on
 * each resolution, so a result card that mounts after its resolution still sees
 * the value (the gate captures the resolution, then renders the result card).
 *
 * The card's `timeLimitMs` for speed weighting comes from the catalog via the
 * injected `getCardById` — the same lookup the feed already uses. This stays
 * template-agnostic: `timeLimitMs` is the universal timing field on every card
 * config, never a per-template branch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import {
  applyResolution,
  INITIAL_SCORE_STATE,
  type CardScore,
  type ScoreState,
} from './scoring';
import { createScoreStore, type ScoreStore } from './scoreStore';

export interface UseFeedScoreOptions {
  /** cardId → card, for the card's `timeLimitMs`. Defaults to nothing (caller wires). */
  getCardById: (cardId: string) => LiquidCard | undefined;
  /**
   * Persistence store for the all-time best run + cumulative total. Defaults to
   * the real best-effort `localStorage` store; tests inject a fake. Pass `null`
   * to disable persistence entirely.
   */
  store?: ScoreStore | null;
}

export interface FeedScore {
  /** The running per-visit score state (drives the HUD). */
  state: ScoreState;
  /** All-time best run (max of persisted best run and this visit's best streak). */
  bestRun: number;
  /** Fold a resolution into the score — wire to the feed's `onCardResolved`. */
  onCardResolved: (index: number, resolution: CardResolution) => void;
  /** The per-card score for a given feed index, or null if it has not resolved. */
  getCardScore: (index: number) => CardScore | null;
  /**
   * Bumps once per resolution. A result card can depend on it so it re-reads
   * {@link getCardScore} after the resolution it was mounted for is recorded.
   */
  version: number;
}

/** Resolve the default persistence store unless the caller opts out / injects one. */
function resolveStore(store: ScoreStore | null | undefined): ScoreStore | null {
  if (store === null) return null;
  return store ?? createScoreStore();
}

export function useFeedScore(options: UseFeedScoreOptions): FeedScore {
  const { getCardById } = options;

  // The store is fixed for the hook's lifetime (default resolved once).
  const storeRef = useRef<ScoreStore | null>(null);
  if (storeRef.current === null && options.store !== null) {
    storeRef.current = resolveStore(options.store);
  }

  const [state, setState] = useState<ScoreState>(INITIAL_SCORE_STATE);
  const stateRef = useRef<ScoreState>(INITIAL_SCORE_STATE);
  const persistedBestRunRef = useRef<number>(
    storeRef.current?.read().bestRun ?? 0,
  );
  const [bestRun, setBestRun] = useState<number>(persistedBestRunRef.current);

  // Per-card score keyed by feed index; a version counter signals updates so a
  // result card mounted after its resolution still re-reads it.
  const cardScoresRef = useRef<Map<number, CardScore>>(new Map());
  const [version, setVersion] = useState(0);

  // Latch resolutions per index so a slide that re-resolves (the feed's known
  // phantom-timeout case) never double-counts a card's points/streak.
  const scoredIndicesRef = useRef<Set<number>>(new Set());

  // Keep a stable handle to the card lookup for the stable resolution handler.
  const getCardByIdRef = useRef(getCardById);
  getCardByIdRef.current = getCardById;

  const onCardResolved = useCallback(
    (index: number, resolution: CardResolution) => {
      if (scoredIndicesRef.current.has(index)) return; // already scored once.
      scoredIndicesRef.current.add(index);

      const card = getCardByIdRef.current(resolution.cardId);
      const timeLimitMs = card?.config.timeLimitMs ?? Number.POSITIVE_INFINITY;

      const { state: next, cardScore } = applyResolution(
        stateRef.current,
        resolution,
        timeLimitMs,
      );
      stateRef.current = next;
      cardScoresRef.current.set(index, cardScore);

      setState(next);
      setVersion((v) => v + 1);

      // Best run = max of the persisted best and this visit's best streak.
      const visitBest = Math.max(persistedBestRunRef.current, next.bestStreak);
      if (visitBest !== bestRunStateRef.current) {
        bestRunStateRef.current = visitBest;
        setBestRun(visitBest);
      }
    },
    [],
  );

  // Mirror `bestRun` into a ref so the stable handler can compare without deps.
  const bestRunStateRef = useRef<number>(bestRun);
  bestRunStateRef.current = bestRun;

  const getCardScore = useCallback(
    (index: number): CardScore | null =>
      cardScoresRef.current.get(index) ?? null,
    [],
  );

  // On unmount (the feed visit ended), persist this visit's best run + points
  // into the all-time store. Best-effort and idempotent enough for the prototype:
  // a remount starts a fresh visit. Reads the latest via refs.
  const storeOnUnmount = storeRef.current;
  useEffect(() => {
    if (!storeOnUnmount) return undefined;
    return () => {
      const final = stateRef.current;
      storeOnUnmount.record(final.bestStreak, final.totalPoints);
    };
  }, [storeOnUnmount]);

  return { state, bestRun, onCardResolved, getCardScore, version };
}
