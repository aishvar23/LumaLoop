/**
 * `POST /api/event` — telemetry ingestion (Azure DevOps #45, Technical Design
 * §10 / §16). A thin Vercel Edge function around the runtime-agnostic core in
 * `src/telemetry/ingest.ts` (all logic + tests live there).
 *
 * It validates the payload, drops IP/User-Agent and any non-§10 field (strict
 * whitelist mapping), and inserts into Supabase via PostgREST using the
 * service-role key — which stays SERVER-SIDE only (never shipped to the client).
 * `Prefer: resolution=ignore-duplicates` makes the insert idempotent on the
 * `event_id` primary key, so the client retry queue cannot double-count.
 *
 * Env (set in Vercel project settings, server-side — see #46):
 *   - SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY    service_role JWT (bypasses RLS)
 */
import {
  createIngestHandler,
  type PersistResult,
  type TelemetryEventRow,
} from '../src/telemetry/ingest';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Insert one row via PostgREST, idempotent on the event_id primary key. */
async function persist(row: TelemetryEventRow): Promise<PersistResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Misconfiguration: treat as a server error (handler maps to 500/502).
    return { ok: false, status: 503 };
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/telemetry_events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      // On event_id (PK) conflict, do nothing → idempotent retry dedup. Return
      // nothing to keep the response minimal.
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });

  return { ok: response.ok, status: response.status };
}

const handler = createIngestHandler({ persist });

export default handler;
