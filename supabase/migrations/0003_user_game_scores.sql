-- LumaLoop per-user, per-game score aggregate.
-- Derives "best/latest score per game" + "already played" from the per-play
-- history in public.game_plays (migration 0002). A VIEW (not a table) keeps
-- game_plays the single source of truth — no extra writes, always consistent.
--
-- Design notes (CLAUDE.md §5):
--   * security_invoker = on so the view runs with the QUERYING user's
--     privileges; the self-only RLS on game_plays therefore applies and a user
--     sees only their own per-game rows (no separate policy needed on the view).
--   * Grouped aggregates (best_points, times_played, ever_correct) come from one
--     pass; the "last_*" fields (most recent play) come from a distinct-on pass,
--     joined on (user_id, card_id). template_type/category are taken from the
--     latest play (constant per card_id in practice).
--   * Powers: best/latest score per game, the profile "Your games" list, and the
--     feed's already-played skip (any row for a card ⇒ played).

create or replace view public.user_game_scores
with (security_invoker = on) as
with agg as (
  select
    user_id,
    card_id,
    count(*)            as times_played,
    max(points)         as best_points,
    bool_or(is_correct) as ever_correct,
    max(played_at)      as last_played_at
  from public.game_plays
  group by user_id, card_id
),
last_play as (
  select distinct on (user_id, card_id)
    user_id,
    card_id,
    template_type,
    category,
    points     as last_points,
    is_correct as last_is_correct
  from public.game_plays
  order by user_id, card_id, played_at desc
)
select
  a.user_id,
  a.card_id,
  l.template_type,
  l.category,
  a.times_played,
  a.best_points,
  l.last_points,
  a.ever_correct,
  l.last_is_correct,
  a.last_played_at
from agg a
join last_play l using (user_id, card_id);

comment on view public.user_game_scores is
  'Per-user, per-game score aggregate over game_plays (best/last points, times played, ever correct). security_invoker so game_plays RLS applies.';
