// Ported from web `src/cards/featured.ts`; source of truth is the web app —
// keep in sync (accounts pivot). Byte-faithful: only this header differs. See
// `mobile/src/core/README.md`.
/**
 * Featured-games selection for the Home / Discover landing page (accounts pivot).
 *
 * A small, PURE catalog helper: it enumerates the distinct templates ("games")
 * in the catalog and returns one presentational tile per template (the first
 * authored card of each kind as the representative). This is marketing/discovery
 * chrome only — the tiles route into the generic feed, they do NOT seed feed
 * composition, so this never touches the feed/session controller (CLAUDE.md §4)
 * and stays template-agnostic (no switch on `templateType`).
 *
 * Data-driven by design: authoring a new template's cards in the catalog makes it
 * eligible here automatically, with no edit to this file (CLAUDE.md §6).
 */
import { catalog } from './catalog';
import type { ChallengeCategory, Difficulty, LiquidCard, TemplateType } from './types';

/** One featured tile: a template plus a representative card to enter the feed. */
export interface FeaturedGame {
  templateType: TemplateType;
  /** Human label for the template, e.g. "spot_it" → "Spot it". */
  label: string;
  /** The performance category of the representative card. */
  category: ChallengeCategory;
  /** The representative card's difficulty. */
  difficulty: Difficulty;
  /** The representative card's estimated play time (seconds). */
  estimatedSeconds: number;
  /** A representative card id of this template (the first authored one). */
  cardId: string;
  /** The authored mechanic of the representative card, e.g. "anomaly-detection". */
  mechanic: string;
}

/** Format a template id into a label: "spot_it" → "Spot it". */
export function templateLabel(templateType: string): string {
  const spaced = templateType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Select up to `limit` featured games — one tile per distinct template, in
 * catalog order, each represented by the first card of that template. A
 * non-positive `limit` returns every distinct template. Pure: `cards` is
 * injectable for tests; it defaults to the shipped {@link catalog}.
 */
export function selectFeaturedGames(
  limit = 6,
  cards: readonly LiquidCard[] = catalog,
): FeaturedGame[] {
  const byTemplate = new Map<TemplateType, FeaturedGame>();
  for (const card of cards) {
    if (byTemplate.has(card.templateType)) continue;
    byTemplate.set(card.templateType, {
      templateType: card.templateType,
      label: templateLabel(card.templateType),
      category: card.category,
      difficulty: card.difficulty,
      estimatedSeconds: card.estimatedSeconds,
      cardId: card.cardId,
      mechanic: card.puzzleDna.mechanic,
    });
  }
  const all = [...byTemplate.values()];
  return limit > 0 ? all.slice(0, limit) : all;
}
