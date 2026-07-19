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

/** Which of the two daily sends this is — drives the morning/evening copy. */
export type ReminderSlot = 'morning' | 'evening';

/** Fallback app link when `REMINDER_APP_URL` isn't configured. */
export const DEFAULT_APP_URL = 'https://witzy.app';

/**
 * Build a reminder email for a time-of-day `slot`. Two gentle variants (morning
 * warm-up / evening wind-down) so twice-daily nudges don't read as duplicates.
 * `appUrl` is where "Start playing" points — pass the live deployment URL.
 * Guardrail-safe copy (Design §7/§21.8): games/streak framing only — no IQ /
 * brain-training / ability / clinical claims.
 */
export function buildReminderEmail(
  slot: ReminderSlot = 'evening',
  appUrl: string = DEFAULT_APP_URL,
): ReminderEmail {
  const morning = slot === 'morning';
  const subject = morning
    ? '☀️ Warm up with a Witzy puzzle'
    : '🌙 Your evening Witzy break';
  const heading = morning
    ? 'Start the day with a few puzzles'
    : 'Wind down with a few puzzles';
  const body = morning
    ? 'A fresh feed of quick puzzles is ready. Play a few with your morning coffee and keep your streak going.'
    : 'Take a short break and solve a few quick puzzles — keep your streak alive before the day is out.';

  const text = [
    `${heading}?`,
    '',
    body,
    '',
    `Open Witzy and start playing: ${appUrl}`,
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#16181f">',
    `<h1 style="font-size:20px;margin:0 0 12px">${heading}?</h1>`,
    '<p style="font-size:15px;line-height:1.5;margin:0 0 16px">',
    body,
    '</p>',
    '<p style="margin:0 0 16px">',
    `<a href="${appUrl}" style="display:inline-block;background:#6c7bff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Start playing</a>`,
    '</p>',
    '</div>',
  ].join('');
  return { subject, html, text };
}

/** A rendered web-push notification (transport-agnostic). */
export interface ReminderPush {
  title: string;
  body: string;
  url: string;
}

/**
 * Build a web-push payload for a time-of-day `slot`. Deliberately mirrors the
 * morning/evening TONE of {@link buildReminderEmail} (morning warm-up / evening
 * wind-down) so a user who gets both channels hears one consistent voice.
 * `url` is where a tap on the notification deep-links (the live deployment).
 * Guardrail-safe copy (Design §7/§21.8): games/streak framing only — no IQ /
 * brain-training / ability / clinical claims.
 */
export function buildReminderPush(
  slot: ReminderSlot = 'evening',
  appUrl: string = DEFAULT_APP_URL,
): ReminderPush {
  const morning = slot === 'morning';
  const title = morning ? '☀️ Morning warm-up' : '🌙 Evening wind-down';
  const body = morning
    ? 'A fresh feed of quick puzzles is ready — play a few and keep your streak going.'
    : 'Take a short break and solve a few quick puzzles before the day is out.';
  return { title, body, url: appUrl };
}

/** A stored web-push subscription row (matches the `push_subscriptions` table). */
export interface PushSubscriptionRow {
  /** The push endpoint URL — unique per browser install; the delete key. */
  endpoint: string;
  /** The full PushSubscription JSON web-push needs to encrypt + deliver. */
  subscription: unknown;
}

/**
 * Deliver one push. `ok` = accepted; `expired` = the endpoint is gone (a 404/410
 * from the push service) and its row should be pruned.
 */
export type SendPush = (
  subscription: unknown,
  payload: string,
) => Promise<{ ok: boolean; expired?: boolean }>;

/** Remove a dead subscription row (by endpoint). Best-effort; may reject. */
export type DeleteSubscription = (endpoint: string) => Promise<void>;

/** The outcome of a web-push run — surfaced in the cron response. */
export interface PushSummary {
  /** Notifications the push service accepted. */
  sent: number;
  /** Notifications that failed (error or expired endpoint). */
  failed: number;
}

/**
 * Send the daily reminder push to every subscription (pure — I/O injected).
 *
 * - When `send` is `null` (web push not configured) it's a safe no-op: 0/0.
 * - Never throws: a failure for one subscription is tallied and the run
 *   continues. When a send reports `expired`, the row is pruned via
 *   `deleteExpired` (best-effort — a delete failure is swallowed).
 */
export async function sendWebPush(
  subscriptions: readonly PushSubscriptionRow[],
  send: SendPush | null,
  deleteExpired: DeleteSubscription | null,
  slot: ReminderSlot = 'evening',
  appUrl: string = DEFAULT_APP_URL,
): Promise<PushSummary> {
  if (send === null) return { sent: 0, failed: 0 };
  const payload = JSON.stringify(buildReminderPush(slot, appUrl));
  let sent = 0;
  let failed = 0;
  for (const row of subscriptions) {
    let result: { ok: boolean; expired?: boolean };
    try {
      result = await send(row.subscription, payload);
    } catch {
      result = { ok: false };
    }
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (result.expired && deleteExpired) {
        try {
          await deleteExpired(row.endpoint);
        } catch {
          // Pruning is best-effort — a stale row is harmless (skipped next run).
        }
      }
    }
  }
  return { sent, failed };
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
  slot: ReminderSlot = 'evening',
  appUrl: string = DEFAULT_APP_URL,
): Promise<ReminderSummary> {
  const email = buildReminderEmail(slot, appUrl);
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
