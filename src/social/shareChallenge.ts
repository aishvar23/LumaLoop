/**
 * Web share primitive for challenge links (engagement strategy §4.6).
 *
 * One place for the "share or copy" behaviour both the in-feed
 * {@link CardChallengeButton} and the {@link ChallengeRoute} result CTA use, so
 * the loop behaves identically wherever a challenge is sent. Uses the native
 * share sheet ({@link navigator.share}) when available, otherwise copies the URL
 * to the clipboard. Everything is guarded — it NEVER throws into the UI.
 */

export type ShareChallengeResult = 'shared' | 'copied' | 'failed';

/**
 * Share a challenge `url` with guardrail-safe `text` via the native share sheet,
 * falling back to a clipboard copy when sharing is unavailable. Returns how the
 * link was sent so the caller can show a transient "Link copied!" hint. Never
 * rejects.
 */
export async function shareChallengeLink(
  url: string,
  text: string,
): Promise<ShareChallengeResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text, url });
      return 'shared';
    } catch {
      // Share sheet dismissed/unavailable — do not throw into the UI.
      return 'failed';
    }
  }
  try {
    await nav?.clipboard?.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
