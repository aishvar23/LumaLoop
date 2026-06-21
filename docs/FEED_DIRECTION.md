# LumaLoop — Feed Direction (proposed)

> **Status:** DRAFT for approval. This document proposes a new product direction
> that **supersedes** the session-based model in `PROTOTYPE_DESIGN.md` /
> `PROTOTYPE_TECHNICAL_DESIGN.md`. Those specs explicitly describe a *bounded,
> timed session with a receipt* and *"no infinite scroll"*; the build to date
> faithfully implemented them. This pivot replaces that experience with a
> **TikTok/Reels-style endless feed of mini-games with creator profiles**. On
> approval, the authoritative docs will be revised (or marked superseded by this
> one). Until then, this is the single source of truth for the new direction.

---

## 1. Vision (one line)

**LumaLoop is an endless, full-screen, swipeable feed of bite-sized mini-games —
like TikTok, but every "post" is a game you can play, made by a creator you can
follow.**

## 2. What changes vs. what stays

**Stays (reused as-is):**
- The **four games** (`spot_it`, `what_changed`, `rule_flip`, `tiny_logic`) —
  renderers + pure evaluators. Each game is a self-contained playable unit.
- The **card catalog** (data-driven), including the existing `creatorHandle` on
  every card.
- The **telemetry pipeline** (client → `/api/event` → Supabase) and the **deploy**.
- **Card composition / seeded ordering** — repurposed to generate the endless feed.

**Rebuilt:**
- The **shell + progression**: a bounded "session that completes" → an **infinite
  feed** with **swipe** navigation and **skip** semantics.
- `FeedFrame`: a static one-card frame → a **full-screen vertical snap-scroll**
  surface (one game per screen).

**Removed / repurposed:**
- **Start-screen mode-choice** (1-/3-min) → gone. App opens straight into the feed.
- **End-of-session receipt** → gone as a forced screen. Stats move to an on-demand
  **"Your activity"** view.
- **Exit / intentional-continue** ceremony → gone (there is no session to exit).

**New (creator platform, lightweight):**
- **Creator profiles** — tappable `@handle` → a profile page (their games, bio,
  avatar, follow button).
- **Local follow** (no accounts) — follow creators; a **Following** feed.

## 3. Core experience

### 3.1 The feed
- **Full-screen swipe:** one game fills the viewport; **swipe up** = next game,
  **swipe down** = previous. Vertical CSS scroll-snap; keyboard/space + a11y
  fallback for non-touch.
- **Endless:** the feed never ends. Games are drawn from the catalog via the
  seeded composer, reshuffled/cycled so a user keeps getting content (and new
  authored games appear automatically). No progress bar, no "N of M".
- **A game becomes "active"** when it snaps into view — that (not mount) is when
  its timer may arm and when `Card_Rendered` fires (already the telemetry rule).

### 3.2 Playing vs. skipping (free scroll)
- A user may **swipe past any game without playing it.** Swiping away from an
  **un-engaged** game is a **skip** — no score, nothing marked wrong.
- The per-game **timer arms only on first interaction** (engagement), not on
  becoming active. Swipe away before engaging → skip, not timeout.
- If a user **engages then swipes away** before resolving → treat as an
  **abandoned attempt** (distinct from a clean skip) for honest signal.
- Resolution outcomes for a *played* game are unchanged (`correct` / `incorrect`
  / `timeout` via the existing evaluators + `useCardTimer`).

### 3.3 Creator byline + profiles
- Each game shows its **`@creatorHandle`** as a byline (data already exists).
- Tapping the handle opens **`/u/:handle`** — the creator's profile:
  - avatar, display name, bio, follower-context (see §5 on counts),
  - a **grid/list of that creator's games** (filtered from the catalog),
  - a **Follow / Following** toggle.
- Tapping a game in a profile opens it in the feed (or a single-game view).

### 3.4 Follow + Following feed (local, no login)
- **Follow is device-local**, stored against the existing anonymous id (no
  accounts, no PII). It does **not** sync across devices.
- A **Following** feed filters the endless feed to games by followed creators
  (falls back to "discover" when you follow no one / run low).
- **Follower *counts* are not real** in this phase (no shared graph). We either
  hide counts or show only "Following / Not following" state. (Real counts need
  accounts + a server graph — deferred, see §8.)

### 3.5 Your activity (on-demand, replaces the receipt)
- A view the user opens deliberately (not forced): personal stats from local
  state / telemetry — games played, current streak, categories touched, skip vs.
  play rate. **No ability/IQ/clinical claims** (positioning guardrails preserved).

### 3.6 First-run notice
- The **one-time anonymous-data / non-assessment notice** (§21.8) is preserved —
  shown once before/over the first feed view, then dismissed. This is the only
  remaining "gate" before the feed.

## 4. Information architecture / routes
- `/` — the **endless feed** (default: Discover; toggle to **Following**).
- `/u/:handle` — a **creator profile**.
- `/c/:cardId` — a **single game** (share/deep-link target; also finally makes
  this route a real playable surface, closing the current placeholder gap).
- `/you` (or a sheet) — **Your activity** (personal stats) + your **Following** list.

## 5. Data model
- **Card** (unchanged) keeps `creatorHandle: string`.
- **Creator** (new, data-driven, authored like cards): `handle`, `displayName`,
  `bio`, `avatar` (emoji/initials/asset — TBD, see §9), derived `games` =
  catalog filtered by `creatorHandle`. Lives in a `src/creators/` catalog with
  startup validation (every `creatorHandle` used by a card must resolve to a
  Creator; reuse the catalog-validation pattern).
- **Local follow store** (new): a small, best-effort localStorage set keyed on
  the anonymous id (mirrors `anonymousUser.ts` / retry-queue patterns — wrapped,
  never throws). Pure, injectable, unit-tested.

## 6. Telemetry implications
The DB columns are intentionally TEXT and `event_name` is free-form, so **new
event names need NO migration** — only an addition to `TelemetryEventNames` (and
the ingestion whitelist). Proposed changes:
- **Keep & remap:** `Card_Rendered` (game snaps active), `Card_Attempted` (first
  interaction), `Card_Resolved`, `Card_Explanation_Viewed`,
  `Return_Session_Started` (a return visit — the **headline organic-return metric
  still applies**, `source: 'direct'`), `Session_Initialized` (now "feed opened"),
  `Session_Abandoned` (left the app).
- **Retire:** `Session_Completed`, `Exit_Clicked`, `Intentional_Continue_Clicked`
  (no session ceremony).
- **Add:** `Card_Skipped` (swiped past un-engaged), `Card_Abandoned` (engaged then
  swiped away), `Creator_Profile_Viewed`, `Creator_Followed`, `Creator_Unfollowed`.
  Add a `creator_handle` column? — not required (can reuse `card_id`/derive), but
  a nullable `creator_handle` TEXT column would make creator analytics clean (one
  small additive migration). **Decision flagged (§9).**
- **Skip-rate and play-through become primary feed metrics** alongside return.

## 7. What stays true (guardrails carried forward)
- **Anonymous, no PII**; best-effort local identity; IP/UA stripped at ingestion.
- **No ability/IQ/brain-training/clinical/employment claims** in any copy
  (Design §7 / §21.8) — including profiles and activity.
- **No arbitrary creator code** — creators contribute games only via the manual
  concierge intake; the feed renders typed, reviewed cards only.
- **Extensibility** — adding a new game stays "1 config + 1 type + 1 map entry +
  1 renderer/evaluator + author cards"; the feed/profile/follow layers are
  template-agnostic.

## 8. Out of scope (deferred — unchanged from the platform roadmap)
- **Accounts / login**, real cross-device follow graph, **real follower counts**.
- **Creator self-service editor / upload / publishing**, moderation queue.
- Payments, leaderboards, recommendation/ranking systems, comments.
- Category **performance history** as scored "traits" (telemetry-calibrated
  scoring stays deferred).

## 9. Open questions / assumptions to confirm
1. **Avatars:** emoji or generated initials/monogram for now (no image uploads)?
   *(Assumption: initials/emoji — cheap, no asset pipeline.)*
2. **Your activity contents:** exact stats to show (games played, streak, skip
   rate, category mix)? Any of these off-limits per guardrails?
3. **`creator_handle` telemetry column:** add the one nullable column now (clean
   creator analytics) or derive later? *(Assumption: add it — additive, cheap.)*
4. **Following fallback:** when you follow no one / exhaust their games, blend in
   Discover? *(Assumption: yes.)*
5. **Timer in a feed:** keep per-game time limits (engaging starts the clock) —
   confirm timed play still fits the casual feed vibe, or make timing optional.

## 10. Phased build plan
Each phase is independently shippable; gate (lint/typecheck/test/build) stays
green throughout; tests for every change.

- **Phase 1 — Feed shell pivot (core UX).**
  Infinite feed controller (endless seeded ordering, reshuffle) replacing the
  bounded session; full-screen vertical **swipe/snap** `FeedFrame`; **skip /
  engage-then-abandon** semantics + timer-arms-on-engage; open straight into the
  feed; preserve the one-time data notice; remove start-screen/receipt/exit. Keep
  the four games + composition + telemetry wiring. Rework telemetry events
  (retire session-ceremony events; add `Card_Skipped`/`Card_Abandoned`).
- **Phase 2 — Creator byline + profiles.**
  `src/creators/` catalog (+ validation); tappable byline; `/u/:handle` profile
  page (games + bio + avatar); make `/c/:cardId` a real single-game surface.
  Add `Creator_Profile_Viewed` (+ optional `creator_handle` column).
- **Phase 3 — Local follow + Following feed + Your activity.**
  Local follow store (anon-id keyed, best-effort); follow/unfollow on profiles;
  **Following** feed filter; **Your activity** view (personal stats). Add
  `Creator_Followed`/`Creator_Unfollowed`.
- **Phase 4 — Polish, telemetry views, QA.**
  Analysis SQL views for the feed metrics (skip-rate, return, per-creator);
  on-device QA; performance pass (snap-scroll, lazy game mounting); accessibility.

## 11. Reusable assets confirmed present
- Games/renderers/evaluators: `src/templates/*` + `src/session/rendererRegistry.ts`.
- Catalog + `creatorHandle`: `src/cards/`.
- Telemetry: `src/telemetry/*` + `api/event.ts` (live, verified).
- Composition/seeding: `src/session/composeSession.ts`.
- Deploy: Vercel project `luma-loop` (auto-deploys on push to `main`).
