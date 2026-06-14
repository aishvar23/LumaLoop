-- LumaLoop telemetry store (prototype)
-- Tasks: ADO #43 (table + eventId dedup + indexes), #44 (RLS insert-only).
--
-- Design notes (see CLAUDE.md §5, §6):
--   * One append-only table. The browser NEVER writes here directly; it POSTs to
--     the /api/event Vercel function, which validates the payload and inserts
--     using the service_role key (bypasses RLS). RLS is enabled with NO policies,
--     so anon/authenticated clients can neither read nor write.
--   * Categorical columns (event_name, template_type, category, ...) are TEXT,
--     not Postgres ENUMs, on purpose: adding a new challenge template/game must
--     not require a DB migration (extensibility, CLAUDE.md §6). Validity is
--     enforced at the ingestion boundary against the TypeScript unions.
--   * event_id is a CLIENT-generated UUID and the PRIMARY KEY, giving idempotent
--     dedup for the client retry queue (Technical Design §10).
--   * No PII: no IP/User-Agent/name/email columns. IP/UA are dropped at /api/event.

create table if not exists public.telemetry_events (
  event_id               uuid        primary key,
  event_name             text        not null,
  anonymous_user_id      text        not null,
  session_id             text        not null,
  timestamp_ms           bigint      not null,
  card_id                text,
  card_index             integer,
  template_type          text,
  category               text,
  evidence_tier          text,
  difficulty             text,
  route_kind             text,
  source                 text,
  elapsed_ms             integer,
  interaction_elapsed_ms integer,
  is_correct             boolean,
  resolution_type        text,
  attempt_count          integer,
  abandoned_at_card_index integer,
  measured_signals       text[],
  received_at            timestamptz not null default now()
);

comment on table public.telemetry_events is
  'Append-only prototype telemetry. Written only by the /api/event ingestion function (service_role). RLS denies all client access.';
comment on column public.telemetry_events.event_id is
  'Client-generated UUID; PRIMARY KEY enables idempotent insert for the retry queue.';

-- Indexes for the real access patterns (CLAUDE.md §5):
--   per-user return behavior, per-event funnels, per-session rollups.
create index if not exists idx_telemetry_user_ts
  on public.telemetry_events (anonymous_user_id, timestamp_ms);
create index if not exists idx_telemetry_event_name
  on public.telemetry_events (event_name);
create index if not exists idx_telemetry_session
  on public.telemetry_events (session_id);

-- RLS on, no policies => clients (anon key) get zero access.
-- The ingestion function uses service_role, which bypasses RLS.
alter table public.telemetry_events enable row level security;

-- Defense in depth: ensure the anon/authenticated roles hold no table grants.
revoke all on public.telemetry_events from anon, authenticated;
