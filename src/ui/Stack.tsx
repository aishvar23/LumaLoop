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

export type StackProps = ComponentPropsWithoutRef<'div'> & {
  /** Semantic element to render. Defaults to a non-semantic `div`. */
  as?: ElementType;
  /** Vertical gap between children, on the spacing scale. */
  gap?: SpaceScale;
  /** Cross-axis (horizontal) alignment of children. */
  align?: Align;
  /** Main-axis (vertical) distribution of children. */
  justify?: Justify;
};

/**
 * Vertical layout primitive: a flex column that spaces its children using a
 * single spacing-scale token. Purely presentational — no business logic.
 * Consumes `var(--space-*)` so spacing stays token-driven (Design tokens, #51).
 */
export default function Stack({
  as: Tag = 'div',
  gap = 3,
  align = 'stretch',
  justify = 'start',
  style,
  ...rest
}: StackProps) {
  const layout: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: spaceToken(gap),
    alignItems: alignItems(align),
    justifyContent: justifyContent(justify),
  };
  return <Tag style={{ ...layout, ...style }} {...rest} />;
}
