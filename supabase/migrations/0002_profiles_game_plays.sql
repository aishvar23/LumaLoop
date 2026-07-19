-- LumaLoop accounts: user profiles + per-user game stats.
-- Part of the accounts pivot (real OAuth accounts gate the feed; the profile
-- shows stats of games played). Supersedes the prior anonymous/no-PII framing
-- for these user-owned tables; telemetry_events remains anonymous and untouched.
--
-- Design notes (see CLAUDE.md §5):
--   * Auth itself lives in Supabase's managed `auth` schema (auth.users). These
--     public tables hang off auth.users via FK with ON DELETE CASCADE, so
--     deleting an account removes its profile + play history (privacy/GDPR).
--   * RLS is the security boundary (no trusted server in front of these): a user
--     may read all profiles (public, IG/TikTok-style) but write only their OWN
--     profile row, and may read/write only their OWN game_plays rows.
--   * Categorical columns (template_type, category) are TEXT, not ENUMs, so a new
--     challenge template never needs a DB migration (extensibility, CLAUDE.md §6).
--   * Indexes match the real access patterns: the /you profile reads a user's
--     recent plays (user_id, played_at desc) and per-category aggregates
--     (user_id, category).

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user (1:1 with auth.users).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  handle       text        not null unique,
  display_name text        not null,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- IG/TikTok-style handle: lowercase letters, digits, underscore; 3-20 chars.
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 160)
);

comment on table public.profiles is
  'One profile per authenticated user (1:1 auth.users). Public-readable; self-writable via RLS.';

alter table public.profiles enable row level security;

-- Any authenticated user can read any profile (profiles are public).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user can create only their own profile row.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- A user can update only their own profile row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger (shared helper).
-- ---------------------------------------------------------------------------
-- search_path pinned to '' to avoid a mutable-search_path security warning
-- (now() resolves from pg_catalog, which is always present).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- game_plays: one row per resolved card, owned by the player. Powers the
-- per-user stats on the profile. Separate from anonymous telemetry_events.
-- ---------------------------------------------------------------------------
create table if not exists public.game_plays (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  card_id       text        not null,
  template_type text        not null,
  category      text        not null,
  is_correct    boolean     not null,
  points        integer     not null default 0,
  elapsed_ms    integer,
  played_at     timestamptz not null default now(),
  constraint game_plays_points_nonneg check (points >= 0),
  constraint game_plays_elapsed_nonneg check (elapsed_ms is null or elapsed_ms >= 0)
);

comment on table public.game_plays is
  'Per-user resolved-card history powering profile stats. Self-owned via RLS.';

alter table public.game_plays enable row level security;

-- A user can insert only their own plays.
drop policy if exists "game_plays_insert_own" on public.game_plays;
create policy "game_plays_insert_own"
  on public.game_plays for insert
  to authenticated
  with check (auth.uid() = user_id);

-- A user can read only their own plays.
drop policy if exists "game_plays_select_own" on public.game_plays;
create policy "game_plays_select_own"
  on public.game_plays for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists game_plays_user_played_idx
  on public.game_plays (user_id, played_at desc);
create index if not exists game_plays_user_category_idx
  on public.game_plays (user_id, category);
