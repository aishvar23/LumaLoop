-- Web Push subscriptions (engagement: browser push reminders).
--
-- One row per browser push subscription owned by a signed-in user. The client
-- upserts on the unique `endpoint`; the daily-reminder cron reads EVERY row via
-- the service role (which bypasses RLS) and sends a Web Push to each. No PII
-- beyond the push endpoint (which is a provider URL, not an address).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  -- Full PushSubscription JSON (endpoint + keys.p256dh + keys.auth).
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Users manage ONLY their own subscriptions. The cron sends via the service
-- role, which bypasses RLS, so no broad SELECT policy is needed.
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
