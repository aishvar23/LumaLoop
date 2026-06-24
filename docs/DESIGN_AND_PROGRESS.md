# LumaLoop — Design & Progress

> **Status:** living document. Consolidates the product direction (context) and the
> work completed to date. As of `main` @ `9e6b866`.
> Companion docs: `docs/FEED_DIRECTION.md` (the original pivot proposal),
> `docs/PROTOTYPE_DESIGN.md` / `docs/PROTOTYPE_TECHNICAL_DESIGN.md` (the original
> session-based prototype spec — **superseded** by the feed direction below for the
> product shape, still authoritative for card schema, telemetry §10, and guardrails),
> `mobile/RUN_IOS.md` (how to run the iOS app), `QA_VALIDATION_CHECKLIST.md`,
> `RUNBOOK_7DAY_TEST.md`.

---

## 1. Product vision

**LumaLoop is an endless, full-screen, swipeable feed of bite-sized mini-games —
like TikTok/Reels, but every "post" is a game you can play, made by a creator you
can follow.**

Core principles:
- **Feed-first.** The swipe *is* the product: full-screen vertical paging, one game
  per slide, swipe up for the next. Endless (the catalog cycles/reshuffles).
- **Free scroll.** You can swipe past any game without playing it (a *skip*, no
  penalty). The timer only starts once you *engage* (first interaction).
- **Authored.** Each game shows its creator `@handle`; creators are first-class
  (tappable profiles + follow are planned phases).
- **Anonymous, privacy-first.** No accounts, no PII; a best-effort local anonymous
  id only. Positioning guardrails: **performance categories, never IQ / brain-
  training / clinical / employment claims.**

### The pivot
The project began as a **bounded, timed "session" with a receipt** (the original
`PROTOTYPE_*` specs explicitly said *"no infinite scroll"*). After the first build
was complete, the product was re-aimed at a **TikTok-style endless game feed**. The
session ceremony (start screen / receipt / exit-continue) was retired; the app now
opens straight into the feed. See `docs/FEED_DIRECTION.md` for the original proposal.

---

## 2. Platforms & architecture

Two apps in one repo, sharing a **framework-agnostic core**:

| | Web app | Mobile app |
|---|---|---|
| Path | `src/` | `mobile/` |
| Stack | Vite + React + TypeScript | React Native + Expo (SDK 56) |
| Role | **source of truth** | hand-synced port |
| Gate | `npm run lint && npm run typecheck && npm test && npm run build` | `cd mobile && npx tsc --noEmit && npm test` |
| Tests | **512** | **313** |

- **`mobile/` is a self-contained sub-project** (own `package.json`/`node_modules`/
  jest). The two toolchains are isolated: root vitest is scoped to `src/`; root
  eslint/tsconfig ignore `mobile/`. The web gate must stay green when mobile changes.
- **Shared pure core** (DOM-free TypeScript) is authored in web `src/` and **ported
  by hand** into `mobile/src/core/` (card types, catalog incl. `creatorHandle`,
  validation, the per-template evaluators, `composeSession`, `feedDeck`, the
  telemetry event contract, timeout/`useCardTimer`). Each ported file carries a
  "source of truth is web `src/`; keep in sync" header; `mobile/src/core/README.md`
  documents the sync. (A shared workspace package is a future option.)

### Extensibility contract (how a new game is added — CLAUDE.md §6)
A new game = **localized** change: 1 typed `config` in the discriminated `LiquidCard`
union + 1 `TemplateType` + 1 `templateCategoryMap` entry + 1 **pure evaluator**
(source of truth for correctness/signals) + 1 **renderer** implementing the shared
`TemplateProps` contract (web) and 1 RN renderer (mobile) + authored cards. The feed
controller, telemetry, and feedback gate stay **template-agnostic** (no `switch` on
`templateType`).

Key contract pieces:
- `TemplateProps { card, context, isActive?, onAttempt, onResolve }`,
  `CardResolution`, `CardStartContext { activeAtMs, interactionEnabledAtMs, … }`.
- **`isActive`** — the feed's activation signal (true only for the focused slide).
  Multi-step/preview renderers gate their timed pre-phases on it so a pre-mounted
  off-screen slide doesn't run its watch/preview before you swipe to it.
- **`useCardTimer`** — shared timeout primitive; arms on engagement; emits
  `resolutionType:'timeout'` on expiry.

---

## 3. The games (11 mechanics)

Original 4 (single-step):
1. **Spot It** (`spot_it`, visual_attention) — tap the anomaly in a grid.
2. **What Changed** (`what_changed`, working_memory) — memorize a pattern (preview),
   then pick what changed.
3. **Rule Flip** (`rule_flip`, cognitive_flexibility) — respond to a stream; the rule
   flips partway.
4. **Tiny Logic** (`tiny_logic`, logical_reasoning) — single multiple-choice deduction.

New multi-step 3 (Phase G):
5. **Memory Sequence** (`memory_sequence`, working_memory) — watch tiles flash in
   order, then reproduce by tapping in order (watch → reproduce phases).
6. **Pattern Chain** (`pattern_chain`, pattern_recognition) — continue a sequence by
   picking the next item, then the next (2–3 sequential steps).
7. **Step Logic** (`step_logic`, logical_reasoning) — a premise + a chain of 2–3
   linked multiple-choice sub-questions, revealed sequentially.

New deductive game (Phase 6, inspired by gamesforthebrain.com):
8. **Code Break** (`code_break`, logical_reasoning) — a Mastermind / Bulls-and-Cows
   hidden-code game. The player builds a guess of N symbols from a palette, submits,
   and gets per-guess peg feedback (exact = right symbol + slot; partial = right
   symbol, wrong slot) computed by the pure evaluator with duplicate-safe counting.
   Multi-guess, deductive, with a strong "one more try" loop — the biggest step-change
   in challenge. Easy = 3 slots/4 symbols + generous guesses; hard = 5 slots/6 symbols,
   fewer guesses, tighter clock.
9. **Prism Path** (`prism_path`, logical_reasoning / pattern_recognition /
   working_memory) — rotate mirrors and trace a live beam through blockers to a
   target. The evaluator accepts any route that reaches the target, not only the
   authored orientation key.
10. **Signal Set** (`signal_set`, pattern_recognition / logical_reasoning) — select
    three visual signals whose shape, fill, and count are each all identical or
    all different. It adapts attribute-classification puzzles into an original,
    color-independent feed interaction using glyph, fill word, and count cues.
11. **Circuit Flow** (`circuit_flow`, logical_reasoning / pattern_recognition) —
    rotate a compact grid of circuit tiles until every arm meets a neighbor and
    every tile belongs to the source network. The pure evaluator performs graph
    traversal and rejects disconnected or leaking layouts.

Categories: visual_attention, working_memory, logical_reasoning, cognitive_flexibility,
pattern_recognition, processing_speed. Catalog validated at startup (unique ids, valid
template→category, time limits 5–120s, correct-answer present, explanation present,
evidence tier).

---

## 4. Telemetry (anonymous, no PII)

- **Client** posts each event to `/api/event`. Web: relative path. Mobile: absolute
  `EXPO_PUBLIC_API_BASE_URL` + `/api/event`. In-memory queue + immediate flush +
  capped retry queue (localStorage on web, AsyncStorage on mobile) deduped by a
  client-generated `eventId`.
- **Ingestion** (`api/event.ts`, Vercel Edge): validates the payload, **strips IP/UA
  and any non-§10 field** (strict whitelist), and upserts into Supabase
  `telemetry_events` with `resolution=ignore-duplicates` on the `event_id` PK
  (idempotent). Service-role key stays server-side; RLS denies all client access.
- **9 feed events:** `Session_Initialized` (feed opened), `Card_Rendered` (became
  active), `Card_Attempted` (engage), `Card_Resolved`, `Card_Explanation_Viewed`,
  `Card_Skipped`, `Card_Abandoned`, `Session_Abandoned` (left / app backgrounded),
  `Return_Session_Started` (return; the headline organic-return metric uses
  `source:'direct'`). Wired template-agnostically via the feed's lifecycle seams;
  each fires at most once per scope.

---

## 5. Infrastructure / deployment

- **Web** auto-deploys to **Vercel** (project `luma-loop`) on every push to `main`.
  Stable production alias: `https://luma-loop-madhursethji-7775s-projects.vercel.app`.
  ⚠️ Currently behind **Vercel Deployment Protection** (401 to anonymous clients) —
  must be turned off (or "Only Preview") to capture public/device telemetry (ADO #82).
  *(Note: `luma-loop.vercel.app` is an unrelated project — do NOT use it.)*
- **Supabase** (`pnygisdojhxzbqubyeln`): `telemetry_events` table + indexes + RLS
  applied (migration `0001`, tracked). End-to-end verified — a browser session wrote
  16 events with no PII.
- **iOS app:** runnable via Expo Go / Simulator (`cd mobile && npm install && npx expo
  start --ios`; see `mobile/RUN_IOS.md`). Verified rendering on the iPhone 17 Pro
  simulator. Device telemetry pending the prod URL being public (#82).

---

## 6. Work completed (chronological)

Tracked in Azure DevOps (Epic #40 original prototype; Epic #102 the feed/platform
direction). PRs on GitHub `aishvar23/LumaLoop`.

**A. Original session-based prototype (Epic #40) — engine + UI + telemetry**
- Scaffold, design tokens, card domain + validation, template→category map, session
  reducer + feed controller, timeout contract, seeded composition, receipt calc.
- All 4 template renderers + evaluators (#64–#67); Start / feed / receipt / exit UI
  (#69–#72).
- Telemetry: anonymous id (#74), client (#75), event instrumentation (#76).
- §17 unit-test coverage pass (#78); QA validation checklist (#80); 7-day runbook (#83).
- Ingestion endpoint `/api/event` (#45); Vercel project (#42) + env wiring (#46);
  migration applied — telemetry verified end-to-end.

**B. Feed pivot — Phase 1 (Epic #102 → Issue #103, tasks #104–#108)**
- Infinite feed controller (endless seeded deck, no completion) (#104).
- Full-screen vertical swipe `FeedScreen` (#105).
- Skip / engage-then-abandon semantics; timer arms on engage (#106).
- App opens straight into the feed; retired start-screen/receipt/exit; one-time
  §21.8 first-run data notice (#107).
- Telemetry reworked to the 9 feed events; `/` emits them (#108).

**C. React Native iOS app — Phase M (Issue #124, tasks #125–#131)**
- Decision: **React Native + Expo, not Capacitor** (feed-first apps use native/RN;
  WebView can't match the swipe feel — Instagram = native+RN, TikTok = native core).
- M1 scaffold → M2 port pure core (+jest) → M3 native swipe feed (FlatList + gesture-
  handler/reanimated) → M4 rebuild the 4 games in RN → M5 RN telemetry (AsyncStorage
  retry queue, AppState abandonment, absolute Vercel endpoint) → M6 first-run notice
  → M7 iOS build/run + `RUN_IOS.md`.

**D. Feed UX polish — Phase M2 (Issue #132, tasks #133–#135)** *(from on-device feedback)*
- MP1 uniform post-answer feedback+explanation gate (it was previously only shown
  conditionally) (#133).
- MP2 center the game + full-bleed slide + safe-area (was pinned to the top) (#134).
- MP3 TikTok/Instagram look & feel: immersive dark theme, hero typography, polished
  game-board cards, creator byline as a bottom-left author overlay, swipe-up cue,
  feedback result card, reduced-motion-aware transitions (#135).

**E. Multi-step games — Phase G (Issue #136, tasks #137–#142)**
- 3 new multi-step mechanics + 10 cards, web first then mobile ports: memory_sequence
  (#137/#140), pattern_chain (#138/#141), step_logic (#139/#142). The G1 review added
  `isActive` to the web template contract (fixing the off-screen-preview class on web
  too).

**F. Scoring + streaks — Phase 4 (GAME POINTS)**
- A pure, template-agnostic scoring core (`src/feed/scoring.ts`, ported to
  `mobile/src/core/feed/scoring.ts`): points per correct resolution weighted by speed
  (vs. the card's `timeLimitMs`) × accuracy (attempts) × a streak-driven combo
  multiplier; misses score 0 and break the streak. Consumes ONLY the shared
  `CardResolution` (no `templateType` switch, no evaluator changes). An accumulator
  hook (`useFeedScore`) folds the EXISTING `onCardResolved` seam into total/streak/
  best-run/combo; a small accent-aware HUD (`FeedScoreHud`) and the result-card chip
  (`CardFeedback`'s reserved slot, via `cardScoreContext`) display it. Best run +
  cumulative points persist best-effort (localStorage / AsyncStorage), no PII, reset-
  safe. NO new telemetry events. **GAME-POINTS framing only** (Design §7/§21.8).

**G. Motion polish — Phase 5 (ANIMATION & TRANSITIONS)**
- A restrained, token-first motion language (TikTok/Reels-snappy, not bouncy) added
  on top of the colored-but-static feed. Web tokens in `src/styles/tokens.css`
  (`--motion-fast 120ms` / `--motion-base 200ms` / `--motion-slow 320ms`;
  `--ease-out`, `--ease-pop`, `--ease-standard`); native parallels in
  `mobile/src/feed/templates/tokens.ts` (`motion.fast/base/slow`). What animates:
  (1) **active-card entrance** — fade + lift + slight scale when a slide becomes the
  focused card, gated on ACTIVATION not mount (web: `data-active` on
  `.feed-slide__game` + a keyframe; mobile: an `ActiveEntrance` `Animated` wrapper),
  so pre-mounted neighbours never animate off-screen; (2) **interaction micro-motion**
  — press scale + accent glow on every game control (web: one
  `.feed-slide__game button:active` rule + the shared `Button`; mobile: existing
  Pressable `pressed` states); (3) **tile-flash / reveal polish** — eased lit↔unlit
  colour + a faint lit-cell scale for memory_sequence, and a per-item reveal pop +
  flip-banner pop for rule_flip (visual easing only — flash/cadence timing unchanged);
  (4) **result-card pop** — the result card pops in (scale + fade) with its points
  chip popping just behind it (web keyframes in `global.css`; mobile `Animated.spring`);
  (5) **streak flourish** — the 🔥 pill pulses once whenever the streak INCREASES
  (web: a remount-keyed `--pulse` class; mobile: a one-shot `Animated` scale pulse).
- **Reduced-motion:** every animation degrades fully — web extends the existing
  `prefers-reduced-motion` rule in `global.css` (collapses all durations to ~0, which
  also neutralises the inline-style keyframes); mobile reuses `useReducedMotion`
  (AccessibilityInfo) to snap each `Animated` value to its final state.
- **Pitfalls avoided:** motion is gated on the `isActive`/`active` ACTIVATION signal,
  never on mount and never coupled to `useCardTimer` / resolution latching, so a
  re-activating off-screen slide cannot fire phantom animations or timers. No game
  logic, evaluator, timing, or telemetry changed; core stayed in lock-step (UI-only).

**H. Immersive feed + deep-puzzle pass**
- Reworked the flat black feed into a category-lit, full-bleed stage on web and
  native: layered gradients, restrained ambient geometry, a raised translucent
  game surface, LumaLoop/Discover identity, compact difficulty/time metadata,
  stronger creator attribution, and a glass-style points HUD. The shell remains
  template-agnostic, preserves one-handed targets, and avoids fake like/comment
  counts or non-functional social controls.
- Extended each category palette through the actual gameplay—not just the feed
  background. Boards, tiles, options, glyphs, active outlines, pressed states,
  primary actions, and glow now use semantic category-color roles across all 11
  web/native renderers, while text/glyph cues continue to carry meaning without
  relying on color alone.
- Added a social-feed-inspired **game identity frame** around every game: real
  template + mechanic identity, a deterministic visual fingerprint, an authored
  difficulty meter, accent edge lighting,
  restrained spotlight/sheen motion, stronger control elevation, and explicit
  keyboard focus treatment. It borrows the immersive hierarchy and low-clutter
  principles of modern short-form feeds without a redundant “Playable” badge or
  invented likes, comments, live status, or other non-functional social signals.
- Added Signal Set and Circuit Flow as typed, data-driven templates with pure
  evaluators, startup validation, five authored cards apiece, renderers, timeout
  semantics, and web/native tests. Inspiration was researched from the general
  all-same/all-different attribute rule and rotatable-network puzzle family; the
  names, presentation, card data, signals, and feed-sized interactions are LumaLoop
  originals.
- Circuit Flow now offers a pre-attempt **Watch demo** flow on web and native. A
  separate two-tile example demonstrates rotation, matching neighboring wires,
  and avoiding loose ends; it closes automatically into a “Your turn” prompt.
  Demo use does not rotate the authored puzzle, arm its timer, or emit an attempt.
- Spot It authoring now uses one neutral instruction—“Find the odd one out.”—so
  the prompt never names the distractor or target. All odd-one-out boards are
  classified as **Extremely easy · 8s** as the app’s entry-level scan mechanic.
- The beginner “What changed” symbol-newcomer cards are classified as
  **Easy · 14s** with a short 3s preview, so simple six-symbol recall screens do
  not surface as Hard.
- The deepest Code Break card is classified as **Extremely hard · ~120s** with
  exactly six guesses for a five-slot/six-symbol deduction puzzle, so it is
  treated as a deliberate long-form challenge instead of a 30s feed tap.
- Sequence authoring now uses neutral task-only prompts across Tiny Logic and
  Pattern Chain. Prompts ask players to extend the sequence without naming its
  arithmetic, rotation, interleaving, or other pattern; that rule appears only in
  the post-answer explanation.

Every task shipped via a worker-driven loop (implement → code-review → fix → squash-
merge → ADO Done). Review caught & fixed real bugs throughout (toolchain coupling,
double-resolve / timer re-arm on off-screen slides, reproduce-phase timing, `@@`
byline, first-run a11y).

**Deferred / external (not done):** real Vercel deploy made public (#82, needs
Deployment Protection off), analysis SQL views (#47), Sentry (#48), on-device QA (#79).
Follow-ups #91, #99, #100, #101 filed (out of original scope).

---

## 7. Current state

- **11 game types, 101 cards.** Web 699 tests, mobile 475 tests; both gates green.
- **Web:** endless swipe feed at `/`, live on Vercel (behind Deployment Protection).
- **Mobile:** full RN app, runnable on the iOS Simulator / Expo Go, all 11 games +
  telemetry wired.
- **Scoring (Phase 4):** game-points + streak/combo layer on both apps — HUD + result-
  card chip, best-run persistence, no new telemetry, game-points framing only.
- **Telemetry:** pipeline verified end-to-end into Supabase (web); device delivery
  pending #82.

---

## 8. Open items / what's next

- **Make the deploy public** — turn off Vercel Deployment Protection (#82) so public
  + device telemetry lands. (Prod URL already wired into the mobile app.)
- **Web feed Phases 2–4** (Issues #109/#110/#111, tasks #112–#123):
  - Phase 2 — tappable creator profiles (`/u/:handle`) + real `/c/:cardId` single-game
    surface + `Creator_Profile_Viewed`.
  - Phase 3 — local (no-login) follow + Following feed + "Your activity" stats.
  - Phase 4 — feed-metric analysis SQL views (#47), on-device QA (#79), performance,
    accessibility (incl. the deferred FirstRunNotice focus-trap).
- **More games** — the multi-step set can keep growing (same localized recipe).
- **Mobile/web core sync** — currently hand-synced; consider extracting a shared
  workspace package if drift becomes a maintenance cost.

---

## 9. How to run

**Web:** `npm install && npm run dev` (feed at `/`). Gate: `npm run lint && npm run
typecheck && npm test && npm run build`.

**iOS app:** `cd mobile && npm install && npx expo start --ios` → opens the Simulator
(needs Xcode) or scan the QR with Expo Go. Force a fresh bundle:
`xcrun simctl openurl booted "exp://127.0.0.1:8081"`. Full steps + device checklist in
`mobile/RUN_IOS.md`. Gate: `cd mobile && npx tsc --noEmit && npm test`.
