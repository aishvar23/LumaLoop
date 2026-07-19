/**
 * Pure chart-shaping for the /you profile visualizations.
 *
 * SOURCE OF TRUTH for the geometry the profile charts paint: it turns the already
 * computed {@link CategoryStat} rollup into ready-to-render bar/segment models —
 * normalized bar widths, each category's share of the total, sorted order, and the
 * formatted value labels. Kept here as a pure function (no React, no DOM, no RN,
 * no clock, no colour) so the maths is exhaustively unit-testable and the
 * components stay thin (CLAUDE.md §3). It does NOT recompute stats — it only
 * reshapes the {@link ProfileStats} the page already has.
 *
 * Colour is resolved by the platform layer (web `categoryTheme`, mobile
 * `categoryAccent`) from each bar's `category` id — this module is colour-agnostic
 * so it can be shared byte-for-byte across web and mobile.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): every figure here is GAME activity —
 * accuracy of answers, points earned, games played per "performance category".
 * Never an ability / IQ / trait / clinical measure.
 */
import type { CategoryStat } from './computeStats';

/** Which metric a bar chart visualizes. */
export type BarMetric = 'accuracy' | 'points' | 'played';

/** One bar in a per-category bar chart. */
export interface CategoryBar {
  /** The category id (e.g. "visual_attention") — the colour key. */
  category: string;
  /** Raw metric value (accuracy in [0,1]; points/played as whole counts). */
  value: number;
  /** Human-readable value label ("83%", "420 pts", "12 plays"). */
  valueLabel: string;
  /**
   * Bar fill as a fraction of the chart width, in [0, 1]. For accuracy this is the
   * value itself; for points/played it's the value scaled against the largest bar
   * so the longest bar fills the track. 0 when every bar is 0.
   */
  fill: number;
}

/** One slice of the points-share distribution bar. */
export interface DistributionSegment {
  /** The category id — the colour key. */
  category: string;
  /** Raw value contributed by this category (points). */
  value: number;
  /** This category's share of the total, in [0, 1]. 0 when the total is 0. */
  share: number;
  /** Human-readable share label ("35%"). */
  sharePercent: string;
}

/** Clamp a number into [0, 1]. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Format an accuracy/share fraction [0,1] as a whole-percent string ("83%"). */
export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

/** Pluralize a whole count with its unit ("1 play" / "12 plays"). */
function countLabel(count: number, singular: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

/**
 * Build the per-category bar model for the given metric. Pure.
 *
 *   - `accuracy`: fill is the accuracy fraction directly (0..1), label a percent.
 *   - `points` / `played`: fill is scaled against the largest bar so the leader
 *     fills the track; label is the formatted count. When every value is 0 (or the
 *     list is empty) all fills are 0 — a neutral empty chart, never NaN.
 *
 * Input order is preserved (the caller already sorts {@link CategoryStat} by games
 * played); this keeps the chart order consistent with the list below it.
 */
export function buildCategoryBars(
  categories: readonly CategoryStat[],
  metric: BarMetric,
): CategoryBar[] {
  const valueOf = (c: CategoryStat): number =>
    metric === 'accuracy' ? c.accuracy : metric === 'points' ? c.points : c.played;

  const max = categories.reduce((m, c) => Math.max(m, valueOf(c)), 0);

  return categories.map((c) => {
    const value = valueOf(c);
    const fill =
      metric === 'accuracy'
        ? clamp01(value)
        : max > 0
          ? clamp01(value / max)
          : 0;
    const valueLabel =
      metric === 'accuracy'
        ? formatPercent(value)
        : metric === 'points'
          ? `${value} pts`
          : countLabel(value, 'play');
    return { category: c.category, value, valueLabel, fill };
  });
}

/**
 * Build the points-share distribution (each category's slice of total points).
 * Pure. Shares sum to ~1 (subject to rounding) when total > 0; when nothing has
 * scored points every share is 0 so the segmented bar renders empty, never NaN.
 *
 * Input order is preserved. Categories with 0 points are kept (share 0) so the
 * legend stays aligned with the bar chart above it.
 */
export function buildPointsDistribution(
  categories: readonly CategoryStat[],
): DistributionSegment[] {
  const total = categories.reduce((sum, c) => sum + Math.max(0, c.points), 0);
  return categories.map((c) => {
    const value = Math.max(0, c.points);
    const share = total > 0 ? value / total : 0;
    return {
      category: c.category,
      value,
      share,
      sharePercent: formatPercent(share),
    };
  });
}
