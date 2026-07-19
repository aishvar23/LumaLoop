/**
 * Shareable challenge-link encode/decode (engagement strategy §4.6 / Phase 3).
 *
 * Pure, dependency-free helpers that build and parse the viral "beat my score"
 * link. A player who resolves a card shares `<origin>/c/<cardId>?s=<points>`; the
 * recipient opens it in the WEB app (the public `/c/:cardId` route), sees a
 * "Beat <points>!" banner, plays the real card, and can challenge back — no
 * accounts, no server, no PII in the URL (only the cardId + a numeric score).
 *
 * This is the WEB source of truth; `mobile/src/social/challengeLink.ts` is a
 * byte-faithful port (header-only diff) so both platforms produce identical
 * links.
 *
 * ── POSITIONING GUARDRAIL (Design §7) ───────────────────────────────────────
 * Game framing ONLY — "beat my score", "puzzle", "challenge". Never IQ / skill /
 * ability / cognitive / intelligence / assessment / clinical language, and no
 * shame copy. {@link challengeShareText} is the single place share copy lives.
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
