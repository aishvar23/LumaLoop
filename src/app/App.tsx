import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';

/**
 * App root. Mounts the client-side router (Technical Design §12); the route
 * table in {@link AppRoutes} selects which top-level placeholder renders for
 * `/` (session) and `/c/:cardId` (single-card share). The real Start/feed/
 * receipt screens and the session controller are wired up in later tasks and
 * replace the placeholders behind these routes — App stays routing-only.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
