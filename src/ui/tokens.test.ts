import {
  alignItems,
  justifyContent,
  spaceToken,
  type Align,
  type Justify,
} from './tokens';

describe('spaceToken', () => {
  it('maps step 0 to a literal "0" (no var reference)', () => {
    expect(spaceToken(0)).toBe('0');
  });

  it('maps non-zero steps to their --space-* custom property', () => {
    expect(spaceToken(1)).toBe('var(--space-1)');
    expect(spaceToken(3)).toBe('var(--space-3)');
    expect(spaceToken(6)).toBe('var(--space-6)');
  });
});

describe('alignItems', () => {
  it.each<[Align, string]>([
    ['start', 'flex-start'],
    ['center', 'center'],
    ['end', 'flex-end'],
    ['stretch', 'stretch'],
    ['baseline', 'baseline'],
  ])('maps %s to %s', (input, expected) => {
    expect(alignItems(input)).toBe(expected);
  });
});

describe('justifyContent', () => {
  it.each<[Justify, string]>([
    ['start', 'flex-start'],
    ['center', 'center'],
    ['end', 'flex-end'],
    ['between', 'space-between'],
    ['around', 'space-around'],
  ])('maps %s to %s', (input, expected) => {
    expect(justifyContent(input)).toBe(expected);
  });
});
