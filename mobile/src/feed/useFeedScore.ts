/**
 * Feed score accumulator hook for React Native (Phase 4 — GAME POINTS). The RN
 * counterpart of web `src/feed/useFeedScore.ts`: it folds each resolution through
 * the SHARED pure {@link applyResolution} core (ported in
 * `core/feed/scoring.ts`), drives the HUD, and records the per-card score the
 * result card reads. It hooks the SAME resolution path the feed already uses (its
 * `onCardResolved`), not a parallel observer.
 *
 * Difference from web: persistence is ASYNC (AsyncStorage). The persisted best run
 * is read once on mount (async) and merged into `bestRun`; the visit's best run +
 * total are recorded on unmount (best-effort, fire-and-forget).
 *
 * GUARDRAIL (Design §7/§21.8): GAME POINTS only — "points", "streak", "best run",
 * "combo". No skill/ability/IQ/trait framing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import {
  applyResolution,
  INITIAL_SCORE_STATE,
  type CardScore,
  type ScoreState,
} from '../core/feed/scoring';
import { createScoreStore, type ScoreStore } from './scoreStore';

export interface UseFeedScoreOptions {
  /** cardId → card, for the card's `timeLimitMs`. */
  getCardById: (cardId: string) => LiquidCard | undefined;
  /**
   * Persistence store. Defaults to the real best-effort AsyncStorage store; tests
   * inject a fake. Pass `null` to disable persistence entirely.
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
  /** Bumps once per resolution so a late-mounted result card re-reads its score. */
  version: number;
}

export function useFeedScore(options: UseFeedScoreOptions): FeedScore {
  const { getCardById } = options;

  // The store is fixed for the hook's lifetime (default resolved once).
  const storeRef = useRef<ScoreStore | null | undefined>(undefined);
  if (storeRef.current === undefined) {
    storeRef.current = options.store === null ? null : options.store ?? createScoreStore();
  }

  const [state, setState] = useState<ScoreState>(INITIAL_SCORE_STATE);
  const stateRef = useRef<ScoreState>(INITIAL_SCORE_STATE);
  const persistedBestRunRef = useRef<number>(0);
  const [bestRun, setBestRun] = useState<number>(0);
  const bestRunStateRef = useRef<number>(0);
  bestRunStateRef.current = bestRun;

  const cardScoresRef = useRef<Map<number, CardScore>>(new Map());
  const [version, setVersion] = useState(0);
  const scoredIndicesRef = useRef<Set<number>>(new Set());

  const getCardByIdRef = useRef(getCardById);
  getCardByIdRef.current = getCardById;

  // Read the persisted best run once (async) and lift `bestRun` to it if it is
  // higher than this visit's best so far. The live per-visit best is already
  // tracked by `onCardResolved`; this only contributes the PERSISTED history, so
  // it sets state at most once and only when the stored best actually leads.
  useEffect(() => {
    let active = true;
    const store = storeRef.current;
    if (!store) return undefined;
    void store.read().then((snapshot) => {
      if (!active) return;
      persistedBestRunRef.current = snapshot.bestRun;
      if (snapshot.bestRun > bestRunStateRef.current) {
        bestRunStateRef.current = snapshot.bestRun;
        setBestRun(snapshot.bestRun);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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

      const visitBest = Math.max(persistedBestRunRef.current, next.bestStreak);
      if (visitBest !== bestRunStateRef.current) {
        bestRunStateRef.current = visitBest;
        setBestRun(visitBest);
      }
    },
    [],
  );

  const getCardScore = useCallback(
    (index: number): CardScore | null =>
      cardScoresRef.current.get(index) ?? null,
    [],
  );

  // On unmount (feed visit ended), persist this visit's best run + points (best-
  // effort, fire-and-forget). A remount starts a fresh visit.
  const storeOnUnmount = storeRef.current;
  useEffect(() => {
    if (!storeOnUnmount) return undefined;
    return () => {
      const final = stateRef.current;
      void storeOnUnmount.record(final.bestStreak, final.totalPoints);
    };
  }, [storeOnUnmount]);

  return { state, bestRun, onCardResolved, getCardScore, version };
}
