/**
 * `GET /api/daily-reminder` — daily reminders (accounts pivot). A thin Vercel
 * wrapper around the pure core in `src/email/reminderCore.ts` (all logic + tests
 * live there), mirroring `api/event.ts` ← `src/telemetry/ingest.ts`.
 *
 * Invoked twice a day by Vercel Cron (see `vercel.json`). It:
 *   1. authenticates the caller (the cron secret),
 *   2. lists the signed-up users via the Supabase Auth admin API (service-role,
 *      SERVER-SIDE only — never shipped to the client), and
 *   3. sends each a reminder via Resend (email) AND delivers a web-push
 *      notification to every stored `push_subscriptions` row — each channel ONLY
 *      when it is configured.
 *
 * GATED SENDING: if `RESEND_API_KEY` (or `REMINDER_FROM`) is unset the email
 * transport is `null` and the core no-ops (everyone "skipped"); if the VAPID
 * keys are unset web push is skipped entirely. So nothing is ever sent until a
 * channel is wired — deploying the cron is harmless.
 *
 * RUNTIME: this runs on the Node.js runtime (NOT edge) because `web-push` is a
 * Node library (it needs Node's crypto for the VAPID/ECDH encryption).
 *
 * Env (set in Vercel project settings, server-side):
 *   - SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY    service_role JWT (admin; bypasses RLS)
 *   - CRON_SECRET                  shared secret; Vercel Cron sends it as
 *                                  `Authorization: Bearer <CRON_SECRET>`
 *   - RESEND_API_KEY               (optional) enables real sending via Resend
 *   - REMINDER_FROM                (optional) verified sender, e.g.
 *                                  "LumaLoop <hello@lumaloop.app>"
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
 *                                  (optional) enable web push; all three needed
 */
import webpush from 'web-push';

import {
  sendDailyReminders,
  sendWebPush,
  type PushSubscriptionRow,
  type PushSummary,
  type Recipient,
  type ReminderSlot,
  type SendEmail,
  type SendPush,
} from '../src/email/reminderCore';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REMINDER_FROM = process.env.REMINDER_FROM;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

/** How many users to request per admin-list page (GoTrue max is 1000). */
const PAGE_SIZE = 1000;
/** Safety cap so a paging bug can never loop forever. */
const MAX_PAGES = 100;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** List every user's email via the Supabase Auth admin API (paginated). */
async function listRecipients(): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`;
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY as string,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!response.ok) {
      throw new Error(`admin list users failed: ${response.status}`);
    }
    const body = (await response.json()) as { users?: Array<{ email?: string | null }> };
    const users = body.users ?? [];
    for (const user of users) {
      if (user.email) recipients.push({ email: user.email });
    }
    if (users.length < PAGE_SIZE) break; // last page reached.
  }
  return recipients;
}

/** Common Supabase REST admin headers (service-role; bypasses RLS server-side). */
function adminHeaders(): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY as string,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Fetch every stored web-push subscription via the Supabase REST admin path. */
async function listPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,subscription`;
  const response = await fetch(url, { headers: adminHeaders() });
  if (!response.ok) {
    throw new Error(`list push subscriptions failed: ${response.status}`);
  }
  const rows = (await response.json()) as PushSubscriptionRow[];
  return Array.isArray(rows) ? rows : [];
}

/** Delete one dead subscription row by endpoint (best-effort pruning). */
async function deletePushSubscription(endpoint: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;
  await fetch(url, { method: 'DELETE', headers: adminHeaders() });
}

/**
 * Build the web-push transport, or `null` when VAPID isn't configured (gated).
 * Configures the shared VAPID details once, then encrypts + delivers each push
 * via `web-push`, flagging a gone endpoint (404/410) so its row gets pruned.
 */
function resolvePushTransport(): SendPush | null {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return async (subscription, payload) => {
    try {
      await webpush.sendNotification(
        subscription as webpush.PushSubscription,
        payload,
      );
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      return { ok: false, expired: status === 404 || status === 410 };
    }
  };
}

/** Run the web-push send (best-effort, gated). Never throws. */
async function runWebPush(
  slot: ReminderSlot,
  appUrl: string | undefined,
): Promise<PushSummary> {
  const transport = resolvePushTransport();
  if (transport === null) return { sent: 0, failed: 0 };
  const subscriptions = await listPushSubscriptions();
  return sendWebPush(
    subscriptions,
    transport,
    deletePushSubscription,
    slot,
    appUrl,
  );
}

/** Build the Resend transport, or `null` when email isn't configured (gated). */
function resolveTransport(): SendEmail | null {
  if (!RESEND_API_KEY || !REMINDER_FROM) return null;
  return async ({ to, subject, html, text }) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: REMINDER_FROM, to, subject, html, text }),
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: `resend ${response.status}` };
  };
}

export default async function handler(request: Request): Promise<Response> {
  // Only the scheduled cron (or an operator with the secret) may trigger a send.
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response(null, { status: 401 });
    }
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { error: 'supabase admin not configured' });
  }

  // Time-of-day slot from the cron path (`?slot=morning|evening`); the app link
  // to point at comes from REMINDER_APP_URL (the live deployment).
  const slot =
    new URL(request.url).searchParams.get('slot') === 'morning'
      ? 'morning'
      : 'evening';
  const appUrl = process.env.REMINDER_APP_URL || undefined;

  try {
    const recipients = await listRecipients();
    const transport = resolveTransport();
    const summary = await sendDailyReminders(
      recipients,
      transport,
      slot,
      appUrl,
    );
    // Web push runs alongside email, gated on its own VAPID config; a push
    // failure must not sink the email result, so isolate it (best-effort).
    let push: PushSummary = { sent: 0, failed: 0 };
    try {
      push = await runWebPush(slot, appUrl);
    } catch {
      push = { sent: 0, failed: 0 };
    }
    // No addresses/PII in the response — just counts (+ provider error strings).
    return json(200, {
      ...summary,
      slot,
      configured: transport !== null,
      push,
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : 'reminder run failed',
    });
  }
}
