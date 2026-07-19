/**
 * Per-difficulty time budget — the single source of truth for how long a player
 * gets on any card (Azure DevOps; product decision 2026-06).
 *
 * Time limits used to be hand-tuned per card, which drifted (a "medium" card
 * could be anywhere from 12s to 30s). Instead, every catalog card now derives its
 * `config.timeLimitMs` from its `difficulty` tier via {@link withDifficultyTimeLimit}
 * when the catalog is built, so the budget is uniform per tier and authored
 * per-card limits are intentionally overridden. This keeps the engine/templates
 * agnostic — they still read `card.config.timeLimitMs`; only its provenance moved
 * to one place (CLAUDE.md §6: data-driven, localized).
 *
 * Tiers: extremely_easy 30s · easy 60s · medium 90s · hard 120s · extremely_hard
 * 180s. Applies to ALL templates, including the timed reaction/speed games.
 */
import type { Difficulty, LiquidCard } from './types';

/** Time budget (ms) per difficulty tier. The one place these numbers live. */
export const TIME_LIMIT_BY_DIFFICULTY: Readonly<Record<Difficulty, number>> =
  Object.freeze({
    extremely_easy: 30_000,
    easy: 60_000,
    medium: 90_000,
    hard: 120_000,
    extremely_hard: 180_000,
  });

/** The time budget (ms) for a difficulty tier. */
export function timeLimitForDifficulty(difficulty: Difficulty): number {
  return TIME_LIMIT_BY_DIFFICULTY[difficulty];
}

/**
 * Return a copy of `card` whose `config.timeLimitMs` is set from its difficulty
 * tier (see {@link TIME_LIMIT_BY_DIFFICULTY}). Applied uniformly when the catalog
 * is built so the per-difficulty budget is the single source of truth. The lone
 * union-spread cast is sound: only `timeLimitMs` — present on every template's
 * config — changes; every other field is preserved by the spread.
 */
export function withDifficultyTimeLimit(card: LiquidCard): LiquidCard {
  return {
    ...card,
    config: {
      ...card.config,
      timeLimitMs: TIME_LIMIT_BY_DIFFICULTY[card.difficulty],
    },
  } as LiquidCard;
}
