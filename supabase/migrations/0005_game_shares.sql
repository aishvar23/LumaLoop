-- LumaLoop social: ephemeral game "status" shares.
-- Part of the accounts/social pivot. When a user plays a game they can SHARE it;
-- shares surface on Home as per-user "status" bubbles (WhatsApp/IG style) and
-- EXPIRE after 24 hours. A share captures the game + the player's result.
--
-- Design notes (CLAUDE.md §5):
--   * user_id FKs to public.profiles(id) (not auth.users) so PostgREST can EMBED
--     the sharer's handle + display_name + avatar_url in one request
--     (e.g. select('id, card_id, outcome, points, created_at,
--      profiles(handle, display_name, avatar_url)')). profiles.id is auth.users.id
--     with ON DELETE CASCADE, so deleting an account cascades its shares away.
--   * EPHEMERAL via RLS: the SELECT policy only exposes rows from the last 24h, so
--     a share "disappears" everywhere automatically once it ages out — no client
--     logic and no cleanup job required (an optional purge cron could hard-delete
--     aged rows later; reads already hide them).
--   * Shares are PUBLIC social data: any authenticated user may read recent shares;
--     a user may only INSERT/DELETE their OWN rows (RLS, auth.uid() = user_id).
--   * outcome is constrained to the resolution vocabulary; points is the GAME-points
--     value the result card showed (>= 0). card_id is TEXT (catalog convention; no
--     FK to a cards table — cards are data-driven in the app, not a DB table).
--   * Indexes match the access pattern: load recent shares newest-first
--     (created_at desc); group/expire a user's shares (user_id, created_at desc).

create table if not exists public.game_shares (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  card_id    text        not null,
  outcome    text        not null check (outcome in ('correct', 'incorrect', 'timeout')),
  points     integer     not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

comment on table public.game_shares is
  'Ephemeral game "status" shares (24h). Recent rows public-readable; self-writable via RLS.';

alter table public.game_shares enable row level security;

-- Read: any authenticated user, but ONLY shares from the last 24 hours (ephemeral).
drop policy if exists "game_shares_select_recent" on public.game_shares;
create policy "game_shares_select_recent"
  on public.game_shares for select
  to authenticated
  using (created_at > now() - interval '24 hours');

-- Write: a user may only insert their own shares.
drop policy if exists "game_shares_insert_own" on public.game_shares;
create policy "game_shares_insert_own"
  on public.game_shares for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Delete: a user may remove their own status.
drop policy if exists "game_shares_delete_own" on public.game_shares;
create policy "game_shares_delete_own"
  on public.game_shares for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists game_shares_recent_idx
  on public.game_shares (created_at desc);

create index if not exists game_shares_user_recent_idx
  on public.game_shares (user_id, created_at desc);
