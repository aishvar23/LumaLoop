// Ported from web `src/session/composeSession.ts`; source of truth is the web app
// — keep in sync (Phase M, M2). See `mobile/src/core/README.md`.
/**
 * Seeded session composition (Technical Design §12, Design §19, Azure DevOps
 * #61).
 *
 * `composeSession` is a PURE, deterministic function that picks and orders the
 * cards for one session from the local catalog. The same
 * `(anonymousUserId, dayKey, mode)` always yields a byte-identical ordered list
 * of `cardId`s; a different user, day, or mode (generally) yields a different
 * one. There is no `Math.random` and no clock read inside the seeded core: all
 * randomness comes from a small string-seeded PRNG, and "today" is derived from
 * an injectable clock at the boundary only.
 *
 * Template-agnostic by design (CLAUDE.md §4/§6): this module reads only card
 * metadata (`templateType`, `category`, `difficulty`, `estimatedSeconds`,
 * eligibility fields) and emits `cardId`s. It does not import the reducer,
 * controller, telemetry, or renderers, and it never mutates the catalog. Adding
 * a new template requires no change here.
 *
 * ---------------------------------------------------------------------------
 * Composition rules (Design §19 / Tech §12) and how they are satisfied:
 *
 *   - Fixed seeded order per (user, day, mode): a `xmur3`-hashed seed feeds a
 *     `mulberry32` PRNG keyed on an injective `JSON.stringify([anonymousUserId,
 *     dayKey, mode])`, which drives one seeded Fisher-Yates shuffle of the
 *     eligible pool.
 *   - Length = `MODE_DEFAULTS[mode].maxCards` where the catalog allows.
 *   - Difficulty ramp (easy -> medium): slots are filled in ascending
 *     difficulty so the emitted sequence is non-decreasing in difficulty. A
 *     quota front-loads easy cards and ramps into medium; `hard` is used only
 *     as fallback to reach the target length (Design §19 ramps "toward medium",
 *     not into hard).
 *   - Category balance: at each slot the lowest-used category is preferred, so
 *     categories spread rather than cluster.
 *   - No more than 2 of the same template back-to-back: forming a third
 *     consecutive identical `templateType` is a hard constraint, enforced by
 *     filtering candidates before scoring.
 *   - estimatedSeconds budget: the mode's `maxDurationMs / 1000` is a SOFT cap.
 *     A card that would push the running total over budget is de-prioritized
 *     but still selectable, because the prototype is primarily card-count
 *     bounded (Tech §12).
 *
 * Priority when constraints conflict on a small catalog:
 *   HARD  — reach `maxCards` (where the catalog allows), never 3 identical
 *           templates in a row, never duplicate a card within one session.
 *   SOFT  — difficulty ramp, category balance, time budget.
 * Soft constraints degrade gracefully and deterministically: a soft preference
 * that cannot be met is simply scored worse, never thrown.
 *
 * Fallbacks (documented, deterministic, never throw / never loop forever):
 *   - If the eligible pool is smaller than `maxCards`, the result is shorter
 *     than `maxCards`. Cards are never duplicated to pad the length.
 *   - If a difficulty tier is exhausted, slots spill into the next HARDER tier
 *     only (never an easier one), preserving the non-decreasing ramp.
 *   - If no candidate can avoid a third consecutive identical template (only
 *     possible on a pathologically uniform catalog), the run constraint is
 *     relaxed for that single slot rather than failing.
 * ---------------------------------------------------------------------------
 */

import { catalog as defaultCatalog } from '../cards/catalog';
import type { ChallengeCategory, Difficulty, LiquidCard } from '../cards/types';
import { ALLOWED_EVIDENCE_TIERS } from '../cards/validation';
import { MODE_DEFAULTS, type SessionMode } from './sessionTypes';

/** Inputs to {@link composeSession}. Everything that affects the output is an
 * argument, so the function is fully testable without touching real time. */
export type ComposeSessionParams = {
  mode: SessionMode;
  anonymousUserId: string;
  /**
   * UTC day key (`yyyy-mm-dd`). When provided this fully determines the "day"
   * dimension of the seed and `now` is ignored. Prefer passing this in tests.
   */
  day?: string;
  /**
   * Injectable clock used to derive the day key when `day` is absent. A
   * `Date`, an epoch-ms number, or omitted. The real wall clock is read ONLY
   * here at the boundary (default `new Date()`), never inside the seeded core.
   */
  now?: Date | number;
  /** Catalog to compose from. Defaults to the authored local catalog. */
  catalog?: readonly LiquidCard[];
};

/** Ascending difficulty rank used to enforce the non-decreasing ramp. */
const DIFFICULTY_RANK: Readonly<Record<Difficulty, number>> = Object.freeze({
  easy: 0,
  medium: 1,
  hard: 2,
});

/** Difficulty tiers in ascending order — the spill order for tier fallback. */
const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Whether a card is eligible to appear in a composed session.
 *
 * DECISION: the docs gate authored content on manual review (Design §13 — mark
 * `reviewStatus: 'manual_reviewed'` only after playtest) and on the two
 * prototype-permitted evidence tiers (Tech §11). We treat exactly those two
 * documented signals as the eligibility contract; we do not invent new gating
 * fields. Re-using `ALLOWED_EVIDENCE_TIERS` keeps a single source of truth with
 * catalog validation.
 */
function isEligible(card: LiquidCard): boolean {
  return (
    card.reviewStatus === 'manual_reviewed' &&
    ALLOWED_EVIDENCE_TIERS.includes(card.evidenceTier)
  );
}

/**
 * xmur3 string hash — produces a well-mixed 32-bit seed generator from a string.
 * Public-domain construction; used only to seed {@link mulberry32}.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — a tiny, fast, deterministic PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a deterministic PRNG from a stable string key. */
function makeRng(key: string): () => number {
  const seed = xmur3(key);
  return mulberry32(seed());
}

/** Pure seeded Fisher-Yates shuffle. Returns a new array; input untouched. */
function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Coerces the injectable clock to a `Date`. Boundary-only real-time read. */
function toDate(now: Date | number | undefined): Date {
  if (now == null) return new Date();
  return now instanceof Date ? now : new Date(now);
}

/** UTC `yyyy-mm-dd` day key. Stable across timezones for a given instant. */
export function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Mutable bookkeeping threaded through the greedy slot-filling loop. */
type SelectionState = {
  readonly selected: LiquidCard[];
  readonly categoryCount: Map<ChallengeCategory, number>;
  totalSeconds: number;
};

/**
 * Picks the best candidate index from one (already seeded-ordered) tier pool for
 * the next slot, or `-1` if none qualifies. Lower score tuple wins; ties break
 * on the seeded pool index so the choice is fully deterministic.
 *
 * Scoring (lexicographic, all minimized):
 *   1. category usage   — spread categories (balance, soft)
 *   2. repeats previous — discourage even a 2-in-a-row of one template (soft)
 *   3. exceeds budget   — keep total estimatedSeconds under the mode cap (soft)
 *   4. seeded pool index — deterministic tiebreak
 *
 * When `enforceRunLimit` is true, any candidate that would create a third
 * consecutive identical `templateType` is excluded (hard constraint).
 */
function chooseFromPool(
  pool: readonly LiquidCard[],
  state: SelectionState,
  timeBudgetSeconds: number,
  enforceRunLimit: boolean,
): number {
  const { selected, categoryCount, totalSeconds } = state;
  const last = selected[selected.length - 1];
  const prev = selected[selected.length - 2];
  const wouldRepeatTwice =
    last !== undefined && prev !== undefined &&
    last.templateType === prev.templateType;

  let bestIndex = -1;
  let bestScore: readonly number[] | null = null;

  for (let i = 0; i < pool.length; i++) {
    const card = pool[i];

    // Hard constraint: never a third identical template in a row.
    if (
      enforceRunLimit &&
      wouldRepeatTwice &&
      card.templateType === last.templateType
    ) {
      continue;
    }

    const score: readonly number[] = [
      categoryCount.get(card.category) ?? 0,
      last !== undefined && last.templateType === card.templateType ? 1 : 0,
      totalSeconds + card.estimatedSeconds > timeBudgetSeconds ? 1 : 0,
      i,
    ];

    if (bestScore === null || isLowerScore(score, bestScore)) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/** Lexicographic "a < b" over equal-length numeric score tuples. */
function isLowerScore(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Difficulty tiers at `start` rank and harder — the spill order for a slot. */
function spillOrder(start: Difficulty): readonly Difficulty[] {
  return DIFFICULTY_ORDER.slice(DIFFICULTY_RANK[start]);
}

/**
 * Composes a deterministic, ordered list of `cardId`s for one session.
 *
 * Pure and total: identical inputs always produce an identical array; it never
 * throws and never loops forever. See the module header for the full rule set,
 * priority order, and documented fallbacks.
 */
export function composeSession(params: ComposeSessionParams): readonly string[] {
  const { mode, anonymousUserId } = params;
  const sourceCatalog = params.catalog ?? defaultCatalog;
  // Boundary: the only place real time may be read, and only when no explicit
  // day key was supplied. The seeded core below sees a fixed string.
  const dayKey = params.day ?? toDayKey(toDate(params.now));

  const { maxCards, maxDurationMs } = MODE_DEFAULTS[mode];
  const timeBudgetSeconds = maxDurationMs / 1000;

  const eligible = sourceCatalog.filter(isEligible);
  if (eligible.length === 0) return [];

  // One seeded shuffle establishes the per-(user, day, mode) base order; every
  // downstream tiebreak is a stable index into this order, so the whole result
  // is a deterministic function of the seed key. The key is built with
  // `JSON.stringify` so the three components are unambiguously delimited: a
  // plain `:`-join would collide for inputs like (`a:b`, `c`) vs (`a`, `b:c`)
  // when an anonymousUserId can contain the delimiter.
  const rng = makeRng(JSON.stringify([anonymousUserId, dayKey, mode]));
  const shuffled = seededShuffle(eligible, rng);

  // Bucket the shuffled pool by difficulty, preserving seeded order within each.
  const tiers: Record<Difficulty, LiquidCard[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const card of shuffled) tiers[card.difficulty].push(card);

  // Ramp quota: front-load easy, ramp into medium. `hard` is requested only via
  // tier spill when easy/medium cannot fill the session (Design §19).
  const easyQuota = Math.min(Math.ceil(maxCards / 2), maxCards);
  const desired: Difficulty[] = [];
  for (let i = 0; i < maxCards; i++) {
    desired.push(i < easyQuota ? 'easy' : 'medium');
  }

  const state: SelectionState = {
    selected: [],
    categoryCount: new Map(),
    totalSeconds: 0,
  };

  for (const wantedDifficulty of desired) {
    const order = spillOrder(wantedDifficulty);

    // Pass 1: honor the no-3-in-a-row hard constraint, spilling into harder
    // tiers (only) when the wanted tier is empty.
    let picked = pickAcrossTiers(tiers, order, state, timeBudgetSeconds, true);
    // Pass 2 (fallback): relax the run limit for this slot if — and only if —
    // no tier could satisfy it. Practically unreachable on a mixed catalog.
    if (picked === null) {
      picked = pickAcrossTiers(tiers, order, state, timeBudgetSeconds, false);
    }
    // Pools exhausted: degrade to a shorter session rather than duplicating.
    if (picked === null) break;

    const card = tiers[picked.tier].splice(picked.index, 1)[0];
    state.selected.push(card);
    state.categoryCount.set(
      card.category,
      (state.categoryCount.get(card.category) ?? 0) + 1,
    );
    state.totalSeconds += card.estimatedSeconds;
  }

  return state.selected.map((card) => card.cardId);
}

/**
 * Finds the best `{ tier, index }` for the next slot by scanning tiers in spill
 * order (wanted difficulty first, then strictly harder), returning the first
 * tier that yields a qualifying candidate. Returns `null` if none qualifies.
 */
function pickAcrossTiers(
  tiers: Record<Difficulty, readonly LiquidCard[]>,
  order: readonly Difficulty[],
  state: SelectionState,
  timeBudgetSeconds: number,
  enforceRunLimit: boolean,
): { tier: Difficulty; index: number } | null {
  for (const tier of order) {
    const pool = tiers[tier];
    if (pool.length === 0) continue;
    const index = chooseFromPool(
      pool,
      state,
      timeBudgetSeconds,
      enforceRunLimit,
    );
    if (index >= 0) return { tier, index };
  }
  return null;
}
