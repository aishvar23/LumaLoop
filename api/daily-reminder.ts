/**
 * `GET /api/daily-reminder` — daily reminder emails (accounts pivot). A thin
 * Vercel Edge wrapper around the pure core in `src/email/reminderCore.ts` (all
 * logic + tests live there), mirroring `api/event.ts` ← `src/telemetry/ingest.ts`.
 *
 * Invoked once a day by Vercel Cron (see `vercel.json`). It:
 *   1. authenticates the caller (the cron secret),
 *   2. lists the signed-up users via the Supabase Auth admin API (service-role,
 *      SERVER-SIDE only — never shipped to the client), and
 *   3. sends each a reminder via Resend — but ONLY when email is configured.
 *
 * GATED SENDING: if `RESEND_API_KEY` (or `REMINDER_FROM`) is unset, the transport
 * is `null` and the core no-ops (everyone "skipped"), so nothing is ever sent
 * until email is wired. Deploying the cron is therefore harmless.
 *
 * Env (set in Vercel project settings, server-side):
 *   - SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY    service_role JWT (admin; bypasses RLS)
 *   - CRON_SECRET                  shared secret; Vercel Cron sends it as
 *                                  `Authorization: Bearer <CRON_SECRET>`
 *   - RESEND_API_KEY               (optional) enables real sending via Resend
 *   - REMINDER_FROM                (optional) verified sender, e.g.
 *                                  "LumaLoop <hello@lumaloop.app>"
 */
import {
  sendDailyReminders,
  type Recipient,
  type SendEmail,
} from '../src/email/reminderCore';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REMINDER_FROM = process.env.REMINDER_FROM;

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
    // No addresses/PII in the response — just counts (+ provider error strings).
    return json(200, { ...summary, slot, configured: transport !== null });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : 'reminder run failed',
    });
  }
}
