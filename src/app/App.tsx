import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * App root. Mounts the auth context (accounts pivot — users must sign in + create
 * a profile before the feed) around the client-side router (Technical Design §12);
 * the route table in {@link AppRoutes} selects which top-level element renders for
 * `/` (the gated endless feed), `/auth/callback` (OAuth/magic-link return), `/you`
 * (the profile), and `/c/:cardId` (single-card share). App stays routing/auth-
 * wiring only — feed progression lives in the feed controller (CLAUDE.md §4) and
 * the auth gate is a clean wrapper, not a dependency of the engine.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
