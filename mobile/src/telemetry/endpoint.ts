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
 * NOTE (real-device delivery — ADO #82): the placeholder default is the project's
 * preview URL; the STABLE production URL must be set in `.env.production` AND
 * Vercel Deployment Protection must be lifted on `/api/event` before a real
 * device can actually deliver. Until then the client is exercised against a FAKE
 * transport in unit tests (mirroring the web #75 posture).
 */

/**
 * Documented placeholder base URL. Overridden per environment via
 * `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env*`. No trailing slash.
 */
export const DEFAULT_API_BASE_URL = 'https://luma-loop.vercel.app';

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
