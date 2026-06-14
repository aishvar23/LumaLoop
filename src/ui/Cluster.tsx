import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
} from 'react';
import {
  type Align,
  type Justify,
  type SpaceScale,
  alignItems,
  justifyContent,
  spaceToken,
} from './tokens';

export type ClusterProps = ComponentPropsWithoutRef<'div'> & {
  /** Semantic element to render. Defaults to a non-semantic `div`. */
  as?: ElementType;
  /** Gap between children (row and column gap), on the spacing scale. */
  gap?: SpaceScale;
  /** Cross-axis (vertical) alignment of children. */
  align?: Align;
  /** Main-axis (horizontal) distribution of children. */
  justify?: Justify;
  /** Wrap children onto multiple rows when they overflow. Defaults to `true`
   * so small viewports never force horizontal scrolling. */
  wrap?: boolean;
};

/**
 * Horizontal layout primitive: a flex row that groups its children with a
 * single spacing-scale token and wraps by default for small viewports. Purely
 * presentational — no business logic. Consumes `var(--space-*)`.
 */
export default function Cluster({
  as: Tag = 'div',
  gap = 2,
  align = 'center',
  justify = 'start',
  wrap = true,
  style,
  ...rest
}: ClusterProps) {
  const layout: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: wrap ? 'wrap' : 'nowrap',
    gap: spaceToken(gap),
    alignItems: alignItems(align),
    justifyContent: justifyContent(justify),
  };
  return <Tag style={{ ...layout, ...style }} {...rest} />;
}
