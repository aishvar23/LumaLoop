/**
 * Shared design tokens for the native feed — the one cohesive dark theme applied
 * across the slide shell, all four game renderers, the post-answer feedback step,
 * and the first-run notice (ADO #128, extended for MP3 #135 "TikTok/Instagram look
 * & feel").
 *
 * The web renderers drive their styling from CSS custom properties
 * (`var(--color-…)`, `var(--space-…)`); React Native has no cascade, so every RN
 * surface shares these plain constants instead. Centralising them here is what
 * keeps the immersive feed look consistent — one palette, one type scale, one
 * spacing/radius/elevation system — so a new game inherits the feel for free
 * (Design §7 / Technical Design §14).
 *
 * Colour is never the SOLE carrier of meaning anywhere (anomaly = glyph, rule flip
 * = text + banner, selection = explicit pressed/▸ marker, feedback = the outcome
 * WORD), so these tokens — including the success/incorrect feedback hues, which only
 * REINFORCE the wording — stay colour-blind safe by construction. The feedback hues
 * are tuned for AA contrast against the dark surfaces they sit on.
 */

export const colors = {
  /** Primary readable text on the dark feed surface. */
  text: '#f4f4f8',
  /** Secondary / supporting copy. */
  textMuted: '#9aa0aa',
  /** Faint copy for the most ambient hints (swipe cue, decorative meta). */
  textFaint: '#71717f',
  /** Raised interactive surface (cells, options, buttons). */
  surface: '#1c1c24',
  /** A slightly lighter raised surface for elevated tiles/cards that catch light. */
  surfaceRaised: '#24242f',
  /** A pressed / selected raised surface — paired with a non-colour cue. */
  surfaceSelected: '#33333f',
  /** The surface while a tile is held down (pressed feedback). */
  surfacePressed: '#2c2c38',
  /** Hairline border around interactive surfaces. */
  border: '#3a3a46',
  /** Stronger border to mark a selected/active surface (non-colour cue backup). */
  borderStrong: '#e7e7ee',
  /** Accent for primary affordances (Start / commit). */
  accent: '#5b8cff',
  /** A deeper accent stop for the primary-button gradient / pressed state. */
  accentDeep: '#3f6ad8',
  /** Readable text on the accent fill. */
  accentContrast: '#0b0b0f',
  /** Avatar monogram circle for the creator byline. */
  avatar: '#5b8cff',
  /** Warning border for the rule-flip "rule changed" banner. */
  warning: '#f5b14c',
  /** Positive feedback hue — reinforces the "Correct" word, never the sole cue. */
  success: '#54d6a0',
  /** Tinted fill behind a correct result card. */
  successSurface: 'rgba(84, 214, 160, 0.12)',
  /** Border for a correct result card. */
  successBorder: 'rgba(84, 214, 160, 0.55)',
  /** "Not quite" / "Time's up" hue — reinforces the word, never the sole cue. */
  danger: '#ff9a8b',
  /** Tinted fill behind an incorrect/timeout result card. */
  dangerSurface: 'rgba(255, 154, 139, 0.12)',
  /** Border for an incorrect/timeout result card. */
  dangerBorder: 'rgba(255, 154, 139, 0.5)',
} as const;

/**
 * Full-bleed slide background. A subtle vertical gradient (top → bottom) layered
 * over the app's near-black page colour gives each card depth without the flat,
 * "plain" look — TikTok/Reels-style immersion. The first/last stops stay close to
 * {@link PAGE_BACKGROUND} so paging between slides never flashes a seam.
 */
export const PAGE_BACKGROUND = '#0b0b0f';
export const slideGradient = {
  colors: ['#16161f', '#0b0b0f', '#070709'] as const,
  locations: [0, 0.55, 1] as const,
  start: { x: 0.5, y: 0 } as const,
  end: { x: 0.5, y: 1 } as const,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 36,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  /** Hero prompt — the TikTok-caption-style headline that leads each game. */
  hero: 27,
  xl: 32,
} as const;

/** Multipliers applied to a font size to get a readable line height (AA legibility). */
export const lineHeight = {
  tight: 1.18,
  normal: 1.35,
  relaxed: 1.5,
} as const;

/**
 * Font-weight scale. `as const` keeps the values as the string literals RN's
 * `fontWeight` style prop expects.
 */
export const fontWeight = {
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/**
 * Soft elevation presets (iOS shadow + Android `elevation`) spread into styles to
 * lift interactive tiles and result cards off the dark background. Kept subtle so
 * they never cost frames on the 60fps feed.
 */
export const elevation = {
  tile: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/**
 * WCAG 2.5.5 minimum tap target. Mirrors the web `--tap-target-min`; every
 * interactive cell/option/button in the renderers is at least this tall/wide.
 */
export const TAP_TARGET_MIN = 48;
