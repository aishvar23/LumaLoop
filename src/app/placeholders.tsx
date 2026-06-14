/**
 * Top-level route placeholder elements (Azure DevOps #52, Technical Design §12).
 *
 * These are deliberately minimal stand-ins so `/` and `/c/:cardId` resolve
 * today. The REAL screens are other tasks and must replace these here:
 *   - Start / Session screen + feed → #69-72
 *   - Session reducer / controller   → #58-59
 *   - Single-card (deep-link) render → #69-72 (share arrival surface)
 * Routing only selects which element renders; it must never own session
 * progression (CLAUDE.md §4). Keep that boundary when swapping these out.
 */
import { useParams } from 'react-router-dom';
import Screen from '../ui/Screen';
import Stack from '../ui/Stack';
import StartScreen from '../ui/StartScreen';
import { ROUTES } from './routes';

/**
 * `/` placeholder. Reuses the scaffold {@link StartScreen} so the "LumaLoop"
 * brand and the required anonymous-data / non-assessment disclaimer stay on the
 * session route until the real Start screen (#69-72) lands.
 */
export function SessionRoutePlaceholder() {
  return <StartScreen />;
}

/**
 * `/c/:cardId` placeholder. Reads and exposes the (already-decoded) `cardId`
 * route param. React Router decodes path params, so `params.cardId` is the
 * raw id that `buildCardDeepLink` encoded — no manual decode needed.
 * The real single-card share surface (#69-72) replaces this.
 */
export function CardDeepLinkRoutePlaceholder() {
  const { cardId } = useParams<'cardId'>();

  return (
    <Screen aria-labelledby="deep-link-heading">
      <Stack gap={3}>
        <h1 id="deep-link-heading" style={{ margin: 0 }}>
          Shared card
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          Single-card deep-link placeholder — the real share surface is task
          #69-72.
        </p>
        {/* Surface the decoded id so the share target is verifiable. */}
        <p style={{ margin: 0 }}>
          Card id: <code data-testid="deep-link-card-id">{cardId}</code>
        </p>
      </Stack>
    </Screen>
  );
}

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
          That link doesn’t lead anywhere in LumaLoop.
        </p>
        <a href={ROUTES.session}>Back to start</a>
      </Stack>
    </Screen>
  );
}
