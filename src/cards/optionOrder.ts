/**
 * Deterministic, card-seeded option ordering for MCQ-style renderers.
 *
 * Several templates present a flat list of choices where exactly one is correct
 * (keyed by `correctOptionId`/`oddItemId`, NEVER by position). Authored cards
 * tend to list the correct choice first (or in a predictable slot), so rendering
 * options in authored order makes the answer positionally guessable — trivially
 * "tap the first button." This helper reorders the DISPLAYED options with a
 * deterministic, per-card shuffle so the correct option's POSITION is
 * unpredictable, yet:
 *   - stable for a given seed (same order on every render — no reshuffle churn,
 *     no flicker, selection/feedback stay anchored to option IDs), and
 *   - identical across web and mobile (this file is the shared pure core, mirrored
 *     verbatim into `mobile/src/core/cards/optionOrder.ts`), so a card looks the
 *     same on both platforms.
 *
 * It is PURE and React-free: a referentially-transparent function of
 * `(seed, options)`. It returns a PERMUTATION of the input (same elements, same
 * count, no loss/duplication) in a new array — the input is never mutated. The
 * correct option is therefore always still present; only its slot moves.
 *
 * Evaluation is unaffected: every evaluator scores by option ID, so reordering
 * the display is safe. Callers seed from a STABLE per-list key — the `cardId`
 * for a single-choice card, or `cardId + ':' + stepId` for a multi-step card so
 * each step shuffles independently but stably.
 */

/**
 * xmur3 string hash — a well-mixed 32-bit seed generator from a string.
 * Public-domain construction; used only to seed {@link mulberry32}. Mirrors the
 * session composer's RNG so seeded ordering is consistent across the codebase.
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

/**
 * Return a deterministically-shuffled COPY of `options`, seeded from `seed`.
 *
 * Same seed + same options ⇒ same order (every render). Different seeds give
 * (typically) different orders. The result is always a permutation of the input:
 * same elements, same length, input untouched. Empty/singleton lists are
 * returned as a copy unchanged (nothing to reorder).
 *
 * @param seed   A stable per-list key (e.g. `cardId`, or `cardId:stepId`).
 * @param options The authored options/items (any element type).
 */
export function orderOptions<T>(seed: string, options: readonly T[]): T[] {
  const arr = options.slice();
  if (arr.length < 2) return arr;
  const rng = mulberry32(xmur3(seed)());
  // Fisher-Yates: unbiased in-place shuffle of the copy.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
