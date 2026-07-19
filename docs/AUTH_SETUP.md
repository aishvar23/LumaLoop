# LumaLoop — Auth / OAuth setup guide

LumaLoop uses **Supabase Auth** to gate the feed behind a real account + profile
(the "accounts pivot"). This guide is the owner checklist to make sign-in work
end-to-end. The **code is already wired** — these are dashboard/console steps that
require credentials only the owner can create.

- **Supabase project URL:** `https://pnygisdojhxzbqubyeln.supabase.co`
- **Supabase OAuth callback (provider redirect URI):**
  `https://pnygisdojhxzbqubyeln.supabase.co/auth/v1/callback`
- **App callback route (where Supabase returns the user):** `/auth/callback`
- Publishable (anon) key is already in `.env.local` (web) — not a secret.

> Status legend: ✅ works now · ⚙️ needs the steps below before it works.

---

## 0. Supabase URL configuration (do this first — needed by every provider)

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** your primary app origin.
  - Local dev: `http://localhost:5173`
  - Production: your Vercel app origin (the scoped alias, not `luma-loop.vercel.app`).
- **Redirect URLs (allowlist)** — add each origin's callback:
  - `http://localhost:5173/auth/callback`
  - `https://<your-production-origin>/auth/callback`
  - (mobile, later) `lumaloop://auth/callback` — see §5.

If a redirect isn't allowlisted, Supabase rejects the login with a redirect error.

---

## 1. ✅ Email magic link (works now)

Supabase dashboard → **Authentication → Providers → Email**: enabled by default.

- Local/testing uses Supabase's built-in email sender (rate-limited). Good enough
  to verify the flow today.
- **Production:** configure a real SMTP sender (Authentication → Emails → SMTP)
  or magic-link emails will be throttled/unreliable.

No console app needed — you can test magic-link sign-in immediately once §0 is set.

---

## 2. ⚙️ Google

1. **Google Cloud Console** → APIs & Services → **Credentials** → Create
   **OAuth client ID** → *Web application*.
2. **Authorized redirect URI:** `https://pnygisdojhxzbqubyeln.supabase.co/auth/v1/callback`
3. Copy the **Client ID** + **Client secret**.
4. Supabase dashboard → **Authentication → Providers → Google** → enable, paste
   Client ID + secret → Save.
5. (Configure the OAuth consent screen if prompted.)

---

## 3. ⚙️ Facebook

1. **Meta for Developers** → Create app → add **Facebook Login**.
2. Facebook Login → Settings → **Valid OAuth Redirect URIs:**
   `https://pnygisdojhxzbqubyeln.supabase.co/auth/v1/callback`
3. Copy the **App ID** + **App Secret** (Settings → Basic).
4. Supabase dashboard → **Authentication → Providers → Facebook** → enable, paste
   App ID + secret → Save.
5. Add the `email` permission and take the app out of Dev mode for non-test users.

---

## 4. ⚙️ Apple (most involved)

Apple requires an Apple Developer account.

1. **Apple Developer** → Identifiers → create an **App ID**, then a **Services ID**
   (this Services ID is your Apple "client id").
2. Configure the Services ID → enable **Sign in with Apple** → add:
   - **Domain:** `pnygisdojhxzbqubyeln.supabase.co`
   - **Return URL:** `https://pnygisdojhxzbqubyeln.supabase.co/auth/v1/callback`
3. Create a **Sign in with Apple key** (.p8), note the **Key ID** and your **Team ID**.
4. Supabase dashboard → **Authentication → Providers → Apple** → enable; provide
   the Services ID (client id) + the secret (Supabase can generate it from the
   .p8 key, Team ID, Key ID) → Save.

> Note: Apple sign-in is effectively **required by the App Store** if the iOS app
> ships any third-party social login (see mobile follow-up).

---

## 5. Mobile (Expo) — implemented

The Expo app (`mobile/`) now mirrors the web accounts pivot: it gates the feed
behind a Supabase account + profile and records `game_plays` for the signed-in
user. It uses the **same** Supabase project as the web app and a custom URL
scheme deep link for the OAuth/magic-link return.

**Owner checklist for mobile sign-in to work end-to-end:**

1. **Redirect URL allowlist (required).** App scheme (set in `mobile/app.json`):
   `lumaloop` → redirect `lumaloop://auth/callback`. Add
   `lumaloop://auth/callback` to Supabase → **Authentication → URL Configuration →
   Redirect URLs** (§0). Without it, OAuth and magic-link sign-in are rejected.
2. **Env.** Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
   `mobile/.env` / `.env.development` (see `mobile/.env.example`). These are the
   same public values as web (anon key is not a secret; RLS is the boundary).
3. **Providers.** The same provider config as §1–§4 applies (one Supabase
   project). Email magic link works once §0 + the `lumaloop://` redirect are set.
4. **Apple (iOS).** The app uses the **native** Sign in with Apple sheet
   (`expo-apple-authentication`) → `signInWithIdToken`. Enabling it for a real
   build needs the Apple **Services ID** configured in Supabase (§4) and the
   `usesAppleSignIn`/entitlement in a dev/standalone build (Expo Go cannot run
   native Apple sign-in; use a development build to test it). Google/Facebook use
   the system auth browser (`expo-web-browser`) + PKCE exchange and need no extra
   native client IDs for the browser flow.

> Cannot be verified from CI here: real OAuth and the iOS Simulator deep-link
> round-trip. The flow is covered by unit tests with the Supabase client + the
> browser/Apple/deep-link seams mocked; the owner must verify on a device.

---

## 6. Verify

1. Finish §0, then test **email magic link** (§1) — should sign you in, then prompt
   for **profile creation** (handle / display name), then unlock the feed.
2. Play a few cards → open **/you** → stats (games played, accuracy, best streak,
   points, per-category) should populate from `game_plays`.
3. Enable a social provider (§2–§4) and repeat with that button.

## 7. What the code already does (no action needed)

- Supabase client (PKCE), `AuthProvider`/`useAuth`, login screen (Google/Apple/
  Facebook + email), `/auth/callback` exchange, route guard (signed-out → login;
  signed-in w/o profile → profile creation; else → feed), profile creation,
  `/you` profile + stats, and a best-effort `game_plays` write per resolution.
- DB: `public.profiles` + `public.game_plays` (RLS-protected) — migration
  `supabase/migrations/0002_profiles_game_plays.sql`, already applied.
