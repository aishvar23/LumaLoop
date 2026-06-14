/**
 * Typed bridge between component props and the CSS custom properties declared
 * in src/styles/tokens.css. Layout primitives map a small, finite scale onto
 * `var(--…)` references instead of hardcoding pixels, so spacing stays
 * consistent and themable from one place.
 */

/** Steps on the spacing scale. `0` means "no space" (CSS `0`). */
export type SpaceScale = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Resolve a spacing-scale step to its CSS token (`0` → the literal `0`). */
export function spaceToken(step: SpaceScale): string {
  return step === 0 ? '0' : `var(--space-${step})`;
}

/** Flexbox alignment options shared by the layout primitives. */
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Flexbox justification options shared by the layout primitives. */
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around';

const ALIGN_MAP: Record<Align, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY_MAP: Record<Justify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
};

/** Map an `Align` prop to its CSS `align-items` value. */
export function alignItems(align: Align): string {
  return ALIGN_MAP[align];
}

/** Map a `Justify` prop to its CSS `justify-content` value. */
export function justifyContent(justify: Justify): string {
  return JUSTIFY_MAP[justify];
}
