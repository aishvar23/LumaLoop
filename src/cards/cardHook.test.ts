import { describe, expect, it } from 'vitest';

import { catalog } from './catalog';
import { DEFAULT_HOOK_BY_TEMPLATE, hookForCard } from './cardHook';
import { templateCategoryMap, type TemplateType } from './types';

describe('DEFAULT_HOOK_BY_TEMPLATE', () => {
  it('has a non-empty hook for every template type', () => {
    for (const template of Object.keys(templateCategoryMap) as TemplateType[]) {
      expect(DEFAULT_HOOK_BY_TEMPLATE[template]?.trim().length).toBeGreaterThan(
        0,
      );
    }
  });

  it('stays within positioning guardrails (no assessment/IQ language)', () => {
    for (const hook of Object.values(DEFAULT_HOOK_BY_TEMPLATE)) {
      expect(hook.toLowerCase()).not.toMatch(
        /\biq\b|brain|smarter|cognitive|intelligence|memory test|measure|assess/,
      );
    }
  });
});

describe('hookForCard', () => {
  it('uses the card hook when present', () => {
    expect(
      hookForCard({ templateType: 'spot_it', hook: 'Custom hook!' }),
    ).toBe('Custom hook!');
  });

  it('falls back to the template default when the hook is missing or blank', () => {
    expect(hookForCard({ templateType: 'maze_path' })).toBe(
      DEFAULT_HOOK_BY_TEMPLATE.maze_path,
    );
    expect(hookForCard({ templateType: 'maze_path', hook: '   ' })).toBe(
      DEFAULT_HOOK_BY_TEMPLATE.maze_path,
    );
  });

  it('returns a non-empty hook for every authored catalog card', () => {
    for (const card of catalog) {
      expect(hookForCard(card).trim().length).toBeGreaterThan(0);
    }
  });
});
