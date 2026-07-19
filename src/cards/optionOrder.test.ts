/**
 * Tests for the deterministic, card-seeded option ordering helper used by every
 * MCQ-style renderer to make the correct option's POSITION unpredictable while
 * keeping evaluation (which is by id) intact.
 */

import { describe, expect, it } from 'vitest';

import { orderOptions } from './optionOrder';

type Opt = { id: string; label: string };

const opts = (...ids: string[]): Opt[] =>
  ids.map((id) => ({ id, label: id.toUpperCase() }));

describe('orderOptions', () => {
  it('is deterministic: same seed + same options ⇒ same order', () => {
    const input = opts('a', 'b', 'c', 'd');
    const first = orderOptions('card-1', input);
    const second = orderOptions('card-1', input);
    expect(second).toEqual(first);
  });

  it('returns a permutation: same elements, same length, no loss/duplication', () => {
    const input = opts('a', 'b', 'c', 'd', 'e');
    const ordered = orderOptions('seed-x', input);
    expect(ordered).toHaveLength(input.length);
    expect([...ordered].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...input].sort((x, y) => x.id.localeCompare(y.id)),
    );
    // The correct option (any id) is always still present.
    for (const opt of input) {
      expect(ordered).toContainEqual(opt);
    }
  });

  it('does not mutate the input array', () => {
    const input = opts('a', 'b', 'c', 'd');
    const snapshot = input.map((o) => o.id);
    orderOptions('whatever', input);
    expect(input.map((o) => o.id)).toEqual(snapshot);
  });

  it('actually reorders for typical inputs (not the identity permutation)', () => {
    // Find at least one seed for which a 4-element list is reordered. With a real
    // shuffle this is overwhelmingly the common case; assert it concretely so a
    // regression to "return input unchanged" is caught.
    const input = opts('a', 'b', 'c', 'd');
    const reordered = ['s1', 's2', 's3', 's4', 's5'].some((seed) => {
      const out = orderOptions(seed, input).map((o) => o.id);
      return out.join(',') !== 'a,b,c,d';
    });
    expect(reordered).toBe(true);
  });

  it('spreads the correct option across positions over many seeds', () => {
    // The whole point: the FIRST-authored option should not stay first. Over many
    // distinct card seeds, the authored-first option lands in varied positions.
    const input = opts('correct', 'w1', 'w2', 'w3');
    const positions = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const out = orderOptions(`card-${i}`, input);
      positions.add(out.findIndex((o) => o.id === 'correct'));
    }
    // It must reach more than just slot 0 (otherwise the bug persists).
    expect(positions.size).toBeGreaterThan(1);
    expect([...positions].some((p) => p !== 0)).toBe(true);
  });

  it('different seeds typically give different orders', () => {
    const input = opts('a', 'b', 'c', 'd');
    const orderA = orderOptions('alpha', input).map((o) => o.id).join();
    const orderB = orderOptions('beta', input).map((o) => o.id).join();
    expect(orderA).not.toEqual(orderB);
  });

  it('per-step seeds (cardId:stepIndex) shuffle steps independently', () => {
    const input = opts('a', 'b', 'c', 'd');
    const step0 = orderOptions('card:0', input).map((o) => o.id).join();
    const step1 = orderOptions('card:1', input).map((o) => o.id).join();
    expect(step0).not.toEqual(step1);
  });

  it('returns a copy unchanged for empty and singleton lists', () => {
    expect(orderOptions('s', [])).toEqual([]);
    const single = opts('only');
    const out = orderOptions('s', single);
    expect(out).toEqual(single);
    expect(out).not.toBe(single); // a copy, not the same reference
  });
});
