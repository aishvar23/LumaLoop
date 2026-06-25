# LumaLoop — Session Handoff (2026-06-25)

Pick-up notes for continuing the **accounts + social + games-expansion** work in a
fresh session. Read this first, then `CLAUDE.md`, `docs/DESIGN_AND_PROGRESS.md`,
`docs/FEED_DIRECTION.md`, `docs/AUTH_SETUP.md`.

## Latest changes (Home landing + reminder emails + Upload-puzzle CTA)
Added on top of the stack below (web + mobile, gates green — web 1023 tests +
build, mobile 760 tests):
- **Home / Discover landing page** is now the DEFAULT post-login surface, so you
  no longer drop straight into a game card. **Routing changed: `/` is Home, the
  feed moved to `/feed`** (`src/app/routes.ts` — `ROUTES.home`/`ROUTES.feed`).
  Home shows a greeting, a stats snapshot (reuses `computeStats` +
  `fetchGamePlays`), featured-game tiles (pure `src/cards/featured.ts`), and a
  "Start playing" CTA → feed. Web: `src/profile/HomePage.tsx`. Mobile:
  `mobile/src/HomeScreen.tsx` (App.tsx `view` now defaults to `'home'`; a small
  Home/You overlay nav on the feed). A tiny `.feed-nav` overlay (Home / You) was
  added to `src/feed/FeedRoute.tsx`.
- **"Upload puzzle" button** (greyed, "coming soon") on Home, both platforms — not
  built; hover (web tooltip) / click both reveal a "coming soon" notice.
- **Daily reminder emails**: Vercel Cron (`vercel.json`, 09:00 UTC) →
  `api/daily-reminder.ts` (Edge), a thin wrapper over the pure, tested core
  `src/email/reminderCore.ts`. Lists users via the Supabase Auth admin API
  (service-role) and sends via **Resend**. **Sending is GATED on `RESEND_API_KEY`
  + `REMINDER_FROM`** — unset ⇒ safe no-op (everyone "skipped", zero emails), so
  the cron is harmless until you wire email. Caller is authed via `CRON_SECRET`
  (`Authorization: Bearer …`). **Not yet deployed** — set the Vercel envs
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `RESEND_API_KEY`
  + `REMINDER_FROM` + a verified Resend sender domain) to go live.

## ⚠️ TOP BLOCKER — GitHub account suspended
`git push` and `gh` fail with **403 "Your account was suspended"** (owner:
`aishvar23`). All recent work is **committed locally only** and CANNOT be pushed
until the suspension is resolved with GitHub Support. Until then: keep committing
locally, do NOT attempt pushes/PRs.

## Where work happens (two checkouts, one shared .git)
- **This assistant works in the git worktree** `/Users/vandanapersonal/gitRepo/LumaLoop-worktree`
  on branch **`task/likes-comments`**.
- **Codex works in the main checkout** `/Users/vandanapersonal/gitRepo/LumaLoop`
  (branch `codex/visual-feed-complex-games`). DO NOT touch the main checkout.
- They share the same `.git`, so each other's committed branches are visible
  without pushing. Sync from `main`/branches with `git merge` (default = merge,
  not rebase).

## Branch / PR state
- **`task/likes-comments`** (HEAD `10f2568`) is the big stack = everything below.
  It is **25 commits ahead of `origin/main`**; the **last 13 commits (from
  `366d405` onward) are NOT on the remote** (push blocked by the suspension).
- PRs (pre-suspension; can't be updated/verified now):
  - **#58** `task/auth-profiles-schema` → `main`: accounts pivot (auth + profiles + game_plays).
  - **#60** `task/per-user-game-scores` → `#58`: per-user scores + skip-already-played.
  - **#61** `task/likes-comments` → `#60`: likes/comments + **all later work** (its
    remote tip is stale at `55085a7`; local has 13 more commits).
  - **#59** `codex-games-recovered` → `main`: my recovery of Codex's WIP — now
    **redundant** (Codex pushed the identical `fb87fd3`, which is merged into this
    stack). Close #59 when GitHub is back.
- **Intended merge order into `main`:** #58 → #60 → #61. (#59 is redundant; the
  Codex revamp is already merged inside #61 via merge commit `606652c`.)

## What's been built (all local, gates green: web ~1007 tests, mobile ~751)
**Accounts / social pivot (supersedes the old anonymous/no-PII guardrail — owner's
decision):**
- Supabase **Auth gates the feed**: login (Google/Apple/Facebook + email magic
  link) → profile creation → feed. Web (`src/auth/*`) + mobile (`mobile/src/auth/*`).
- **Profiles** (`public.profiles`) + **per-user game history** (`public.game_plays`)
  + **per-game score view** (`public.user_game_scores`) + **likes/comments**
  (`public.game_likes`, `public.game_comments`). All RLS-protected. Migrations
  `supabase/migrations/0002..0004` (applied to Supabase).
- **/you profile**: chart-driven, color-tinted (stat cards, per-category accuracy
  bars, points-share, "Your games").
- **Feed**: skip games you've **solved** (ever_correct), per-game scores, social
  rail (likes + comments) per card.
**Games expansion:** **17 mechanics, 155 cards** (~50 new, skewed medium/hard).
New mechanics added this effort: `word_unscramble`, `quick_math`, `color_word`
(Stroop), `n_back`, `odd_one_out`, `schulte_order` — plus Codex's `circuit_flow`,
`signal_set`, and the earlier `prism_path`, `code_break`.
**Recent fixes (all local):** mobile OAuth "invalid flow state" (bare-code exchange
+ WebCrypto polyfill); profile back-button safe-area; MCQ option shuffle (correct
was always 1st); color_word gap-tap scoring; schulte hint removal + harder cards;
score/streak HUD vs profile-button overlap; ambiguous word_unscramble distractors
+ validation guard; signal_set demo; schulte-003 retiered easy/8s; **countdown now
starts on card APPEAR (activation) for the 12 immediate-play mechanics** (pre-phase
games — memory_sequence/what_changed/n_back/color_word/rule_flip — still start at
their round-start).

## Supabase (project `pnygisdojhxzbqubyeln`)
- URL `https://pnygisdojhxzbqubyeln.supabase.co`; publishable key
  `sb_publishable_BZFGwj2BJDVHFlrK8EAv_g_PgYg6Ax4` (NOT secret; in `.env.local`
  web / `mobile/.env*`).
- Tables: `telemetry_events` (anon, deny-all), `profiles`, `game_plays`,
  `game_likes`, `game_comments` (+ `user_game_scores` view). RLS verified; security
  advisor clean except the intentional telemetry deny-all.

## OAuth setup status (see `docs/AUTH_SETUP.md`)
- **Done:** Supabase URL config (Site URL `http://localhost:5173`; redirect allowlist
  incl. `http://localhost:5173/auth/callback` + `lumaloop://auth/callback`); **Google
  enabled** (reused the `behavioralintelligence` Google Cloud project, web OAuth
  client → Supabase). Email magic link works.
- **Verified live end-to-end on mobile:** Google sign-in → profile (`@vandana`) →
  feed → play/like/comment all write to the DB. ✅
- **Pending:** Apple + Facebook providers (steps in AUTH_SETUP §3–§4); production
  Site URL/redirects for the deployed app; custom SMTP for magic link at scale.

## Running the mobile app (simulator)
- Metro must be started from the **worktree**, persistent, cleared cache:
  `CI=1 npm --prefix /Users/vandanapersonal/gitRepo/LumaLoop-worktree/mobile run start -- --clear`
  (CI=1 keeps it from self-exiting in background; `expo` isn't on PATH — use the
  npm script).
- Open in the booted iOS Simulator (Expo Go installed): launch Expo Go
  (`xcrun simctl launch booted host.exp.Exponent`) then
  `xcrun simctl openurl booted "exp://127.0.0.1:8081"`. Reload after code changes by
  re-running the bundle build + reopening.
- **Can't tap the simulator programmatically** (AppleScript blocked) — the human
  must tap; the assistant can screenshot via `xcrun simctl io booted screenshot`.

## Quality gates (run in the worktree, must stay green)
- Web: `npm run lint && npm run typecheck && npm test && npm run build`
- Mobile: `cd mobile && npx tsc --noEmit && npm test`
- Web↔mobile pure core (cards/types/validation/evaluators) kept in lock-step
  (header-only diff). Engine stays template-agnostic (no `switch` on templateType).

## Open / next
1. **Resolve the GitHub suspension**, then push `task/likes-comments`, update #61,
   close #59, and merge #58 → #60 → #61 into `main`.
2. Configure Apple + Facebook providers; set production Site URL/redirects + SMTP.
3. Optional: native Google sign-in (in-app picker) on mobile (needs iOS/Android
   OAuth clients + a dev build); update `CLAUDE.md`/design docs to formally reflect
   the accounts/PII pivot (currently still say "anonymous, no PII").
4. Optional hardening noted by sub-agents: validation cross-check of color_word
   `congruent` flag; native RN renderer unit tests for the new mechanics.
