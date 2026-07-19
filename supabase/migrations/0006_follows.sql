-- LumaLoop social: follow graph + public per-user stats aggregate.
-- Part of the accounts/social pivot (Phase 2/3): users can follow each other, the
-- Home status rail can filter to followed users, and another user's profile can
-- show their aggregate game stats without exposing their raw play history.
--
-- Design notes (CLAUDE.md §5):
--   * follows: (follower_id, followee_id) PK = one edge per pair, idempotent
--     follow/unfollow. Both FK profiles(id) ON DELETE CASCADE; a self-follow is
--     rejected by a CHECK. Follows are PUBLIC (select using(true)) so follower/
--     following counts and "do I follow X?" are visible to any authenticated user;
--     a user may only insert/delete edges where they are the FOLLOWER.
--   * user_public_stats: a VIEW aggregating game_plays per user (count, correct
--     count, total points). game_plays is self-only under RLS, so the view is
--     created security_invoker=false (DEFINER) and granted to authenticated — it
--     exposes ONLY the aggregates (never raw rows / PII), so another user's profile
--     can show games-played / accuracy / points. Accuracy is derived client-side.
--   * Indexes match the access patterns: list who a user follows (follower_id),
--     count a user's followers (followee_id).

create table if not exists public.follows (
  follower_id uuid        not null references public.profiles (id) on delete cascade,
  followee_id uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

comment on table public.follows is
  'Directed follow edges (follower → followee). Public-readable; self-writable via RLS.';

alter table public.follows enable row level security;

drop policy if exists "follows_select_authenticated" on public.follows;
create policy "follows_select_authenticated"
  on public.follows for select
  to authenticated
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_followee_idx on public.follows (followee_id);

-- ---------------------------------------------------------------------------
-- user_public_stats: public per-user aggregate (no raw plays exposed).
-- ---------------------------------------------------------------------------
drop view if exists public.user_public_stats;
create view public.user_public_stats
  with (security_invoker = false) as
select
  user_id,
  count(*)                                  as games_played,
  count(*) filter (where is_correct)        as correct_count,
  coalesce(sum(points), 0)                  as total_points
from public.game_plays
group by user_id;

comment on view public.user_public_stats is
  'Public aggregate of game_plays per user (counts + points only; no raw rows). '
  'Definer view so another user''s profile can show stats without self-only RLS.';

grant select on public.user_public_stats to authenticated;
