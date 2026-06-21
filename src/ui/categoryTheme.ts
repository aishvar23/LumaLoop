/**
 * categoryTheme — the typed map from a card's performance {@link ChallengeCategory}
 * to its accent theme (Phase 3 visual upgrade).
 *
 * The colour VALUES live in `src/styles/tokens.css` as `--cat-<category>` custom
 * properties (token-first; no scattered hex). This module is the typed bridge: it
 * resolves a category to the three CSS-variable references the feed paints with —
 * the accent itself, a deeper stop for gradients, and a low-alpha tint for the
 * slide background. The active slide seeds the local `--accent` / `--accent-deep`
 * / `--accent-tint` aliases from these, so every component below it (byline,
 * buttons, selected states, the result card) reads ONE generic accent and never
 * branches on category or `templateType` — the engine stays template-agnostic
 * (CLAUDE.md §6).
 *
 * Every category in the union resolves to a defined theme; an unknown/absent
 * category falls back to the brand accent ({@link FALLBACK_THEME}) so a new
 * category renders sensibly before it gets a dedicated hue.
 *
 * Colour is never the SOLE signal in any consumer (Design accessibility
 * guardrails) — the accent only reinforces glyph/word/text cues.
 */

import type { ChallengeCategory } from '../cards/types';

/** The CSS custom-property references for one category's accent. */
export type CategoryTheme = {
  /** The accent — byline, selected/active states, badges, primary button. */
  accent: string;
  /** A deeper accent stop for the primary-button / chip gradient. */
  accentDeep: string;
  /** A low-alpha fill for the slide background wash. */
  accentTint: string;
};

/**
 * Build the three token references for a category. The values themselves live in
 * `tokens.css`; this keeps the map declarations terse and guarantees the variable
 * names stay in lock-step with the category literal.
 */
function theme(category: ChallengeCategory): CategoryTheme {
  return {
    accent: `var(--cat-${category})`,
    accentDeep: `var(--cat-${category}-deep)`,
    accentTint: `var(--cat-${category}-tint)`,
  };
}

/**
 * Accent theme per performance category. A `Record<ChallengeCategory, …>` so the
 * compiler forces every category in the union to have an entry — adding a new
 * category will fail the build until its theme (and its `--cat-*` tokens) exist.
 */
export const categoryThemes: Readonly<Record<ChallengeCategory, CategoryTheme>> =
  Object.freeze({
    visual_attention: theme('visual_attention'),
    working_memory: theme('working_memory'),
    logical_reasoning: theme('logical_reasoning'),
    cognitive_flexibility: theme('cognitive_flexibility'),
    pattern_recognition: theme('pattern_recognition'),
    processing_speed: theme('processing_speed'),
  });

/**
 * The safe fallback for an unknown/absent category — the shared brand accent (its
 * `--accent*` defaults are declared in `tokens.css`). Returned by
 * {@link resolveCategoryTheme} when the category does not resolve, so a consumer
 * always gets a usable theme and never an `undefined`.
 */
export const FALLBACK_THEME: CategoryTheme = Object.freeze({
  accent: 'var(--color-accent)',
  accentDeep: 'var(--accent-deep)',
  accentTint: 'var(--accent-tint)',
});

/**
 * Resolve a category (possibly absent / not yet themed) to its accent theme,
 * falling back to {@link FALLBACK_THEME}. Accepts a loose `string | undefined` so
 * callers can pass a raw `card.category` without a cast and still get a defined
 * theme back.
 */
export function resolveCategoryTheme(
  category: ChallengeCategory | string | undefined,
): CategoryTheme {
  if (category && category in categoryThemes) {
    return categoryThemes[category as ChallengeCategory];
  }
  return FALLBACK_THEME;
}
