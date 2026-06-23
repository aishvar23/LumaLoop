import {
  categoryAccent,
  categoryAccents,
  FALLBACK_CATEGORY_ACCENT,
} from './tokens';
import { templateCategoryMap } from '../../core/cards/types';

// The full category union, derived from the single source of truth so a new
// category added to `templateCategoryMap` is exercised here automatically.
const ALL_CATEGORIES = Array.from(
  new Set(Object.values(templateCategoryMap).flat()),
);

describe('categoryAccents', () => {
  it('defines an accent for every category used by a template', () => {
    for (const category of ALL_CATEGORIES) {
      expect(
        categoryAccents[category as keyof typeof categoryAccents],
      ).toBeDefined();
    }
  });

  it('gives every category a distinct accent hue', () => {
    const accents = Object.values(categoryAccents).map((a) => a.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('defines semantic game surfaces for every category palette', () => {
    for (const palette of Object.values(categoryAccents)) {
      expect(palette.deep).toMatch(/^#/);
      expect(palette.surface).toContain('rgba(');
      expect(palette.surfaceRaised).toContain('rgba(');
      expect(palette.surfaceStrong).toContain('rgba(');
      expect(palette.border).toContain('rgba(');
      expect(palette.glow).toContain('rgba(');
      expect(palette.surfaceRaised).not.toBe(palette.surfaceStrong);
    }
  });
});

describe('categoryAccent', () => {
  it('resolves every known category to its defined accent', () => {
    for (const category of ALL_CATEGORIES) {
      expect(categoryAccent(category)).toEqual(
        categoryAccents[category as keyof typeof categoryAccents],
      );
    }
  });

  it('falls back for an unknown category', () => {
    expect(categoryAccent('not_a_real_category')).toBe(
      FALLBACK_CATEGORY_ACCENT,
    );
  });

  it('falls back for an absent category', () => {
    expect(categoryAccent(undefined)).toBe(FALLBACK_CATEGORY_ACCENT);
  });
});
