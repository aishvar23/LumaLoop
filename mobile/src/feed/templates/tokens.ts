/**
 * Shared design tokens for the native game renderers (ADO #128).
 *
 * The web renderers drive their styling from CSS custom properties
 * (`var(--color-…)`, `var(--space-…)`); React Native has no cascade, so the four
 * RN renderers share these plain constants instead. Centralising them here keeps
 * token/style consistency across the renderers and with the feed shell
 * (`FeedScreen`'s dark palette: `#0b0b0f` page, `#2a2a35` raised surface,
 * `#e7e7ee` text, `#9aa0aa` muted) — Design §7 / Technical Design §14.
 *
 * Colour is never the sole carrier of meaning in any renderer (anomaly = glyph,
 * rule flip = text + banner, selection = explicit pressed/▸ marker), so these
 * tokens stay colour-blind safe by construction.
 */

export const colors = {
  /** Primary readable text on the dark feed surface. */
  text: '#f4f4f8',
  /** Secondary / supporting copy. */
  textMuted: '#9aa0aa',
  /** Raised interactive surface (cells, options, buttons). */
  surface: '#1c1c24',
  /** A pressed / selected raised surface — paired with a non-colour cue. */
  surfaceSelected: '#33333f',
  /** Hairline border around interactive surfaces. */
  border: '#3a3a46',
  /** Stronger border to mark a selected/active surface (non-colour cue backup). */
  borderStrong: '#e7e7ee',
  /** Accent for primary affordances (Start / commit). */
  accent: '#5b8cff',
  /** Readable text on the accent fill. */
  accentContrast: '#0b0b0f',
  /** Warning border for the rule-flip "rule changed" banner. */
  warning: '#f5b14c',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  md: 12,
  pill: 999,
} as const;

export const fontSize = {
  sm: 13,
  md: 16,
  lg: 20,
  xl: 32,
} as const;

/**
 * WCAG 2.5.5 minimum tap target. Mirrors the web `--tap-target-min`; every
 * interactive cell/option/button in the renderers is at least this tall/wide.
 */
export const TAP_TARGET_MIN = 48;
