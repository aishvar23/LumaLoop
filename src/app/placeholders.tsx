/**
 * Top-level route placeholder elements (Azure DevOps #52, Technical Design §12).
 *
 * These are deliberately minimal stand-ins so `/c/:cardId` and unknown paths
 * resolve today. The REAL screens are other tasks and must replace these here:
 *   - Single-card (deep-link) render → #69-72 (share arrival surface)
 * The `/` route mounts the Home landing and `/feed` mounts the endless feed
 * (#107). Routing only selects which element renders; it must never own
 * feed/session progression (CLAUDE.md §4). Keep that boundary when swapping
 * these out.
 */
import { Link } from 'react-router-dom';
import Screen from '../ui/Screen';
import Stack from '../ui/Stack';
import { ROUTES } from './routes';

/**
 * Catch-all placeholder for unknown paths. Renders a minimal not-found surface
 * through the {@link Screen} primitive (consistent safe-area/layout) with a
 * link back to the session route.
 */
export function NotFoundRoutePlaceholder() {
  return (
    <Screen aria-labelledby="not-found-heading">
      <Stack gap={3}>
        <h1 id="not-found-heading" style={{ margin: 0 }}>
          Page not found
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          That link doesn’t lead anywhere in Witzy.
        </p>
        {/* Client-side nav: `Link` keeps SPA state instead of full reload. */}
        <Link to={ROUTES.home}>Back to home</Link>
      </Stack>
    </Screen>
  );
}
