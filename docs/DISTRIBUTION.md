# LumaLoop — Tester Distribution Guide

How to get the LumaLoop prototype into the hands of ~50 testers across **Android**
and **iOS**. The mobile app is **Expo (managed)**; there is also a **mobile-first
web** build. Android is ready to ship now (see §2); iOS (TestFlight) is the next
step (see §3); the web link (§4) is the lowest-friction option of all.

> Backend: Supabase project `pnygisdojhxzbqubyeln` (auth + RLS). The feed is gated
> behind login — only **Google** and **email magic link** work today (Apple /
> Facebook still pending). Tell testers to use **Google** for the smoothest flow.

---

## 0. ⛳ Before the NEXT tester rollout (open action items)

Do these before handing the app to any more Android/iOS users:

- [ ] **Deploy the web app so challenge links resolve.** "Challenge a friend"
      shares `https://witzy.app/c/<cardId>?s=<score>` (hardcoded `CHALLENGE_BASE_URL`
      in `src/social/challengeLink.ts` / mobile mirror). Until the web app is
      deployed to **witzy.app** (Vercel) and the domain is pointed there, those
      links open nothing. Deploying also lights up the public `/c/:cardId` play
      surface and the daily-reminder cron.
- [ ] **Turn on the daily-reminder email** (optional): deploy `/api/daily-reminder`
      to Vercel and set `RESEND_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
      + a verified Resend sending domain. Cron is already declared in `vercel.json`.
- [ ] **Keep Supabase unpaused.** The free-tier project auto-paused once and broke
      login (stale sessions strand users at profile creation). Confirm it's active
      before a rollout; consider a tiny scheduled keep-warm ping.
- [ ] **Rebuild the APK from `task/likes-comments`** so the current feature set
      (new games, longer timers, hooks, streak, best, challenge links, juice, spark
      brand) actually ships — not the older `codex/…` branch / other EAS project.

---

## 1. What's already configured

- **`mobile/app.json`** — name `LumaLoop`, `scheme: lumaloop` (the OAuth deep-link
  scheme), iOS `bundleIdentifier` + Android `package` both `app.lumaloop.mobile`,
  icons/adaptive icons set.
- **`mobile/eas.json`** — EAS Build profiles:
  - `preview` → **internal-distribution APK** (sideload-ready; the file you share
    with Android testers).
  - `production` → **AAB** (Android App Bundle) for Google Play, `autoIncrement`
    version code.
  - Both embed the **public** client env (safe to commit — non-secret):
    `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key),
    `EXPO_PUBLIC_API_BASE_URL` (telemetry endpoint).
- `expo-doctor`: 20/21 checks pass. The single warning is a benign local
  `node_modules` hoisting artifact (the same `expo-constants` version appears
  3×) — EAS does a clean cloud install from the lockfile, so it does not affect
  the build. Optional local cleanup: `npm dedupe` (or wipe `node_modules` +
  reinstall).

The only true secret (Supabase `service_role` key) lives **server-side only**
(Vercel `/api`), never in the mobile app.

---

## 2. Android (ready now)

### Prerequisites
- A free **Expo account** (https://expo.dev).
- `eas-cli` (`npm i -g eas-cli`, or use `npx eas-cli@latest <cmd>`).
- **No paid account needed** for the sideloaded-APK path.

### Build + share (run from `mobile/`)
```bash
eas login                              # your Expo account
eas init                               # links the project; writes extra.eas.projectId into app.json
eas build -p android --profile preview
```
- `eas init` will create/attach an Expo project and **modify `app.json`** (adds the
  project id) — that's expected; commit that change afterward.
- The build runs in EAS's cloud (~10–20 min). When done it prints a **download URL
  + QR code** for the APK. **That link is what you send testers.**
- To ship a new version later: re-run `eas build -p android --profile preview`
  and share the new link (sideloaded APKs do not auto-update).

### Tester instructions (Android)
1. Open the link on the phone → download the APK.
2. When prompted, allow **"Install unknown apps"** for your browser / Files app →
   install.
3. Open **LumaLoop** → sign in (use **Google** for the smoothest flow; magic-link
   email also works but is rate-limited — see §5).

### Optional upgrade: Google Play internal testing
For clean Play-Store installs **with auto-updates** (instead of sideloading):
- Create a **Google Play Console** account ($25 one-time).
- `eas build -p android --profile production` (produces the AAB), then
  `eas submit -p android` (or upload the AAB to the **Internal testing** track in
  Play Console). Add testers by email/list; they install from the Play link.

---

## 3. iOS (TestFlight) — next step

TestFlight is the **only** legitimate iOS beta channel and it requires an **Apple
Developer Program** membership (**$99/yr, ~24–48h to activate**) — that's the long
pole; start the enrollment first.

### Build + submit (run from `mobile/`)
```bash
EXPO_TOKEN=<token> npx eas-cli@latest build -p ios --profile production   # Apple login; EAS auto-creates certs + provisioning
EXPO_TOKEN=<token> npx eas-cli@latest submit -p ios                       # uploads the .ipa to App Store Connect → TestFlight
```
> Repo is iOS-build-ready: the `production` profile has the `EXPO_PUBLIC_*` env and
> defaults to **store** distribution (the `android.buildType` key only affects
> Android builds — iOS under the same profile produces a TestFlight-ready `.ipa`).
> `app.json` sets the bundle id (`app.lumaloop.mobile`), the 1024² icon, and
> `ITSAppUsesNonExemptEncryption: false` (skips the export-compliance prompt).
> `eas submit -p ios` will prompt for the Apple account / App Store Connect app the
> first time (or create the app record). No `eas.json` change needed.

### Distribute via TestFlight
- In **App Store Connect → TestFlight**, create an **External** testing group and
  enable the **public TestFlight link**. Testers tap the link → install the
  TestFlight app → join.
- External testing needs **one Beta App Review** (~1 day for the first build;
  later builds usually auto-clear).
- Avoid **Internal** testing for outside testers — it's capped at 100 and each
  tester must be an App Store Connect user.

### iOS gotchas
- **Sign in with Apple (App Store Guideline 4.8):** because the app offers Google
  login, Apple wants an equivalent privacy-respecting option. The **email magic
  link** (first-party, passwordless) generally satisfies this, so you can likely
  ship to TestFlight with **Google + magic link** and add Apple sign-in later. It's
  a small review risk — wiring **Sign in with Apple** before the public App Store
  release is the safe move (the provider is already half-configured).
- **OAuth deep link** works in a real EAS build (it does **not** in plain Expo Go,
  which is why we don't distribute via Expo Go).

---

## 4. Web (RECOMMENDED for the prototype — a shareable link)

A URL beats any install for 50 testers: mobile-first, works in any phone browser
(iOS + Android), free, instant updates, no $99/App Store/TestFlight. "Add to Home
Screen" gives an app icon + standalone chrome (the PWA manifest + apple-touch-icon
ship in `public/`). This is the fastest way to get prototype feedback.

### 4a. Deploy it PUBLICLY (from repo root, run locally — no GitHub push needed)
```bash
npx vercel          # first time: link/auth the project
npx vercel --prod   # deploy production → prints your public URL
```
> **Make sure it's public.** Vercel "Deployment Protection" (Vercel Authentication)
> puts the site behind a login wall — testers would hit `vercel.com/sso-api`. In
> the Vercel project → **Settings → Deployment Protection**, set Vercel
> Authentication to **Disabled** (or Preview-only) for Production. A fresh
> `npx vercel --prod` project is public by default.

### 4b. Vercel env vars (Project → Settings → Environment Variables)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — client (build-time; the anon key
  is public by design, RLS is the boundary).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-only, for `/api/event`
  telemetry inserts (telemetry is best-effort — omit and the app still works).
- `CRON_SECRET` (+ `RESEND_API_KEY`, `REMINDER_FROM`) — only if enabling the daily
  reminder email.

### 4c. Tell Supabase the web URL is allowed (Auth → URL Configuration)
- **Site URL**: your public web URL (e.g. `https://witzy.vercel.app`).
- **Redirect URLs**: add `https://<your-web-url>/**` AND keep `http://localhost:5173/**`
  for local dev. Without this, Google OAuth + magic link fail with
  "PKCE code verifier not found" (Supabase falls back to a different origin).
- **Google Cloud OAuth client**: add the web URL to Authorized JavaScript origins +
  `https://<project>.supabase.co/auth/v1/callback` stays the redirect (Supabase
  proxies OAuth), so usually no Google change is needed beyond the Supabase config.

### 4d. Verify + share
- Open the URL on an iPhone (Safari) and an Android (Chrome): sign in with Google
  or magic link, play a game, tap **Share → Add to Home Screen**.
- "Challenge a friend" links from the web app automatically use the deployed origin
  (they build from `window.location.origin`), so they work with no code change.
- Send testers the URL + "Add to Home Screen" one-liner (see the message template
  below in §7).

### 4e. Daily reminder emails (twice-daily nudge)

Two Vercel crons hit `/api/daily-reminder?slot=morning|evening`
(`vercel.json`: **02:30 UTC** = 8:00 AM IST / 10:30 PM ET, and **13:00 UTC** =
6:30 PM IST / 9:00 AM ET — the second is prime for *both* zones). The send is
**gated**: with no email provider configured the cron fires but sends nothing (a
safe no-op). To turn it on, set these in **Vercel → luma-loop → Settings →
Environment Variables (Production)**:

| Var | Where to get it |
|---|---|
| `RESEND_API_KEY` | Sign up at **resend.com** → **API Keys → Create API Key** → copy the `re_…` value. |
| `REMINDER_FROM` | A from-address **on a domain you verified in Resend** (Resend → **Domains → Add Domain**, add the DNS records). e.g. `Witzy <hello@yourdomain.com>`. Without a verified domain you can only send to your own address (Resend test mode). |
| `CRON_SECRET` | **You invent it** — any long random string (`openssl rand -hex 32`). Vercel Cron auto-sends it as `Authorization: Bearer <CRON_SECRET>`; the handler rejects calls without it. |
| `REMINDER_APP_URL` | Your **live web URL** (what you share with testers), so "Start playing" links there instead of the placeholder. |

Notes:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already set) power the recipient
  list via the Supabase admin API.
- **Resend free tier = 100 emails/day.** 50 testers × 2 sends = 100/day — right at
  the cap. If you add testers, drop to one send/day or upgrade.
- After setting the vars + redeploying, check the Vercel project's **Crons** tab
  shows both jobs, and hit the endpoint manually to test:
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-url>/api/daily-reminder?slot=evening`

---

## 5. Pre-flight checklist (all native paths)

- [ ] **Supabase Auth → URL Configuration**: `lumaloop://auth/callback` is in the
      redirect allowlist; **Google** provider enabled. (No Android SHA-1 needed —
      we use the browser-redirect flow, not native Google one-tap.)
- [ ] **Production Site URL** set (for the web/magic-link flow).
- [ ] **Magic-link rate limits:** Supabase's built-in email sends only a handful
      per hour. For a launch-day rush, either steer testers to **Google sign-in**
      or configure **custom SMTP** (e.g. Resend) so 50 sign-ups aren't throttled.
- [ ] After `eas init`, commit the `app.json` change (project id).
- [ ] Supabase free tier comfortably handles 50 users; watch the auth email cap.

---

## 6. Security notes

**The big picture:** the Supabase **anon/publishable key shipped in the APK (and
the web bundle) is NOT a secret** — it's designed to be public; anyone can extract
it from any client. All security rests on **Row-Level Security (RLS)**, not on
hiding that key. The only true secret — the `service_role` key — is **server-side
only** (Vercel `/api`), never in the mobile app. ✅

**RLS posture (reviewed):** `game_plays` is self-only; `profiles` / `follows` /
`game_likes` / `game_comments` / `game_shares` are public-read + self-write;
`telemetry_events` is deny-all to clients (server-insert only). So any signed-in
user can read every public **profile** (handle/display name/avatar/bio — but
**not** email), all comments/shares/follows, and aggregate stats. That's expected
for a social app — just be aware comment/share content is visible to all testers.

**Supabase security advisor — current state:**
- ✅ **Fixed (was the only ERROR):** `user_public_stats` was a SECURITY DEFINER
  *view* (definer views bypass the caller's RLS). Migration **0007** replaces it
  with a SECURITY DEFINER **function** with a pinned `search_path`
  (`user_public_stats(target)`) and `EXECUTE` **revoked from `anon`** (signed-in
  users only). It returns ONLY the aggregate (games/correct/points), never raw
  plays or PII.
- ℹ️ **Intentional (residual WARN):** the advisor still flags that the
  `authenticated` role can call that definer function via `/rest/v1/rpc` — that's
  exactly the point (other users' profiles show public stats). Acceptable for the
  prototype; the fully-lint-clean alternative is a trigger-maintained aggregate
  table, which is overkill here.
- ℹ️ **Intentional:** `telemetry_events` "RLS enabled, no policy" = deny-all to
  clients (only the server inserts). Leave as-is.
- ➖ **N/A:** "leaked-password protection disabled" — the app uses Google OAuth +
  passwordless magic link, so there are no passwords to check. Optional to enable.

**Other notes:**
- **OAuth deep link** (`lumaloop://auth/callback`): custom-scheme links can be
  scheme-squatted, but the flow uses **PKCE**, so an intercepted code is useless
  without the in-app verifier. Fine for a prototype; verified **App Links** are
  stronger for production.
- **`CRON_SECRET`:** when you deploy the web `/api`, **set it** — otherwise
  `/api/daily-reminder` is callable unauthenticated (it won't email anyone unless
  `RESEND_API_KEY` is also set, but it would let someone trigger a user scan).
- **Sideloaded APK** asks testers to enable "install unknown apps" — fine for a
  trusted 50-person beta; use the Play internal track for wider release.
- **Privacy/PII:** the accounts pivot means you now store email + handle +
  gameplay (the original design was anonymous). Add a one-line consent/privacy note
  to your invite; telemetry already strips IP/UA at ingestion.

**Before a public release (not blockers for 50 testers):** add **Sign in with
Apple** (Guideline 4.8), switch the OAuth redirect to **App Links / Universal
Links**, add basic **rate-limiting** on social writes, and publish a real
**privacy policy**.

## 7. Quick recommendation

For "just 50 testers, prototype, fast feedback": **ship the web link (§4).** It's
free, instant, works on every iPhone + Android with no store/$99/review, and one
URL reaches everyone. Native (Android APK §2 / iOS TestFlight §3) is the follow-up
once the concept is validated.

### Tester message template (web)
> **Try Witzy** 🎯 — a feed of quick puzzle games.
> Open on your phone: **<your-web-url>**
> Sign in with Google (or "email magic link"), then just swipe and play.
> Tip: tap **Share → Add to Home Screen** for an app icon.
> Takes 5 min — tell me what felt fun, what didn't, and if you'd come back.
