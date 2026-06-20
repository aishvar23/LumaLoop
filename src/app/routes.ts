/**
 * Route definitions and typed path helpers (Technical Design §12).
 *
 * Single home for the route constants and the helpers that build/encode their
 * paths. This module is intentionally routing-library- and telemetry-agnostic:
 * it knows nothing about React Router or the telemetry client. The router
 * (src/app/router.tsx) consumes {@link ROUTES}; the telemetry layer can later
 * consume {@link RouteKind} / {@link routeKindFor} without a dependency edge in
 * the other direction.
 */
export const ROUTES = {
  /** `/` — starts a normal bounded session. */
  session: '/',
  /**
   * `/feed` — PREVIEW of the endless full-screen swipe feed (#105). Additive
   * only: it does not replace `/` until the default swap (#107). Telemetry-wise
   * it is a `session` surface (it plays the same games), so it reuses that kind.
   */
  feed: '/feed',
  /** `/c/:cardId` — opens a single creator-attributed card from the catalog. */
  cardDeepLink: '/c/:cardId',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Route kind as surfaced to telemetry (`routeKind`, Technical Design §-telemetry
 * / Design §16). Mirrors the telemetry contract's union exactly, but is owned
 * here so routing never imports the telemetry client. The telemetry layer reads
 * this value; routing only produces it.
 */
export type RouteKind = 'session' | 'card_deep_link';

/** Maps an internal {@link RouteKey} to its telemetry {@link RouteKind}. */
export const routeKindFor: Record<RouteKey, RouteKind> = {
  session: 'session',
  feed: 'session',
  cardDeepLink: 'card_deep_link',
} as const;

/**
 * Build the share / deep-link path for a single card: `/c/<cardId>`.
 *
 * The `cardId` is URL-encoded so ids containing reserved characters round-trip
 * safely; read it back with {@link decodeURIComponent} (React Router already
 * decodes route params, so reading `params.cardId` needs no extra decode).
 */
export function buildCardDeepLink(cardId: string): string {
  return `/c/${encodeURIComponent(cardId)}`;
}
