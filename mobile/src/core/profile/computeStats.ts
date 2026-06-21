// Ported from web `src/profile/computeStats.ts`; source of truth is the web app —
// keep in sync (accounts pivot). Byte-faithful: only this header differs. See
// `mobile/src/core/README.md`.
/**
 * Pure profile-stats aggregation (accounts pivot).
 *
 * SOURCE OF TRUTH for the numbers shown on the /you profile. Takes the raw
 * `game_plays` rows and folds them into a summary — kept here as a pure function
 * (no React, no Supabase, no clock) so it is exhaustively unit-testable and never
 * buried in the component.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): every figure here is GAME activity —
 * games played, points earned, accuracy of answers, the best consecutive-correct
 * streak, and a per-CATEGORY breakdown. These are arcade stats, NOT a skill /
 * ability / IQ / trait / clinical measure, and the UI copy must keep that framing
 * ("performance categories", never "traits").
 *
 * Best streak: the longest run of consecutive correct plays in CHRONOLOGICAL
 * order. Rows arrive newest-first from the query, so we sort by `played_at`
 * ascending before scanning. Plays with equal timestamps keep their input order
 * (stable sort) — good enough for a best-streak count.
 */
import type { GamePlay } from '../auth/types';

/** Per-category rollup for the breakdown section. */
export interface CategoryStat {
  category: string;
  played: number;
  correct: number;
  /** Accuracy in [0, 1]; 0 when nothing played in this category. */
  accuracy: number;
  points: number;
}

/** The full summary the profile renders. */
export interface ProfileStats {
  /** Total resolved cards recorded. */
  gamesPlayed: number;
  /** Count of correct resolutions. */
  correctCount: number;
  /** Overall accuracy in [0, 1] (0 when nothing played). */
  accuracy: number;
  /** Longest consecutive-correct run, chronologically. */
  bestStreak: number;
  /** Sum of points earned across all plays. */
  totalPoints: number;
  /** Per-category rollup, sorted by games played desc then category asc. */
  categories: CategoryStat[];
}

/** The zeroed summary for a player with no recorded plays. */
export const EMPTY_PROFILE_STATS: ProfileStats = {
  gamesPlayed: 0,
  correctCount: 0,
  accuracy: 0,
  bestStreak: 0,
  totalPoints: 0,
  categories: [],
};

/** Longest run of consecutive `is_correct` plays in chronological order. */
function longestStreak(chronological: GamePlay[]): number {
  let best = 0;
  let run = 0;
  for (const play of chronological) {
    if (play.is_correct) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Aggregate a player's `game_plays` rows into the profile summary. Pure. */
export function computeStats(plays: readonly GamePlay[]): ProfileStats {
  if (plays.length === 0) return EMPTY_PROFILE_STATS;

  let correctCount = 0;
  let totalPoints = 0;
  const byCategory = new Map<string, CategoryStat>();

  for (const play of plays) {
    if (play.is_correct) correctCount += 1;
    totalPoints += play.points;

    const existing = byCategory.get(play.category);
    if (existing) {
      existing.played += 1;
      existing.correct += play.is_correct ? 1 : 0;
      existing.points += play.points;
    } else {
      byCategory.set(play.category, {
        category: play.category,
        played: 1,
        correct: play.is_correct ? 1 : 0,
        accuracy: 0,
        points: play.points,
      });
    }
  }

  const categories = [...byCategory.values()]
    .map((c) => ({ ...c, accuracy: c.played > 0 ? c.correct / c.played : 0 }))
    .sort((a, b) => b.played - a.played || a.category.localeCompare(b.category));

  // Sort ascending by played_at for the chronological streak scan (stable).
  const chronological = [...plays].sort((a, b) =>
    a.played_at < b.played_at ? -1 : a.played_at > b.played_at ? 1 : 0,
  );

  return {
    gamesPlayed: plays.length,
    correctCount,
    accuracy: correctCount / plays.length,
    bestStreak: longestStreak(chronological),
    totalPoints,
    categories,
  };
}

/** Format an accuracy fraction [0,1] as a whole-percent string ("83%"). */
export function formatAccuracy(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}
