/**
 * Shareable challenge-link encode/decode — React Native counterpart of web
 * `src/social/challengeLink.ts` (byte-faithful logic; header-only diff).
 *
 * Mobile players GENERATE/SHARE links; opening one lands the recipient on the
 * public WEB `/c/:cardId` route (the intended prototype scope — no native
 * deep-link/universal-link config). Because there is no runtime web origin on
 * device, mobile builds always pass {@link CHALLENGE_BASE_URL} as the origin.
 *
 * Game framing ONLY (Design §7) — no IQ / skill / ability / cognitive language,
 * and no PII in the URL (cardId + numeric score only).
 */

/** The public web origin for challenge links when no runtime origin is available (mobile). */
export const CHALLENGE_BASE_URL = 'https://witzy.app';

export type ChallengeParams = { points: number | null };

/** Build a shareable challenge URL: `<origin>/c/<cardId>?s=<points>`. Omits `s` when points is null/<=0. */
export function buildChallengeUrl(args: {
  cardId: string;
  points?: number | null;
  origin?: string;
}): string {
  const origin = (args.origin ?? CHALLENGE_BASE_URL).replace(/\/$/, '');
  const base = `${origin}/c/${encodeURIComponent(args.cardId)}`;
  return args.points && args.points > 0
    ? `${base}?s=${Math.round(args.points)}`
    : base;
}

/** Parse the challenger's score from a URL query string (`?s=420`). */
export function parseChallenge(search: string): ChallengeParams {
  try {
    const raw = new URLSearchParams(search).get('s');
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return { points: Number.isFinite(n) && n > 0 ? n : null };
  } catch {
    return { points: null };
  }
}

/** Guardrail-safe share text (game framing only — no IQ/skill/ability language). */
export function challengeShareText(points: number | null): string {
  return points && points > 0
    ? `I scored ${points} on this Witzy puzzle — can you beat me?`
    : `Try this Witzy puzzle — can you solve it?`;
}
