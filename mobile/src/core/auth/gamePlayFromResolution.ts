// Ported from web `src/auth/gamePlayFromResolution.ts`; source of truth is the web
// app — keep in sync (accounts pivot). Byte-faithful: only this header differs.
// See `mobile/src/core/README.md`.
/**
 * Pure mapping: a feed {@link CardResolution} + its card + the Phase-4 score →
 * a `game_plays` insert row (accounts pivot).
 *
 * SOURCE OF TRUTH for what gets persisted on each resolved card. Kept pure (no
 * Supabase, no React) so the resolution→row shape is unit-tested in isolation and
 * the feed wiring stays a thin best-effort `insertGamePlay` call.
 *
 * Template-agnostic by construction: it reads only the shared `CardResolution`
 * fields plus the card's `templateType`/`category`, and the `points` come from
 * the SAME Phase-4 scoring the HUD uses (passed in by the caller, not recomputed
 * here) — no switch on `templateType`, so a new game records for free.
 */
import type { LiquidCard } from '../cards/types';
import type { CardResolution } from '../templates/contract';
import type { GamePlayInsert } from './types';

export interface BuildGamePlayInput {
  /** The signed-in user's id (becomes `user_id`; RLS enforces auth.uid()). */
  userId: string;
  /** The resolved card (gives `card_id`, `template_type`, `category`). */
  card: LiquidCard;
  /** The shared resolution (gives correctness + interaction timing). */
  resolution: CardResolution;
  /** Points from the Phase-4 scoring core for THIS card (HUD's value). */
  points: number;
}

/**
 * Build the `game_plays` insert row. `elapsed_ms` uses the interaction-phase
 * elapsed time (excludes any pre-phase, matching the scoring layer) and is
 * floored to a non-negative integer for the integer column; null when unknown.
 */
export function buildGamePlay({
  userId,
  card,
  resolution,
  points,
}: BuildGamePlayInput): GamePlayInsert {
  const raw = resolution.interactionElapsedMs;
  const elapsed_ms =
    Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;

  return {
    user_id: userId,
    card_id: card.cardId,
    template_type: card.templateType,
    category: card.category,
    is_correct: resolution.isCorrect,
    points: Math.max(0, Math.round(points)),
    elapsed_ms,
  };
}
