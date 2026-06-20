# 7-Day Prototype Test Runbook

> **Scope:** the operational runbook for running LumaLoop's 7-day prototype
> test. It tells the operator, analyst, and interviewer exactly what to do
> before, during, and after the test, and how to read the signal it produces.
>
> **Authoritative sources:** Product/Technical specs (`docs/PROTOTYPE_DESIGN.md`
> §16; `docs/PROTOTYPE_TECHNICAL_DESIGN.md` §10, §18, §19). The telemetry
> contract referenced throughout is the code in
> `src/telemetry/telemetryEvents.ts` and `src/telemetry/sessionTelemetry.ts` —
> not a separate spec. Where a fact depends on the deploy (Task **#82**) or a
> team decision, this runbook says so explicitly rather than asserting a number.

## How to use this runbook

1. Work the **Prerequisites** section first; do not launch until every box is
   checked and the **Pre-launch go/no-go** is signed.
2. Follow the **Schedule** day by day, performing the per-day operator actions.
3. Pull the **Metrics & Telemetry** queries on the cadence noted, then run the
   **Qualitative** survey + interviews at the end.
4. Apply the **Success criteria / decision** framework with the team and capture
   the outcome in the **Results-capture stub**.

---

## 1. Purpose & scope

The 7-day test exists to measure one thing: **does the prototype produce an
early return/engagement signal** — do people who try it come back **organically**
once the reminder nudges stop? It is a directional product-validation test, not a
study of people.

**What it validates**

- Early retention / return behaviour (organic return after Day 3).
- Whether sessions are completed vs. abandoned, and which performance categories
  and templates people engage with.
- Qualitative reactions: clarity, enjoyment, and whether the loop is worth
  repeating.

**What it explicitly is NOT** (positioning guardrails — Design §7 / §16):

- Not a cognitive, IQ, brain-training, clinical, medical, school, or employment
  assessment. We make **no claims about any participant's ability**.
- Categories are framed as **performance categories a session included**, never
  as traits a person has. All operator/survey/interview copy must stay inside
  these guardrails. The in-app `DATA_NOTICE` already states the non-assessment
  framing (`src/ui/StartScreen.tsx`); the test must not contradict it.

---

## 2. Participants

- **Recruit 50–100 testers.** Recruitment, consent, contact details, scheduling,
  and any incentive tracking are kept **entirely outside the app and outside app
  telemetry** (Design §16). The app records only anonymous interaction events; it
  has no field for names, email, contacts, or social graph — and must not gain
  one for this test (`src/telemetry/telemetryEvents.ts`,
  `src/telemetry/anonymousUser.ts`).
- Keep the recruitment roster (and the interview shortlist) in a separate,
  access-controlled document. **Never join it to telemetry by any identifier.**
  There is no per-person key that links a roster entry to telemetry rows, by
  design — do not create one.

### The anonymous-id caveat (read before you trust any retention number)

The app identifies a returning user only by a **best-effort anonymous id** kept
in `localStorage` under `lumaloop.anonymousUserId` (a random UUID, no PII —
`src/telemetry/anonymousUser.ts`). It is **generated once per browser** and is
**not durable**. It breaks across:

- private / incognito browsing,
- a different browser or a different device,
- cache / site-data clearing,
- storage being disabled or quota-exceeded (the app falls back to an in-memory id
  that lasts only the page lifetime).

**What this means for measurement:** a real human who returns on a new device or
after clearing data appears as a **new** anonymous id, so **return/retention is
undercounted and "unique testers" is overcounted** at the margin. Treat
retention as a **directional lower bound**, not an exact count. In recruitment
instructions, ask testers to **use the same browser on the same device, without
clearing site data**, to reduce (not eliminate) this drift. Note: a tester who
clears storage also loses the deterministic session seed tied to that id.

---

## 3. Prerequisites (must all be true before Day 0)

- [ ] **Public mobile link is live (Task #82 — DEPENDENCY).** The prototype must
      be reachable from a public, mobile-friendly URL that telemetry POSTs reach.
      **#82 (Deploy) may still be pending — it gates the entire test.** Do not
      launch until the deployed link is confirmed reachable on a real phone and
      telemetry is landing.
- [ ] **§18 acceptance criteria met** on the build being deployed (per Technical
      Design §18). Record the build SHA (`git rev-parse --short HEAD`).
- [ ] **Validation QA pass is complete and green** — run
      [`QA_VALIDATION_CHECKLIST.md`](./QA_VALIDATION_CHECKLIST.md) against the
      exact build under test and complete its sign-off table. That checklist is
      the authority for telemetry exactly-once posture, timeout/resolution
      behaviour, evaluator correctness, receipt math, and copy compliance — this
      runbook does not re-verify them.
- [ ] **Automated quality gate green** on the build:
      `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Telemetry ingestion confirmed.** Send a `manual_test` session (open the
      link with `?source=manual_test`) and confirm events land in the store, with
      IP/user-agent stripped at ingestion (Design §16) and `eventId` de-dup
      working. `manual_test` sessions are excluded from headline metrics by
      construction (see §5), so this smoke test does not pollute the data.
- [ ] **Reminder/nudge mechanism ready** for Days 1–3, and the reminder link
      carries `?source=reminder` (see §4/§5).
- [ ] **Analysis views/queries ready** (the §5 queries are written and runnable
      against the telemetry store).

---

## 4. Schedule

**Day 0 — Launch.** Distribute the public link to recruited testers. The plain
link carries **no `?source=` param**, so organic opens attribute as
`source: 'direct'` (the default — `parseTelemetrySource` returns `'direct'` when
the param is absent or invalid). Confirm first real sessions are landing.

**Days 1–3 — PROMPTED.** Send reminder nudges encouraging a session. **Every
reminder link must carry `?source=reminder`** so sessions entered from a reminder
attribute as `source: 'reminder'` and are **excluded from the headline organic
return metric** (§5). This phase establishes the warmed-up baseline; it is not
the headline signal.

**Days 4–7 — UNPROMPTED.** **Send no nudges.** Returns in this window are organic
and should arrive via the plain link (`source: 'direct'`). This is the window the
headline metric cares about most: did people come back **without** being poked?

### Per-day operator actions

- [ ] **Day 0 — Launch:** distribute the plain link (no `?source=`); verify
      sessions + telemetry landing; snapshot Day-0 counts.
- [ ] **Day 1 — Prompted:** send reminder nudge using the `?source=reminder` link;
      pull daily metrics; note anomalies.
- [ ] **Day 2 — Prompted:** send reminder nudge (`?source=reminder`); pull daily
      metrics.
- [ ] **Day 3 — Prompted:** send reminder nudge (`?source=reminder`); pull daily
      metrics. **This is the last day nudges are sent.**
- [ ] **Day 4 — Unprompted:** send NO nudge; pull daily metrics; begin watching
      `source: 'direct'` `Return_Session_Started`.
- [ ] **Day 5 — Unprompted:** send NO nudge; pull daily metrics.
- [ ] **Day 6 — Unprompted:** send NO nudge; pull daily metrics; schedule
      interviews; open the survey.
- [ ] **Day 7 — Unprompted / close:** send NO nudge; pull final metrics; close the
      survey window; finish interviews; snapshot the full dataset.

---

## 5. Metrics & telemetry

All metrics derive from the **eleven §10 telemetry events** defined in
`src/telemetry/telemetryEvents.ts` (`TelemetryEventNames`). The exact, verified
names are:

`Session_Initialized`, `Card_Rendered`, `Card_Attempted`, `Card_Resolved`,
`Card_Explanation_Viewed`, `Session_Completed`, `Session_Abandoned`,
`Receipt_Shared`, `Exit_Clicked`, `Intentional_Continue_Clicked`,
`Return_Session_Started`.

**Do not query for any event name not in that list** — those are the only events
the prototype emits.

### The `source` attribution field

The `source` field on an event is one of exactly four values
(`TelemetrySource` in `telemetryEvents.ts`):

`'direct' | 'reminder' | 'share' | 'manual_test'`

It is parsed from the **`?source=` URL query param** by `parseTelemetrySource`
(`src/telemetry/sessionTelemetry.ts`): a valid value is taken as-is; an
absent, empty, or unrecognised value **degrades to `'direct'`**.

### Headline return metric

> **The headline organic-return metric counts only `Return_Session_Started`
> events with `source: 'direct'`.**

`Return_Session_Started` carries the entry `source` and fires **once per
instrumentation lifetime, for the first window only** — an intentional continue
(a deliberate re-arm that mints a fresh `sessionId`) does **not** re-fire it, so
it is never miscounted as a return (`sessionTelemetry.ts`). Reminder-, share-,
and manual_test-attributed returns are deliberately **excluded** from the
headline so the signal reflects organic behaviour, not nudged behaviour.

Note the distinction: `Session_Initialized` fires for **every** armed window
(including each intentional continue); `Return_Session_Started` is the
return/attribution event. Count returns from `Return_Session_Started`, not from
`Session_Initialized`.

### Concrete events the analysis relies on

| Question | Event(s) | Notes |
|---|---|---|
| Organic returns (headline) | `Return_Session_Started` where `source = 'direct'` | Once per instrumentation lifetime; primary Day 4–7 signal. |
| Prompted returns (baseline) | `Return_Session_Started` where `source = 'reminder'` | Days 1–3 nudge effect; not the headline. |
| Sessions started | `Session_Initialized` | One per armed window (incl. each intentional continue). |
| Sessions finished | `Session_Completed` | Once per `sessionId`; carries `routeKind`. |
| Sessions dropped | `Session_Abandoned` | **Undercount** — see caveat below. |
| Card engagement / accuracy mix | `Card_Resolved` | Carries `isCorrect`, `resolutionType`, `templateType`, `category`, timing. |
| Cards reached / attempted | `Card_Rendered`, `Card_Attempted` | Funnel within a session. |
| Did they read the explanation | `Card_Explanation_Viewed` | Depth-of-engagement signal. |
| Sharing | `Receipt_Shared` | Note: a shared link carries `?source=share`. |
| Exit vs. continue | `Exit_Clicked`, `Intentional_Continue_Clicked` | User-action events. |

Suggested derived figures: unique anonymous ids per day; session-completion rate
(`Session_Completed` / `Session_Initialized`); Day 4–7 organic return rate; cards
resolved per session; category/template mix from `Card_Resolved`. **De-dupe by
`eventId`** when counting (the client stamps a UUID per event for idempotent
retry — `QueuedTelemetryEvent`).

### Abandonment is an undercount (do not treat as exact)

`Session_Abandoned` is **best-effort**. It is delivered on
`visibilitychange→hidden` / `pagehide` via `navigator.sendBeacon` (with a
keepalive-fetch then retry-queue fallback), latched at-most-once per session
(`src/telemetry/telemetryClient.ts`, `sessionTelemetry.ts`). On mobile, beacons
can be dropped when a tab/app is killed abruptly. **Treat abandonment counts as a
lower bound**; prefer `Session_Completed` / `Session_Initialized` as the more
reliable completion signal.

---

## 6. Qualitative

Run two qualitative instruments at the end of the window. **Keep all
recruitment/contact data and responses outside app telemetry** (Design §16); the
survey/interview tooling is separate from the app.

**End-of-test survey** (all participants). Sample themes/questions — all about
**experience**, never self-assessed ability:

- Was it clear what to do on each challenge? (clarity)
- How enjoyable was a session? (enjoyment)
- Did you come back on your own after the first few days — why / why not?
  (organic-return motivation)
- What made you stop, or not return? (friction)
- Did the receipt/summary feel meaningful and accurate to what you did?
- Anything confusing, broken, or that felt off on your phone?

**10–15 participant interviews** (a shortlist drawn from the recruitment roster).
Sample prompts — experience-focused:

- Walk me through the last time you opened it. What did you expect, what
  happened?
- What, if anything, pulled you back after the reminders stopped?
- Where did it feel slow, unclear, or not worth it?
- Would you keep using something like this? What would make it worth repeating?

**Guardrail for all qualitative copy:** ask about the **experience** (clarity,
enjoyment, usefulness of the loop), **not** about how smart/capable the
participant felt or any ability self-rating. Do not imply scores reflect
intelligence, aptitude, or fitness for school/work.

---

## 7. Success criteria / decision

The decision the test informs: **proceed toward MVP** vs. **iterate on the
prototype**.

This runbook **does not invent numeric thresholds.** The specs do not state a
fixed headline retention target, so the team sets the bar **before** Day 0 and
records it in the results stub. Decision inputs:

- **Quantitative (directional):** the Day 4–7 **organic** return signal
  (`Return_Session_Started`, `source: 'direct'`), session-completion rate, and
  cards-per-session — read against the **anonymous-id undercount** (§2) and
  **abandonment undercount** (§5), i.e. interpret retention as a **lower bound**.
- **Qualitative:** consistent signals that the loop is **clear, enjoyable, and
  worth repeating**, with identifiable friction that has a credible fix.

**Framing:** a credible organic-return signal **plus** qualitative direction that
the loop is worth repeating supports moving toward MVP; weak organic return or
qualitative confusion/indifference points to iterating on the prototype first. If
the team set a numeric bar pre-launch, cite it here at decision time. **Do not
back-fill a target after seeing the data.**

---

## 8. Risks & caveats

- **Deploy (#82) gates everything.** If the public mobile link is not live and
  receiving telemetry, the test cannot run. Treat #82 as a hard dependency.
- **Anonymous-id identity is best-effort** (§2): retention undercounts, unique
  testers overcounts. Directional only.
- **`Session_Abandoned` is a mobile undercount** (§5): sendBeacon can be dropped
  on abrupt kill. Don't treat drop-off counts as exact.
- **Small sample (50–100).** Slice with caution; report ranges/direction, not
  precise rates. Sub-segment cuts (per template/category) get thin fast.
- **Provider IP/UA handling (§16):** ingestion must strip/anonymise IP and
  user-agent and persist no PII. Confirm in prerequisites; if a provider logs raw
  IP/UA anywhere, that must be minimised before launch.
- **Attribution depends on link hygiene:** organic links must omit `?source=`
  and reminder links must carry `?source=reminder`. A mislabeled link corrupts
  the headline metric. Audit the exact links before each send.

---

## 9. Roles & sign-off

| Role | Responsibilities |
|---|---|
| **Operator** | Owns launch + daily schedule (§4): distributes the correct links (plain vs. `?source=reminder`), sends/withholds nudges per phase, confirms telemetry is landing daily, snapshots counts. |
| **Analyst** | Owns metrics (§5): runs queries, de-dupes by `eventId`, tracks the headline `source: 'direct'` return metric and completion rate, flags the undercount caveats in every report. |
| **Interviewer** | Owns qualitative (§6): runs the survey + 10–15 interviews, keeps all contact/response data outside app telemetry, synthesises themes within the guardrails. |

### Pre-launch go/no-go checklist

- [ ] **#82 deploy:** public mobile link live and reachable on a real phone.
- [ ] **Telemetry landing** from the deployed link; IP/UA stripped at ingestion;
      `eventId` de-dup verified.
- [ ] **§18 acceptance criteria** met on the build; build SHA recorded.
- [ ] **`QA_VALIDATION_CHECKLIST.md`** completed and **green** for this SHA.
- [ ] **Quality gate green:** `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Links audited:** plain (organic) link has no `?source=`; reminder link
      carries `?source=reminder`.
- [ ] **Recruitment roster + interview shortlist** stored separately, with **no**
      join to telemetry.
- [ ] **Numeric decision bar (if any)** agreed with the team and written into the
      results stub **before** Day 0.
- [ ] **Roles assigned** (operator / analyst / interviewer).
- [ ] **GO / NO-GO decision** recorded with sign-off below.

| Decision | Name | Date |
|---|---|---|
| GO / NO-GO | | |

### Results-capture stub (fill in at Day 7 close)

```
Build SHA under test: __________      Test window: Day 0 ____ → Day 7 ____
Participants recruited: ______        Unique anonymous ids observed: ______

Pre-agreed decision bar (set before Day 0): __________________________

— Quantitative —
Headline organic returns (Return_Session_Started, source: 'direct'): ______
Prompted returns (source: 'reminder', Days 1–3):                     ______
Sessions initialized / completed:                          ______ / ______
Completion rate (Completed / Initialized):                          ______
Abandoned (LOWER BOUND — sendBeacon undercount):                    ______
Cards resolved per session (avg):                                   ______
Category / template mix (from Card_Resolved):           ____________________

— Qualitative —
Survey responses: ______      Interviews completed (target 10–15): ______
Top themes (experience/clarity/enjoyment, NOT ability): ____________________
Top friction points:                                    ____________________

— Caveats applied to reading —
Anonymous-id undercount acknowledged (retention = lower bound):  [ ]
Abandonment undercount acknowledged:                            [ ]
Small-sample limits acknowledged:                               [ ]

— Decision —
PROCEED TO MVP  /  ITERATE  (circle one):  _______________
Rationale: ________________________________________________
Sign-off (name / date): ___________________________________
```
