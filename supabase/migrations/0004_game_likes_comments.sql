-- LumaLoop social: per-game likes + comments.
-- Part of the accounts/social pivot. Each game (card) can be liked and commented
-- on by signed-in users; the feed loads a card's likes + comments when it opens.
--
-- Design notes (CLAUDE.md §5):
--   * user_id FKs to public.profiles(id) (not auth.users) so PostgREST can EMBED
--     the liker/commenter's handle + display_name in one request
--     (e.g. select('user_id, body, profiles(handle, display_name)')). Every actor
--     has a profile (profile creation is required before playing). profiles.id is
--     itself auth.users.id with ON DELETE CASCADE, so deleting an account still
--     cascades likes/comments away.
--   * Likes/comments are PUBLIC social data: any authenticated user may read them
--     (counts + who liked/commented), but may only write/delete their OWN rows
--     (RLS, with auth.uid() = user_id).
--   * game_likes PK (user_id, card_id) enforces one like per user per game and
--     makes the like-toggle an idempotent insert/delete.
--   * Comments are length-capped (1..280) by a CHECK; the client enforces the same.
--   * card_id is TEXT (matches the catalog/telemetry convention); no FK to a cards
--     table (cards are data-driven in the app, not a DB table).
--   * Indexes match the access pattern: load all comments for a card newest-first
--     (card_id, created_at desc); count/list likes for a card (card_id).

-- ---------------------------------------------------------------------------
-- game_likes: one like per (user, game).
-- ---------------------------------------------------------------------------
create table if not exists public.game_likes (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  card_id    text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

comment on table public.game_likes is
  'One like per user per game (card). Public-readable; self-writable via RLS.';

alter table public.game_likes enable row level security;

drop policy if exists "game_likes_select_authenticated" on public.game_likes;
create policy "game_likes_select_authenticated"
  on public.game_likes for select
  to authenticated
  using (true);

drop policy if exists "game_likes_insert_own" on public.game_likes;
create policy "game_likes_insert_own"
  on public.game_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "game_likes_delete_own" on public.game_likes;
create policy "game_likes_delete_own"
  on public.game_likes for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists game_likes_card_idx
  on public.game_likes (card_id);

-- ---------------------------------------------------------------------------
-- game_comments: length-capped comments per (user, game).
-- ---------------------------------------------------------------------------
create table if not exists public.game_comments (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  card_id    text        not null,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint game_comments_body_len check (char_length(body) between 1 and 280)
);

comment on table public.game_comments is
  'Length-capped (1..280) comments per game. Public-readable; self-writable via RLS.';

alter table public.game_comments enable row level security;

drop policy if exists "game_comments_select_authenticated" on public.game_comments;
create policy "game_comments_select_authenticated"
  on public.game_comments for select
  to authenticated
  using (true);

drop policy if exists "game_comments_insert_own" on public.game_comments;
create policy "game_comments_insert_own"
  on public.game_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "game_comments_update_own" on public.game_comments;
create policy "game_comments_update_own"
  on public.game_comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "game_comments_delete_own" on public.game_comments;
create policy "game_comments_delete_own"
  on public.game_comments for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists game_comments_card_created_idx
  on public.game_comments (card_id, created_at desc);
