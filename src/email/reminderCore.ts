/**
 * Daily reminder email — PURE, runtime-agnostic core (accounts pivot).
 *
 * Mirrors the telemetry split (`src/telemetry/ingest.ts` ← `api/event.ts`): ALL
 * logic + tests live here as pure functions; the Vercel cron wrapper
 * (`api/daily-reminder.ts`) only supplies I/O — the recipient list (Supabase admin
 * API) and the `send` transport (Resend). That keeps this exhaustively unit-
 * testable with NO network and lets the wrapper stay a thin shell.
 *
 * The provider is GATED: when email isn't configured the wrapper passes `send =
 * null` and every recipient is counted as SKIPPED (a safe no-op) — nothing is
 * ever sent until a real transport is wired. So deploying the cron is harmless.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): the copy is about playing games only
 * — no IQ / brain-training / ability / clinical claims, no "traits".
 */

/** A user we may email. Only the address is needed (no other PII is used). */
export interface Recipient {
  email: string;
}

/** A rendered reminder email (provider-agnostic). */
export interface ReminderEmail {
  subject: string;
  html: string;
  text: string;
}

/** Transport for one email. Returns whether it was accepted by the provider. */
export type SendEmail = (
  message: ReminderEmail & { to: string },
) => Promise<{ ok: boolean; error?: string }>;

/** The outcome of a reminder run — surfaced in the cron response + logs. */
export interface ReminderSummary {
  /** Total recipients considered (before validation). */
  attempted: number;
  /** Emails the provider accepted. */
  sent: number;
  /** Recipients not sent to: invalid address, provider not configured, or error. */
  skipped: number;
  /** Per-recipient provider error messages (never includes addresses/PII). */
  errors: string[];
  /** True iff at least one email was actually sent. */
  delivered: boolean;
}

/**
 * Minimal, conservative email-shape check. Not RFC-perfect on purpose — it only
 * needs to drop obviously unusable addresses before we hand them to the provider.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Build the (static, daily) reminder email. Guardrail-safe copy. */
export function buildReminderEmail(): ReminderEmail {
  const subject = 'Your next LumaLoop puzzle is waiting';
  const text = [
    'Ready for today’s games?',
    '',
    'A fresh feed of quick puzzles is ready to play on LumaLoop. ' +
      'Keep your streak going and see what you can solve today.',
    '',
    'Open LumaLoop and start playing: https://lumaloop.app',
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#16181f">',
    '<h1 style="font-size:20px;margin:0 0 12px">Ready for today’s games?</h1>',
    '<p style="font-size:15px;line-height:1.5;margin:0 0 16px">',
    'A fresh feed of quick puzzles is ready to play on LumaLoop. Keep your streak going and see what you can solve today.',
    '</p>',
    '<p style="margin:0 0 16px">',
    '<a href="https://lumaloop.app" style="display:inline-block;background:#6c7bff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Start playing</a>',
    '</p>',
    '</div>',
  ].join('');
  return { subject, html, text };
}

/**
 * Send the daily reminder to every recipient.
 *
 * - Drops invalid addresses (counted as skipped).
 * - When `send` is `null` (provider not configured) it sends NOTHING and counts
 *   every valid recipient as skipped — the gated, safe no-op path.
 * - Otherwise it sends to each valid recipient and tallies sent/skipped/errors.
 *
 * Never throws: a transport rejection for one recipient is recorded and the run
 * continues, so one bad address can’t abort the whole batch.
 */
export async function sendDailyReminders(
  recipients: readonly Recipient[],
  send: SendEmail | null,
): Promise<ReminderSummary> {
  const email = buildReminderEmail();
  const valid = recipients.filter((r) => isValidEmail(r.email));
  let skipped = recipients.length - valid.length;
  const errors: string[] = [];

  // Provider not configured → safe no-op: count everyone as skipped.
  if (send === null) {
    return {
      attempted: recipients.length,
      sent: 0,
      skipped: skipped + valid.length,
      errors,
      delivered: false,
    };
  }

  let sent = 0;
  for (const recipient of valid) {
    let result: { ok: boolean; error?: string };
    try {
      result = await send({ to: recipient.email, ...email });
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : 'send failed' };
    }
    if (result.ok) {
      sent += 1;
    } else {
      skipped += 1;
      if (result.error) errors.push(result.error);
    }
  }

  return {
    attempted: recipients.length,
    sent,
    skipped,
    errors,
    delivered: sent > 0,
  };
}
