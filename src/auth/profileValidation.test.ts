import { describe, expect, it } from 'vitest';

import { validateProfileInput } from './ProfileCreationScreen';
import { HANDLE_PATTERN } from './types';

describe('validateProfileInput', () => {
  it('accepts a valid handle + display name', () => {
    expect(validateProfileInput('player_one', 'Player One')).toBeNull();
    expect(validateProfileInput('abc', 'A')).toBeNull();
    expect(validateProfileInput('a1_2_3', 'x'.repeat(40))).toBeNull();
  });

  it('rejects handles outside the DB ^[a-z0-9_]{3,20}$ rule', () => {
    expect(validateProfileInput('ab', 'Name')).toMatch(/Handle/); // too short
    expect(validateProfileInput('a'.repeat(21), 'Name')).toMatch(/Handle/); // too long
    expect(validateProfileInput('UpperCase', 'Name')).toMatch(/Handle/); // caps
    expect(validateProfileInput('with space', 'Name')).toMatch(/Handle/); // space
    expect(validateProfileInput('dash-no', 'Name')).toMatch(/Handle/); // dash
  });

  it('rejects display names outside 1..40 chars', () => {
    expect(validateProfileInput('valid_one', '')).toMatch(/Display name/);
    expect(validateProfileInput('valid_one', '   ')).toMatch(/Display name/);
    expect(validateProfileInput('valid_one', 'x'.repeat(41))).toMatch(
      /Display name/,
    );
  });

  it('the client pattern matches the DB constraint exactly', () => {
    expect(HANDLE_PATTERN.test('good_123')).toBe(true);
    expect(HANDLE_PATTERN.test('Bad')).toBe(false);
  });
});
