import type { ComponentPropsWithoutRef, CSSProperties, ElementType } from 'react';
import { type SpaceScale, spaceToken } from './tokens';

export type ScreenProps = ComponentPropsWithoutRef<'main'> & {
  /** Semantic element to render. Defaults to `main` (the primary landmark). */
  as?: ElementType;
  /** Inner content padding on every side, on the spacing scale. */
  padding?: SpaceScale;
  /** Whether the screen body scrolls vertically. Defaults to `true`. */
  scrollable?: boolean;
};

/**
 * App-shell / screen wrapper: the vertical scroll container for one screen.
 *
 * Owns the vertical safe-area insets (status bar / home indicator) by folding
 * them into the top/bottom padding, so content never hides behind hardware.
 * The horizontal insets are owned by `#root` (see src/styles/global.css), so
 * the two never double up. Fills the remaining column height (`flex: 1`) and
 * keeps a stable layout across small viewports.
 *
 * Purely presentational — no session/feed/routing/telemetry logic.
 */
export default function Screen({
  as: Tag = 'main',
  padding = 3,
  scrollable = true,
  style,
  ...rest
}: ScreenProps) {
  const pad = spaceToken(padding);
  const layout: CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflowY: scrollable ? 'auto' : 'visible',
    WebkitOverflowScrolling: 'touch',
    paddingTop: `calc(${pad} + var(--safe-top))`,
    paddingBottom: `calc(${pad} + var(--safe-bottom))`,
    paddingLeft: pad,
    paddingRight: pad,
  };
  return <Tag style={{ ...layout, ...style }} {...rest} />;
}
