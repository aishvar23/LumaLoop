# Prototype Validation QA Checklist

> Source of truth: Technical Design **§17 "Prototype validation QA"** and the
> acceptance criteria in **§18**. This is the reproducible checklist a human runs
> against a build to confirm correct behavior **before/during the test**. It does
> not change app/source code.

## Scope

This checklist validates the **LumaLoop prototype** (Vite + React + TypeScript,
mobile-first web): the four challenge templates (`spot_it`, `what_changed`,
`rule_flip`, `tiny_logic`), the template-agnostic session engine, the §10
telemetry contract, the receipt/summary, and the positioning guardrails
(Design §7 / §21.8). It covers correctness, timing, telemetry exactly-once
posture, and copy compliance — not load, security, or backend ingestion.

## How to use it

1. Note the **build SHA** under test (`git rev-parse --short HEAD`) and record it
   in the sign-off table.
2. Run the **automated gate first** — it covers the bulk of the contract:
   ```
   npm run lint && npm run typecheck && npm test && npm run build
   ```
   A green gate satisfies every item tagged **[AUTOMATED-VERIFIED]** below; the
   cited test file is the authority for that item.
3. Then walk the **[MANUAL]** steps in a running build (`npm run dev`) on a
   mobile-width viewport. Use browser DevTools → Network (filter `event`) to
   observe telemetry POSTs to `/api/event`, or stub the endpoint and inspect the
   payloads. Each telemetry POST body is one §10 event carrying a unique
   `eventId` (the idempotency key) — dedupe by `eventId` when counting.
4. Mark each checkbox, then complete the **Sign-off** table.

### Legend

- **[AUTOMATED-VERIFIED]** — an existing unit/integration test asserts this; the
  manual steps are a spot-check, the test is the gate.
- **[MANUAL]** — no automated assertion (or only partial); must be verified by a
  human in the running app.

### The eleven §10 telemetry events

`Session_Initialized`, `Card_Rendered`, `Card_Attempted`, `Card_Resolved`,
`Card_Explanation_Viewed`, `Session_Completed`, `Session_Abandoned`,
`Receipt_Shared`, `Exit_Clicked`, `Intentional_Continue_Clicked`,
`Return_Session_Started` — defined in `src/telemetry/telemetryEvents.ts`
(`TelemetryEventNames`).

---

## 1. Telemetry — each event fires exactly once

The exactly-once posture is implemented with per-scope once-latches in
`src/telemetry/sessionTelemetry.ts` (`initializedSessions`, `renderedCards`,
`attemptedCards`, `resolvedCards`, `explanationViewedCards`,
`completedSessions`, `abandonedSessions`, `returnFired`). User-action events
(`Exit_Clicked`, `Intentional_Continue_Clicked`, `Receipt_Shared`) fire per tap
(no latch — a click handler is not re-invoked by a re-render).

- [ ] **Per-card events fire once per activation** — `Card_Rendered`,
  `Card_Attempted`, `Card_Resolved` each appear exactly once per card, keyed on
  `sessionId:cardIndex`; `Card_Explanation_Viewed` once per `sessionId:cardId`.
  **Pass:** no duplicates for the same card across a full play-through.
  **[AUTOMATED-VERIFIED]** — `src/telemetry/sessionTelemetry.test.ts`
  ("fires Card_Rendered once per activation…", "maps Card_Attempted… once per
  activation", "fires Card_Explanation_Viewed once per card…").
- [ ] **Session-scope events fire once per session** — `Session_Initialized`
  once per `sessionId`; `Session_Completed` once per `sessionId`;
  `Return_Session_Started` once per instrumentation lifetime (first window only,
  never re-fired by an intentional continue).
  **Pass:** exactly one each per completed session.
  **[AUTOMATED-VERIFIED]** — `src/telemetry/sessionTelemetry.test.ts`
  ("emits Session_Initialized once per id; Return_Session_Started only once
  ever", "fires Session_Completed once per session with routeKind").
- [ ] **Full §10 flow through a real play-through, each event exactly once** —
  end-to-end via the mounted feed.
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("fires the full §10 flow through a play-through, each event exactly once").
- [ ] **[MANUAL] Network spot-check** — play one full session with DevTools →
  Network open (filter `event`). Confirm one POST per event per card, no
  duplicate `eventId`s, and no event repeated on incidental re-renders.

## 2. `Card_Rendered` fires only when a card becomes active (not on mount)

`Card_Rendered` is emitted from `cardActivated` in
`src/telemetry/sessionTelemetry.ts`, wired through `observeActiveCard` in
`SessionRoute.tsx` — an effect keyed on the **active** card identity/index, which
no-ops on a null card (the gap between cards) and does not fire for unrelated
re-renders.

- [ ] **A card emits `Card_Rendered` only on becoming the active/focused card**,
  not when the feed mounts and not when the same card re-renders into its
  feedback step.
  **Pass:** N cards played → exactly N `Card_Rendered` events.
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("does not re-fire Card_Rendered when a card re-renders into its feedback
  step"); `src/telemetry/sessionTelemetry.test.ts`
  ("advancing N cards yields N Card_Rendered events").
- [ ] **[MANUAL]** Start a session and watch the network panel: the first
  `Card_Rendered` should coincide with the first card appearing/active, not
  before; advancing to each next card emits one more, and answering/feedback
  re-renders emit none.

## 3. `Card_Attempted` timing starts after interaction is enabled (TTI)

The attempt is timed by the renderer from the interaction-enabled instant
(`context.interactionEnabledAtMs`), not from card activation. For preview
templates (`what_changed`), the renderer owns its own answer-phase origin: the
options are not even mounted during preview, and TTI / `interactionElapsedMs`
are measured from the answer-phase start (`src/templates/whatChanged/
WhatChangedCard.tsx`).

- [ ] **`what_changed` TTI excludes the preview window** — the preview phase is
  non-interactive; TTI is measured from answer-phase start.
  **Pass:** `interactionElapsedMs` on the resolution does not include
  `previewMs`.
  **[AUTOMATED-VERIFIED]** — `src/templates/whatChanged/WhatChangedCard.test.tsx`
  ("treats the preview phase as non-interactive (no option to commit)",
  "resolves correct with TTI measured from answer-phase start (excludes
  preview)", "fires onAttempt exactly once with the answer-phase TTI").
- [ ] **`Card_Attempted` fires once on the first meaningful input** for each
  template (Spot It first tap, Tiny Logic/What Changed first selection, Rule
  Flip first response).
  **[AUTOMATED-VERIFIED]** — `src/templates/spotIt/SpotItCard.test.tsx`
  ("fires onAttempt exactly once even across multiple taps");
  `src/templates/tinyLogic/TinyLogicCard.test.tsx`
  ("fires onAttempt exactly once with the time-to-interaction");
  `src/templates/ruleFlip/RuleFlipCard.test.tsx`
  ("fires onAttempt exactly once on the first response…").
- [ ] **[MANUAL]** Play a `what_changed` card: confirm options are not tappable
  during the memorize/preview phase, and that a slow preview does not inflate the
  reported attempt timing.

## 4. Timeout emits `resolutionType: 'timeout'` (+ `isCorrect:false`, `signals.timedOut`)

A timeout is a *resolved incorrect* card. The forced fields are built by the pure
`buildTimeoutResolution` in `src/templates/timeoutResolution.ts`
(`resolutionType:'timeout'`, `isCorrect:false`, `signals.timedOut:true` — cannot
be overridden by template signals), armed by the shared `useCardTimer`
(`src/templates/useCardTimer.ts`).

- [ ] **The builder forces the timeout-defining fields** and merges template
  signals without letting them override `timedOut`.
  **[AUTOMATED-VERIFIED]** — `src/templates/useCardTimer.test.tsx`
  ("forces the timeout-defining fields…", "forces timedOut: true even when
  signals try to set it false", "merges template signals but cannot override the
  forced timeout fields").
- [ ] **The timer fires at `timeLimitMs` and not after a self-resolution** —
  single-fire, disarmed on the renderer's own resolution and on unmount.
  **[AUTOMATED-VERIFIED]** — `src/templates/useCardTimer.test.tsx`
  ("fires a timeout resolution at exactly timeLimitMs off the injected clock",
  "disarms when the renderer resolves before expiry (no late timeout)",
  "leaves no armed timer and fires nothing after unmount").
- [ ] **A timeout surfaces in the feed as a resolved card** (with the feedback
  step), not a skip/abandon.
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("surfaces a timeout as a resolved card with the feedback step").
- [ ] **[MANUAL]** On one card per template, let the timer run out: confirm the
  card resolves as incorrect/timed-out, the feed advances, and the emitted
  `Card_Resolved` carries `resolutionType:'timeout'` and `timedOut` in
  `measuredSignals`.

## 5. Timeout behavior is consistent across all four templates

`useCardTimer` is the single, template-agnostic primitive every renderer mounts
(reads only `cardId` and `config.timeLimitMs`).

- [ ] **Each of the four renderers resolves via `useCardTimer` on expiry** and
  does not fire a late timeout after its own resolution.
  **[AUTOMATED-VERIFIED]** —
  `src/templates/spotIt/SpotItCard.test.tsx` ("resolves via useCardTimer when
  the per-card timer expires", "does not fire a late timeout after a correct
  resolution");
  `src/templates/whatChanged/WhatChangedCard.test.tsx` ("resolves via
  useCardTimer, and the preview does NOT consume the time limit", "does not fire
  a late timeout after a correct resolution");
  `src/templates/ruleFlip/RuleFlipCard.test.tsx` ("resolves via useCardTimer with
  timedOut=true when timeLimitMs expires mid-stream", "does not fire a late
  timeout after the stream resolves on its own");
  `src/templates/tinyLogic/TinyLogicCard.test.tsx` ("resolves via useCardTimer
  with timedOut true when no choice is made", "does not fire a late timeout after
  a resolution").
- [ ] **[MANUAL]** Confirm `what_changed`'s `timeLimitMs` covers the **answer
  phase only** (the preview does not consume the limit), and `rule_flip`'s timer
  arms only once the stream begins (not during the comprehension gate).

## 6. `Session_Abandoned` uses visibilitychange/pagehide/sendBeacon, at-most-once

`registerAbandonmentListeners` (`src/telemetry/telemetryClient.ts`) binds
`visibilitychange→hidden` and `pagehide`; `trackAbandonment` prefers
`navigator.sendBeacon` (JSON Blob), falling back to a `fetch` keepalive POST then
the retry queue. The event is built by `buildAbandonmentEvent` only while a
session is in progress and is latched per `sessionId` (best-effort/undercount).

- [ ] **Abandonment is emitted at most once per session** even though both
  `visibilitychange` and `pagehide` can fire on a single close.
  **[AUTOMATED-VERIFIED]** — `src/telemetry/sessionTelemetry.test.ts`
  ("emits Session_Abandoned at most once per session (visibilitychange +
  pagehide both fire)", "builds an abandonment event only while a session is in
  progress").
- [ ] **Abandonment is delivered via the unload listener while in progress.**
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("delivers a best-effort Session_Abandoned via the unload listener while in
  progress").
- [ ] **No spurious abandonment off a session** — a hidden start screen or
  receipt (no session in progress) emits nothing.
  **[AUTOMATED-VERIFIED]** — `src/telemetry/sessionTelemetry.test.ts`
  ("builds an abandonment event only while a session is in progress").
- [ ] **[MANUAL]** Mid-session, background the tab / switch apps / close the tab;
  confirm a single `Session_Abandoned` is sent (observe the beacon/keepalive POST
  in DevTools) and that it is not duplicated by the paired listener.

## 7. Card results match expected answers (per-template evaluators)

The per-template pure evaluators are the single source of truth for correctness;
renderers route every committed answer through them.

- [ ] **Spot It** — only the anomaly cell is correct; any other tap is incorrect.
  **[AUTOMATED-VERIFIED]** — `src/templates/spotIt/spotItEvaluator.test.ts`
  (`isAnomalyCell`, `evaluateSpotItTap`).
- [ ] **What Changed** — `correctOptionId` is correct; any other / unknown option
  is incorrect.
  **[AUTOMATED-VERIFIED]** — `src/templates/whatChanged/whatChangedEvaluator.test.ts`.
- [ ] **Rule Flip** — pre-flip stimuli scored under the initial rule, post-flip
  under the flipped rule; flip index is the first post-flip stimulus; pass
  threshold and aggregates correct.
  **[AUTOMATED-VERIFIED]** — `src/templates/ruleFlip/ruleFlipEvaluator.test.ts`.
- [ ] **Tiny Logic** — `correctOptionId` is correct; each wrong / unknown option
  is incorrect and named as the distractor.
  **[AUTOMATED-VERIFIED]** — `src/templates/tinyLogic/tinyLogicEvaluator.test.ts`.
- [ ] **[MANUAL]** For one card per template, deliberately answer correctly and
  incorrectly; confirm the feedback and the emitted `Card_Resolved.isCorrect`
  match the intended answer.

## 8. No ability-claim copy (positioning guardrails — Design §7 / §21.8)

User-facing copy must not make cognitive-ability / IQ / brain-training /
clinical / employment claims; categories are framed as **performance categories**
a session *included*, never traits a person *has* (see `SessionReceipt.tsx`
and `src/cards/types.ts` `ChallengeCategory`).

- [ ] **Receipt copy stays within the guardrails** — no trait/ability/IQ claims;
  categories framed as "this session included…".
  **[AUTOMATED-VERIFIED]** — `src/ui/SessionReceipt.test.tsx`
  ("keeps copy within the positioning guardrails (no trait/ability claims)").
- [ ] **[MANUAL] Sweep every user-facing surface** — start screen, in-feed
  prompts/feedback, card explanations, completed receipt, exited receipt, and
  share text. Confirm none claim intelligence, IQ, brain-training, diagnosis, or
  employment/school suitability. The completed/exited framing is modest
  ("Session complete" / "Session ended"), celebrating effort and completion, not
  ability.

## 9. Start screen shows the data notice + non-assessment disclaimer

`StartScreen.tsx` renders the required `DATA_NOTICE` before any session can start:
"records anonymous interaction events … It is not a cognitive, medical, school,
or employment assessment."

- [ ] **The required anonymous-data, non-assessment notice is shown** before the
  session choices.
  **[AUTOMATED-VERIFIED]** — `src/ui/StartScreen.test.tsx`
  ("shows the required anonymous-data, non-assessment notice (§21.8)").
- [ ] **[MANUAL]** Load `/`; confirm the "Before you start" notice is visible and
  legible (not muted-only) above the session choices on a mobile viewport.

## 10. Template→category map enforced

`templateCategoryMap` (`src/cards/types.ts`) is the source of truth; catalog
validation (`src/cards/validation.ts`,
`ValidationRule.VALID_CATEGORY_FOR_TEMPLATE`) rejects a card whose `category` is
not allowed for its `templateType`.

- [ ] **Validation accepts allowed pairings and rejects disallowed ones** across
  the full template×category matrix.
  **[AUTOMATED-VERIFIED]** — `src/cards/validation.test.ts`
  ("templateCategoryMap <-> validation consistency" parameterized accepts/rejects;
  "rejects a category that is invalid for the template").
- [ ] **The authored catalog maps every card to its template's categories.**
  **[AUTOMATED-VERIFIED]** — `src/cards/catalog.test.ts`
  ("maps every card category to its template in templateCategoryMap").

## 11. Local catalog validation catches malformed cards

`validateCatalog` / `assertValidCatalog` enforce the §11 startup rules (unique
id, supported template, valid category, non-empty prompt, `timeLimitMs` in
[5000, 30000], correct-answer present, explanation present, allowed evidence
tier) and never throw on import.

- [ ] **Malformed cards are rejected** — duplicate id, unsupported template,
  invalid category, empty prompt, out-of-range / NaN / Infinity `timeLimitMs`,
  missing correct answer, missing explanation, disallowed evidence tier; a fully
  valid catalog passes with zero errors; multiple errors are collected.
  **[AUTOMATED-VERIFIED]** — `src/cards/validation.test.ts`
  (`validateCatalog`, `assertValidCatalog` suites).
- [ ] **The authored catalog passes startup validation.**
  **[AUTOMATED-VERIFIED]** — `src/cards/catalog.test.ts`
  ("passes startup validation with zero errors").

## 12. `/c/:cardId` opens a single card

The deep-link route (`ROUTES.cardDeepLink = '/c/:cardId'`, `src/app/routes.ts`)
is wired in `src/app/router.tsx` and resolves to a single-card surface that reads
and exposes the decoded `cardId`. **Note (scope):** in this prototype the route
currently renders `CardDeepLinkRoutePlaceholder` (`src/app/placeholders.tsx`),
which surfaces the decoded `cardId`; the full playable share surface is a later
task. Validate the routing/decoding contract, not a full card play-through.

- [ ] **`/c/:cardId` resolves to the single-card surface and exposes the decoded
  `cardId`**, including encoded ids round-tripped through `buildCardDeepLink`.
  **[AUTOMATED-VERIFIED]** — `src/app/router.test.tsx`
  ("renders the deep-link placeholder and exposes the decoded cardId", "decodes
  an encoded cardId param from a built deep link").
- [ ] **[MANUAL]** Navigate to a `/c/<cardId>` URL; confirm exactly that one card
  surface loads (not the full session feed) and the id displayed matches the URL.

## 13. Receipt computes from real card results

The receipt is presentational: `SessionRoute.tsx` feeds the pure
`computeSessionSummary` (`src/session/sessionSummary.ts`) the real
`controller.results`; `SessionReceipt.tsx` only renders the summary and never
recomputes stats or reads the clock. `completedOnTime` (badge) is `true` for a
completed session, `false` for an early exit.

- [ ] **The receipt renders the computed numbers on completion** — cards
  completed, accuracy %, correct/completed, fastest correct card, category mix.
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("renders the real receipt with the computed numbers on completion");
  `src/ui/SessionReceipt.test.tsx` (rendering suite).
- [ ] **The exit (early-leave) receipt shows no on-time badge.**
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("exiting ends the session and shows the receipt with NO exit badge").
- [ ] **[MANUAL]** Play a session answering a known mix; confirm the displayed
  accuracy/correct counts match what you actually answered, and that an early
  exit yields a receipt without the "Left on time" badge.

---

## Cross-cutting checks

- [ ] **No PII anywhere in telemetry** — only `anonymousUserId` identifies; no
  name/email/contact/device id; `measuredSignals` carries signal *names*, not
  values.
  **[AUTOMATED-VERIFIED]** — `src/telemetry/sessionTelemetry.test.ts`
  ("attaches only the anonymous id — never any PII field").
- [ ] **Idempotent retry dedupe** — each event carries a unique `eventId`; a
  retried POST de-dupes server-side. Spot-check distinct `eventId`s in DevTools.
  **[MANUAL]** (client behavior covered by `src/telemetry/telemetryClient.test.ts`).
- [ ] **No skip affordance** — leaving ends the session; it never advances past a
  card.
  **[AUTOMATED-VERIFIED]** — `src/app/SessionRoute.test.tsx`
  ("offers a clear exit path during the active session, and no skip").

---

## Sign-off

| # | Item | Pass/Fail | Tester | Notes / Build SHA |
|---|------|-----------|--------|-------------------|
| 1 | Telemetry — each event fires exactly once | | | |
| 2 | `Card_Rendered` only on active (not mount) | | | |
| 3 | `Card_Attempted` TTI after interaction-enabled | | | |
| 4 | Timeout emits `timeout` (+ `isCorrect:false`, `timedOut`) | | | |
| 5 | Timeout consistent across all four templates | | | |
| 6 | `Session_Abandoned` via lifecycle, at-most-once | | | |
| 7 | Card results match evaluators | | | |
| 8 | No ability-claim copy | | | |
| 9 | Start screen data notice + non-assessment disclaimer | | | |
| 10 | Template→category map enforced | | | |
| 11 | Catalog validation catches malformed cards | | | |
| 12 | `/c/:cardId` opens a single card | | | |
| 13 | Receipt computes from real card results | | | |
| X | Cross-cutting: no PII / idempotent retry / no skip | | | |

**Build SHA under test:** `__________`  **Date:** `__________`
**Overall result (PASS / FAIL):** `__________`
