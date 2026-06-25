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
  /**
   * `/` — the Home / Discover landing surface, the DEFAULT post-login screen
   * (accounts pivot). A signed-in user lands here (greeting, stats, featured
   * games) and enters the immersive feed from a "Start playing" CTA. This
   * replaces dropping straight into a game card on login.
   */
  home: '/',
  /**
   * `/feed` — the endless full-screen swipe feed (#107). Reached from Home's
   * "Start playing"; still the single feed entry (the bounded start-screen/
   * session/receipt flow it replaced is retired).
   */
  feed: '/feed',
  /** `/c/:cardId` — opens a single creator-attributed card from the catalog. */
  cardDeepLink: '/c/:cardId',
  /** `/auth/callback` — OAuth / magic-link PKCE return target (accounts pivot). */
  authCallback: '/auth/callback',
  /** `/you` — the signed-in user's profile + game-activity stats. */
  profile: '/you',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Route kind as surfaced to telemetry (`routeKind`, Technical Design §-telemetry
 * / Design §16). Mirrors the telemetry contract's union exactly, but is owned
 * here so routing never imports the telemetry client. The telemetry layer reads
 * this value; routing only produces it.
 */
export type RouteKind = 'session' | 'card_deep_link' | 'account';

/**
 * Maps an internal {@link RouteKey} to its telemetry {@link RouteKind}. Only the
 * `feed` route is a feed-telemetry surface (`session`). The Home landing and the
 * account routes (callback / profile) are not — they map to the `account` kind,
 * which the feed telemetry layer does not emit for.
 */
export const routeKindFor: Record<RouteKey, RouteKind> = {
  home: 'account',
  feed: 'session',
  cardDeepLink: 'card_deep_link',
  authCallback: 'account',
  profile: 'account',
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
