/**
 * Tests for the mobile profile-creation handle/display-name validation (accounts
 * pivot — mirrors the web profileValidation test). The rule must match the DB
 * check constraint (`^[a-z0-9_]{3,20}$` handle; 1–40 char display name).
 */
import { validateProfileInput } from './ProfileCreationScreen';
import { HANDLE_PATTERN } from '../core/auth/types';

describe('HANDLE_PATTERN', () => {
  it('accepts 3–20 lowercase letters, numbers, underscore', () => {
    expect(HANDLE_PATTERN.test('abc')).toBe(true);
    expect(HANDLE_PATTERN.test('player_one_99')).toBe(true);
    expect(HANDLE_PATTERN.test('a'.repeat(20))).toBe(true);
  });

  it('rejects too short / too long / uppercase / spaces / symbols', () => {
    expect(HANDLE_PATTERN.test('ab')).toBe(false);
    expect(HANDLE_PATTERN.test('a'.repeat(21))).toBe(false);
    expect(HANDLE_PATTERN.test('ABC')).toBe(false);
    expect(HANDLE_PATTERN.test('has space')).toBe(false);
    expect(HANDLE_PATTERN.test('bad-dash')).toBe(false);
  });
});

describe('validateProfileInput', () => {
  it('returns null for a valid handle + display name', () => {
    expect(validateProfileInput('player_one', 'Player One')).toBeNull();
  });

  it('flags an invalid handle', () => {
    expect(validateProfileInput('AB', 'Name')).toMatch(/handle/i);
  });

  it('flags an empty display name', () => {
    expect(validateProfileInput('player_one', '   ')).toMatch(/display name/i);
  });

  it('flags a display name over 40 chars', () => {
    expect(validateProfileInput('player_one', 'x'.repeat(41))).toMatch(
      /display name/i,
    );
  });
});
