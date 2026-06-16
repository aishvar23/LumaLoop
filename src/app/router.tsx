/**
 * Client-side route table (Azure DevOps #52, Technical Design §12).
 *
 * Defines the SPA's top-level routes and maps each to a placeholder element.
 * {@link AppRoutes} is the library-agnostic-ish route table (just a `<Routes>`
 * subtree) so it can be mounted under any router: {@link App} wraps it in a
 * `BrowserRouter` for the real app, and tests mount it under a `MemoryRouter`.
 *
 * Routing here only selects which top-level element renders. It deliberately
 * holds no session state and drives no progression — the feed/session
 * controller stays independent of routing (CLAUDE.md §4).
 */
import { Route, Routes } from 'react-router-dom';
import { ROUTES } from './routes';
import {
  CardDeepLinkRoutePlaceholder,
  NotFoundRoutePlaceholder,
  SessionRoutePlaceholder,
} from './placeholders';

/** The route table. Mount under a router (BrowserRouter / MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.session} element={<SessionRoutePlaceholder />} />
      <Route
        path={ROUTES.cardDeepLink}
        element={<CardDeepLinkRoutePlaceholder />}
      />
      {/* Catch-all → minimal not-found surface. */}
      <Route path="*" element={<NotFoundRoutePlaceholder />} />
    </Routes>
  );
}
