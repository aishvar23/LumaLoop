/**
 * Route definitions (Technical Design §12).
 *
 * Placeholder: the router and session/deep-link wiring land in a later task.
 * Kept here so route constants have a single home from the start.
 */
export const ROUTES = {
  /** `/` — starts a normal bounded session. */
  session: '/',
  /** `/c/:cardId` — opens a single creator-attributed card from the catalog. */
  cardDeepLink: '/c/:cardId',
} as const;

export type RouteKey = keyof typeof ROUTES;
