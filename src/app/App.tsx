import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';

/**
 * App root. Mounts the client-side router (Technical Design §12); the route
 * table in {@link AppRoutes} selects which top-level element renders for `/`
 * (the endless feed, #107) and `/c/:cardId` (single-card share). App stays
 * routing-only — feed progression lives in the feed controller (CLAUDE.md §4).
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
