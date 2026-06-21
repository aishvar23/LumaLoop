/**
 * Telemetry ingestion endpoint resolution for React Native (ADO #129, M5).
 *
 * Unlike the web client — which POSTed to the RELATIVE `/api/event` on the same
 * origin that served the SPA — the native app has no origin, so it must POST to
 * an ABSOLUTE URL. The base URL comes from an Expo public env var
 * (`EXPO_PUBLIC_API_BASE_URL`), which Expo inlines at build time, with a
 * documented placeholder default (see `mobile/.env*`). Telemetry always targets
 * the SAME deployed Vercel ingestion (`/api/event` → Supabase `telemetry_events`)
 * as the web app.
 *
 * NOTE (real-device delivery — ADO #82): the default below is our STABLE Vercel
 * PRODUCTION alias (scoped to our project). It is currently behind Vercel
 * Deployment Protection, which returns HTTP 401 to anonymous clients, so the
 * native app's telemetry POSTs will NOT land until the owner turns Deployment
 * Protection OFF (or to "Only Preview Deployments") — ADO #82. Until then the
 * client fails gracefully (no crash; failures spill to a small capped retry
 * queue), and unit tests exercise it against a FAKE transport (web #75 posture).
 *
 * IMPORTANT: do NOT use `https://luma-loop.vercel.app` — that global name belongs
 * to an UNRELATED project (a bottle company); it is NOT ours. Our scope alias is
 * the `*-madhursethji-7775s-projects.vercel.app` host below.
 */

/**
 * Documented default base URL: our STABLE Vercel production alias (NOT a secret —
 * no keys ship in the client). Overridden per environment via
 * `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env*`. No trailing slash.
 */
export const DEFAULT_API_BASE_URL =
  'https://luma-loop-madhursethji-7775s-projects.vercel.app';

/** The ingestion path appended to the base URL (mirrors the web `/api/event`). */
export const TELEMETRY_EVENT_PATH = '/api/event';

/** Strip a single trailing slash so joining with a leading-slash path is clean. */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Resolve the absolute telemetry endpoint (`${base}${TELEMETRY_EVENT_PATH}`).
 * `base` defaults to `EXPO_PUBLIC_API_BASE_URL` (then {@link DEFAULT_API_BASE_URL});
 * pass an explicit base in tests. Never throws.
 */
export function resolveTelemetryEndpoint(base?: string): string {
  const configured =
    base ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const normalized = configured.trim() === '' ? DEFAULT_API_BASE_URL : configured;
  return `${trimTrailingSlash(normalized)}${TELEMETRY_EVENT_PATH}`;
}
