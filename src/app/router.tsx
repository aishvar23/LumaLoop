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
import HomePage from '../profile/HomePage';
import AuthCallback from '../auth/AuthCallback';
import RequireAuth from '../auth/RequireAuth';
import ProfilePage from '../profile/ProfilePage';
import PeopleSearchPage from '../social/PeopleSearchPage';
import UserProfilePage from '../social/UserProfilePage';
import ChallengeRoute from '../social/ChallengeRoute';
import { NotFoundRoutePlaceholder } from './placeholders';

/** The route table. Mount under a router (BrowserRouter / MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      {/* `/` is the Home / Discover landing (accounts pivot), GATED behind auth:
          {@link RequireAuth} shows the login screen when signed out, the
          profile-creation screen when signed in without a profile, and the Home
          landing once a profile exists. Home is a clean presentational surface —
          it never touches the feed/session controller; "Start playing" routes to
          `/feed`. */}
      <Route
        path={ROUTES.home}
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      {/* `/feed` is the endless swipe feed (#107), reached from Home, also gated
          behind auth and layered with the one-time first-run data notice. The
          guard never touches the feed/session controller. */}
      <Route
        path={ROUTES.feed}
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
      {/* Search other users to follow (accounts pivot, Phase 2/3). */}
      <Route
        path={ROUTES.people}
        element={
          <RequireAuth>
            <PeopleSearchPage />
          </RequireAuth>
        }
      />
      {/* Another user's public profile + follow toggle. */}
      <Route
        path={ROUTES.userProfile}
        element={
          <RequireAuth>
            <UserProfilePage />
          </RequireAuth>
        }
      />
      {/* `/c/:cardId` — the PUBLIC, no-auth, playable challenge arrival surface
          (engagement strategy §4.6). Deliberately mounted OUTSIDE RequireAuth so
          a shared "beat my score" link is openable with no account. */}
      <Route path={ROUTES.cardDeepLink} element={<ChallengeRoute />} />
      {/* Catch-all → minimal not-found surface. */}
      <Route path="*" element={<NotFoundRoutePlaceholder />} />
    </Routes>
  );
}
