# Running LumaLoop on iOS (ADO #131, M7)

How to **run** and **on-device test** the LumaLoop native app (`mobile/`, Expo SDK 56).
Everything below is a human/GUI step — the headless worker prepared the config and docs,
but booting the Simulator and a physical device requires Xcode and is done by a person.

---

## 1. Prerequisites

| Need | For | Notes |
| --- | --- | --- |
| **Node 18+ and npm** | Metro bundler / Expo CLI | matches the repo toolchain |
| **Xcode** (App Store) | iOS Simulator + native builds | open it once to install the Command Line Tools and accept the license |
| **Expo Go** (App Store, on your iPhone) | quick path on a physical device | no Apple Developer account needed |
| **A free Apple ID** | native build to a **physical device** | select it as a "Personal Team" in Xcode signing — no paid membership required for local installs |

A paid Apple Developer membership is **not** required for Simulator runs or for personal
on-device testing via a free Personal Team.

---

## 2. Quick path — Expo Go / Simulator (no native build)

```bash
cd mobile
npm install
npm start
```

Then, from the Metro/Expo terminal:

- Press **`i`** to launch the **iOS Simulator** (Xcode required), **or**
- **Scan the QR code** with the Camera app on an iPhone running **Expo Go**.

This runs the JS bundle inside Expo Go / the Expo dev client — fastest loop, no signing.

---

## 3. Native build path — `expo run:ios` (real iOS build)

Use this when you need a real native binary (Simulator **and** physical device):

```bash
cd mobile
npm install
npx expo prebuild -p ios     # generates the native ios/ project (gitignored)
npx expo run:ios             # builds + installs on a booted Simulator
```

- The generated `mobile/ios/` folder is **intentionally gitignored** (see `mobile/.gitignore`).
  It is reproducible from `app.json` via `expo prebuild`; **never commit it**.
- The bundle identifier is `app.lumaloop.mobile` (from `app.json` → `expo.ios.bundleIdentifier`).
- To open in Xcode instead (recommended for device builds and signing):

  ```bash
  open ios/*.xcworkspace
  ```

### Signing for a physical device

1. In Xcode, select the app target → **Signing & Capabilities**.
2. Check **Automatically manage signing**.
3. Set **Team** to your personal team (your free Apple ID — "(Personal Team)").
4. If Xcode reports the bundle id is taken, change `expo.ios.bundleIdentifier` in
   `app.json` to a unique reverse-DNS id you control and re-run `npx expo prebuild -p ios`.
5. Build/run to the connected iPhone. On first launch, trust the developer profile on the
   device: **Settings → General → VPN & Device Management → Developer App → Trust**.

> Note: the worker did **not** run `expo prebuild` in CI (it can be interactive/flaky in a
> headless environment), and the native `ios/` folder is gitignored. Run the commands above
> locally.

---

## 4. Telemetry configuration

The native telemetry client POSTs each event to `${EXPO_PUBLIC_API_BASE_URL}/api/event`
(the same Vercel ingestion → Supabase `telemetry_events` as the web app). Expo inlines
`EXPO_PUBLIC_*` env vars at build time.

- **Production endpoint** (`mobile/.env.production`, mirrored in `mobile/.env.example`):

  ```
  EXPO_PUBLIC_API_BASE_URL=https://luma-loop-madhursethji-7775s-projects.vercel.app
  ```

  This is our **stable Vercel production alias, scoped to our project**. The value is **not
  a secret** — no API key ships in the client.

- ⚠️ **Do NOT use `https://luma-loop.vercel.app`.** That global name belongs to an
  **unrelated project** (a bottle company); it is **not ours**.

- ⚠️ **Deployment Protection (ADO #82).** Our production alias is currently behind Vercel
  **Deployment Protection**, which returns **HTTP 401** to anonymous clients. Until the
  project owner turns Deployment Protection **OFF** (or to **"Only Preview Deployments"**)
  for `/api/event`, **device telemetry POSTs will not land**. The client handles this
  gracefully — there is **no crash**; failed events spill to a **small capped retry queue**
  (oldest dropped beyond the cap) and are retried on the next flush. You will simply see no
  rows in `telemetry_events` until protection is lifted.

- If `EXPO_PUBLIC_API_BASE_URL` is unset, the client falls back to the documented default
  in `src/telemetry/endpoint.ts` (the same production alias).

- **Local API testing**: to point the app at a reachable `/api/event` (a preview deploy
  without protection, or a tunnel to a local server), set `EXPO_PUBLIC_API_BASE_URL` in
  `mobile/.env.development` (or `mobile/.env`) and restart Metro with cache cleared:

  ```bash
  npx expo start -c
  ```

---

## 5. On-device test checklist

Run this on a Simulator and/or a physical device. (Tailored to the native feed; mirrors
the QA validation concepts.)

**First run & feed entry**
- [ ] On a fresh install, the app opens **straight into the feed** with the **first-run
      data notice** shown **once** over the first card.
- [ ] The notice copy states events are **anonymous** and that it is **not** a cognitive /
      medical / school / employment assessment.
- [ ] Dismiss the notice → it does **not** reappear on subsequent app launches.

**Feed navigation**
- [ ] **Swipe up** advances to the next game; **swipe down** returns to the previous one.
- [ ] Swiping is smooth, full-screen, and snaps one card at a time.

**Play each of the 4 games** (Spot It, What Changed, Rule Flip, Tiny Logic)
- [ ] **Correct** answer → success affordance shows.
- [ ] **Incorrect** answer → failure affordance shows (and Tiny Logic shows its explanation).
- [ ] **Timeout** → the card resolves on timeout without a crash.

**Engagement / abandonment paths**
- [ ] **Skip a game**: swipe past a card **without engaging** it.
- [ ] **Engage-then-swipe-away**: start interacting, then swipe away before resolving
      (abandon mid-card).
- [ ] **Background the app** mid-card, then return (abandonment via backgrounding) — no crash.

**Copy & attribution guardrails**
- [ ] Each card shows the **creator byline** (handle with leading `@`).
- [ ] **No IQ / brain-training / "intelligence" / ability / clinical / employment claims**
      anywhere in the copy — only neutral "performance" framing.

**Telemetry (only verifiable once ADO #82 protection is OFF)**
- [ ] With Deployment Protection lifted (or pointing at an unprotected dev endpoint),
      attempts/skips/abandons produce rows in `telemetry_events`. Otherwise events stay
      queued client-side (expected — see §4).
