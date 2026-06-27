-- Harden the public per-user stats aggregate (security review).
--
-- 0006 exposed `public.user_public_stats` as a SECURITY DEFINER *view*, which the
-- Supabase linter flags as an ERROR (a definer view silently bypasses the querying
-- user's RLS — a footgun, even though ours only exposed aggregates). Replace it
-- with a SECURITY DEFINER *function* with a PINNED search_path: the recommended,
-- linter-clean pattern. It still returns ONLY the aggregate (games/correct/points)
-- for a given user — never raw plays or PII — so another user's profile can show
-- stats while their raw `game_plays` stay self-only under RLS.

drop view if exists public.user_public_stats;

create or replace function public.user_public_stats(target uuid)
returns table (
  games_played  bigint,
  correct_count bigint,
  total_points  bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    count(*)::bigint                            as games_played,
    count(*) filter (where is_correct)::bigint  as correct_count,
    coalesce(sum(points), 0)::bigint            as total_points
  from public.game_plays
  where user_id = target;
$$;

comment on function public.user_public_stats(uuid) is
  'Public per-user game aggregate (counts + points only; no raw rows / PII). '
  'SECURITY DEFINER with a pinned search_path so another user''s profile can show '
  'stats without exposing self-only game_plays.';

-- Lock down execution: only authenticated users may call it (not anon/public).
-- Supabase's default privileges also grant EXECUTE on new public functions to the
-- `anon` role, so revoke that explicitly — unauthenticated callers must not be able
-- to read anyone's stats via /rest/v1/rpc.
revoke all on function public.user_public_stats(uuid) from public;
revoke execute on function public.user_public_stats(uuid) from anon;
grant execute on function public.user_public_stats(uuid) to authenticated;
