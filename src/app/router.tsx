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
import FeedRoute from '../feed/FeedRoute';
import AuthCallback from '../auth/AuthCallback';
import RequireAuth from '../auth/RequireAuth';
import ProfilePage from '../profile/ProfilePage';
import {
  CardDeepLinkRoutePlaceholder,
  NotFoundRoutePlaceholder,
} from './placeholders';

/** The route table. Mount under a router (BrowserRouter / MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      {/* `/` is the endless swipe feed (#107), now GATED behind auth (accounts
          pivot): {@link RequireAuth} shows the login screen when signed out, the
          profile-creation screen when signed in without a profile, and the feed
          (with the one-time data notice) once a profile exists. The guard is a
          clean wrapper — it never touches the feed/session controller. */}
      <Route
        path={ROUTES.session}
        element={
          <RequireAuth>
            <FeedRoute />
          </RequireAuth>
        }
      />
      {/* OAuth / magic-link PKCE return target — completes the exchange then
          redirects into the app (no auth gate; it IS the auth step). */}
      <Route path={ROUTES.authCallback} element={<AuthCallback />} />
      {/* The signed-in user's profile + game-activity stats (auth-gated). */}
      <Route
        path={ROUTES.profile}
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.cardDeepLink}
        element={<CardDeepLinkRoutePlaceholder />}
      />
      {/* Catch-all → minimal not-found surface. */}
      <Route path="*" element={<NotFoundRoutePlaceholder />} />
    </Routes>
  );
}
