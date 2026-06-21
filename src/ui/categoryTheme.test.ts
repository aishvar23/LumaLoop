import {
  categoryThemes,
  FALLBACK_THEME,
  resolveCategoryTheme,
} from './categoryTheme';
import { templateCategoryMap } from '../cards/types';
import type { ChallengeCategory } from '../cards/types';

// The full category union, derived from the single source of truth so a new
// category added to `templateCategoryMap` is exercised here automatically.
const ALL_CATEGORIES: ChallengeCategory[] = Array.from(
  new Set(Object.values(templateCategoryMap).flat()),
);

describe('categoryThemes', () => {
  it('defines a theme for every category used by a template', () => {
    for (const category of ALL_CATEGORIES) {
      expect(categoryThemes[category]).toBeDefined();
    }
  });

  it('maps each category to its own --cat-<category> token references', () => {
    for (const category of Object.keys(categoryThemes) as ChallengeCategory[]) {
      const t = categoryThemes[category];
      expect(t.accent).toBe(`var(--cat-${category})`);
      expect(t.accentDeep).toBe(`var(--cat-${category}-deep)`);
      expect(t.accentTint).toBe(`var(--cat-${category}-tint)`);
    }
  });

  it('gives every category a distinct accent (no two share a hue token)', () => {
    const accents = Object.values(categoryThemes).map((t) => t.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(categoryThemes)).toBe(true);
  });
});

describe('resolveCategoryTheme', () => {
  it('resolves every known category to its defined theme', () => {
    for (const category of ALL_CATEGORIES) {
      expect(resolveCategoryTheme(category)).toEqual(categoryThemes[category]);
    }
  });

  it('falls back for an unknown category', () => {
    expect(resolveCategoryTheme('not_a_real_category')).toBe(FALLBACK_THEME);
  });

  it('falls back for an absent category', () => {
    expect(resolveCategoryTheme(undefined)).toBe(FALLBACK_THEME);
  });

  it('the fallback theme references the shared brand accent, not a category hue', () => {
    expect(FALLBACK_THEME.accent).toBe('var(--color-accent)');
    expect(FALLBACK_THEME.accent).not.toContain('--cat-');
  });
});
