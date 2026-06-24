// Ported from web `src/profile/yourGames.ts`; source of truth is the web app —
// keep in sync (D3). Only the import paths + this header differ. See
// `mobile/src/core/README.md`.
/**
 * Pure shaping for the profile "Your games" section (D3).
 *
 * SOURCE OF TRUTH for the per-game rows the /you page renders: it joins each
 * `user_game_scores` view row to its catalog card for a friendly title/category
 * label, and sorts the list for display. Kept here as a pure function (no React,
 * no Supabase, no clock) so it is exhaustively unit-testable and never buried in
 * the component (CLAUDE.md §3).
 *
 * Template-agnostic (CLAUDE.md §6): it reads only generic card metadata
 * (`explanation.title`, `prompt`, `category`) and the universal score columns —
 * NO switch on `templateType`. A new game needs no change here.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): every figure is a GAME score —
 * best/last points, times played — never an ability / IQ / trait / clinical
 * measure. The category label is a "performance category", not a "trait".
 */
import type { LiquidCard } from '../cards/types';
import type { UserGameScore } from '../auth/types';

/** One display row for the "Your games" list. */
export interface YourGameRow {
  cardId: string;
  /** Friendly game title (catalog `explanation.title`, falling back to prompt). */
  title: string;
  /**
   * Raw performance-category id (e.g. "visual_attention") — the colour key for the
   * row's accent. Prefers the live catalog category, falling back to the view row.
   */
  category: string;
  /** Human label for the performance category (e.g. "Visual attention"). */
  categoryLabel: string;
  bestPoints: number;
  lastPoints: number;
  timesPlayed: number;
  /** ISO timestamp of the most recent play (for the caller to format/sort). */
  lastPlayedAt: string;
}

/** How to sort the "Your games" list. */
export type YourGamesSort = 'recent' | 'best';

/** Title-case a snake_case id ("visual_attention" → "Visual attention"). */
export function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ').trim();
  if (spaced.length === 0) return 'Other';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A friendly title for a game. Prefers the card's `explanation.title` (the
 * authored game name), then a trimmed `prompt`, then the cardId so something
 * always shows even if the card has dropped out of the catalog.
 */
function gameTitle(card: LiquidCard | undefined, cardId: string): string {
  const explanationTitle = card?.explanation?.title?.trim();
  if (explanationTitle) return explanationTitle;
  const prompt = card?.prompt?.trim();
  if (prompt) return prompt;
  return cardId;
}

/**
 * Shape the user's `user_game_scores` rows into display rows, joined to catalog
 * metadata and sorted. Pure.
 *
 *   - `getCardById` resolves the catalog card for the friendly title (a row whose
 *     card is no longer in the catalog still shows, titled by prompt/cardId from
 *     the view's own `category`).
 *   - `sort`: `'recent'` (default) = most recently played first; `'best'` = best
 *     score first. Both break ties on cardId for a stable, deterministic order.
 */
export function buildYourGames(
  scores: readonly UserGameScore[],
  getCardById: (cardId: string) => LiquidCard | undefined,
  sort: YourGamesSort = 'recent',
): YourGameRow[] {
  const rows: YourGameRow[] = scores.map((s) => {
    const card = getCardById(s.card_id);
    // Prefer the live catalog category (kept current), falling back to the value
    // stored on the view row.
    const category = card?.category ?? s.category;
    return {
      cardId: s.card_id,
      title: gameTitle(card, s.card_id),
      category,
      categoryLabel: categoryLabel(category),
      bestPoints: s.best_points,
      lastPoints: s.last_points,
      timesPlayed: s.times_played,
      lastPlayedAt: s.last_played_at,
    };
  });

  rows.sort((a, b) => {
    if (sort === 'best') {
      if (b.bestPoints !== a.bestPoints) return b.bestPoints - a.bestPoints;
    } else {
      // recent: newest last_played_at first.
      if (a.lastPlayedAt !== b.lastPlayedAt) {
        return a.lastPlayedAt < b.lastPlayedAt ? 1 : -1;
      }
    }
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });

  return rows;
}
