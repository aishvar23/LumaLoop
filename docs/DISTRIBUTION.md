# LumaLoop — Tester Distribution Guide

How to get the LumaLoop prototype into the hands of ~50 testers across **Android**
and **iOS**. The mobile app is **Expo (managed)**; there is also a **mobile-first
web** build. Android is ready to ship now (see §2); iOS (TestFlight) is the next
step (see §3); the web link (§4) is the lowest-friction option of all.

> Backend: Supabase project `pnygisdojhxzbqubyeln` (auth + RLS). The feed is gated
> behind login — only **Google** and **email magic link** work today (Apple /
> Facebook still pending). Tell testers to use **Google** for the smoothest flow.

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
eas build -p ios --profile production   # log in with Apple; EAS auto-creates certs + provisioning
eas submit -p ios                       # uploads the .ipa to App Store Connect
```
> Note: the current `eas.json` `production` profile targets Android (`app-bundle`).
> Before the iOS build, add an iOS section/profile (e.g. an `ios` build with
> `distribution: store`) or a dedicated `ios` profile. Ping the maintainer to add
> it when you're ready.

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

## 4. Web (lowest friction — a shareable link)

The web app already deploys to Vercel (`EXPO_PUBLIC_API_BASE_URL` points at a
Vercel URL). A URL beats any install for 50 testers — mobile-first, works in any
phone browser, "Add to Home Screen" makes it app-like, instant updates.

```bash
npm i -g vercel
vercel            # link/auth (works from local — no GitHub push needed)
vercel --prod
```
Set Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client, build-time),
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server, for `/api`), `CRON_SECRET`
(+ `RESEND_API_KEY` / `REMINDER_FROM` only if enabling the daily reminder email).
Then add the Vercel domain to Supabase **Auth → Site URL + redirect allowlist** and
to the **Google OAuth** authorized origins/redirects.

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

## 6. Quick recommendation

For "just 50 testers, prototype, iOS-priority":
1. **Now:** ship the **Android APK** (§2) — same day, zero per-tester setup.
2. **In parallel:** start the **Apple Developer** enrollment so **iOS TestFlight**
   (§3) is unblocked in 1–2 days.
3. **Optional:** the **web link** (§4) is the fastest way to get *everyone* trying
   it immediately while the native builds bake.
