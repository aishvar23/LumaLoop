/**
 * Tests for the anonymous user identity (Technical Design §10).
 *
 * Exercised with FAKE storage + FAKE uuid generators so the generate-once,
 * read-through, and best-effort (storage-failure) behaviours are deterministic
 * and free of hidden globals.
 */

import { describe, expect, it } from 'vitest';

import {
  ANONYMOUS_USER_ID_STORAGE_KEY,
  createAnonymousUserIdProvider,
  generateUuidV4,
  getAnonymousUserId,
  type ReadWriteStorage,
} from './anonymousUser';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A minimal in-memory `Storage`-like fake. */
function fakeStorage(seed?: Record<string, string>): ReadWriteStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** A storage that throws on every access (private-mode / disabled simulation). */
function throwingStorage(): ReadWriteStorage {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
}

/** A deterministic uuid generator yielding distinct ids per call. */
function sequentialUuids(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
}

describe('getAnonymousUserId provider', () => {
  it('generates + persists an id on first call with empty storage', () => {
    const storage = fakeStorage();
    const generateUuid = sequentialUuids();
    const provider = createAnonymousUserIdProvider({ storage, generateUuid });

    const id = provider.getAnonymousUserId();

    expect(id).toBe('00000000-0000-4000-8000-000000000001');
    // Persisted under the namespaced key for the next page load.
    expect(storage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY)).toBe(id);
  });

  it('returns the SAME id on repeated calls (generate-once)', () => {
    const provider = createAnonymousUserIdProvider({
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
    });

    const first = provider.getAnonymousUserId();
    const second = provider.getAnonymousUserId();

    expect(second).toBe(first);
  });

  it('returns a pre-seeded valid id as-is (no regeneration)', () => {
    const seeded = '11111111-2222-4333-8444-555555555555';
    const storage = fakeStorage({ [ANONYMOUS_USER_ID_STORAGE_KEY]: seeded });
    const generateUuid = sequentialUuids();
    const provider = createAnonymousUserIdProvider({ storage, generateUuid });

    expect(provider.getAnonymousUserId()).toBe(seeded);
    // The generator was never consulted: a fresh provider would yield ...0001.
    expect(provider.getAnonymousUserId()).toBe(seeded);
  });

  it('ignores a malformed persisted value and regenerates', () => {
    const storage = fakeStorage({
      [ANONYMOUS_USER_ID_STORAGE_KEY]: 'not-a-uuid',
    });
    const provider = createAnonymousUserIdProvider({
      storage,
      generateUuid: sequentialUuids(),
    });

    const id = provider.getAnonymousUserId();

    expect(id).toBe('00000000-0000-4000-8000-000000000001');
    expect(storage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY)).toBe(id);
  });

  it('does NOT throw when storage fails, yielding a stable in-memory id', () => {
    const provider = createAnonymousUserIdProvider({
      storage: throwingStorage(),
      generateUuid: sequentialUuids(),
    });

    let first = '';
    expect(() => {
      first = provider.getAnonymousUserId();
    }).not.toThrow();

    // Best-effort: a single generated id, stable for the page lifetime.
    expect(first).toBe('00000000-0000-4000-8000-000000000001');
    expect(provider.getAnonymousUserId()).toBe(first);
  });

  it('falls back to an in-memory id when storage is explicitly absent (null)', () => {
    const provider = createAnonymousUserIdProvider({
      storage: null,
      generateUuid: sequentialUuids(),
    });

    const id = provider.getAnonymousUserId();
    expect(id).toBe('00000000-0000-4000-8000-000000000001');
    expect(provider.getAnonymousUserId()).toBe(id);
  });

  it('generates RFC-4122 v4 ids that are unique across fresh stores', () => {
    // No injected generator → exercises the real generateUuidV4 path.
    const a = createAnonymousUserIdProvider({
      storage: fakeStorage(),
    }).getAnonymousUserId();
    const b = createAnonymousUserIdProvider({
      storage: fakeStorage(),
    }).getAnonymousUserId();

    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});

describe('generateUuidV4', () => {
  it('produces RFC-4122 v4 shaped, unique values', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUuidV4()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });
});

describe('getAnonymousUserId (default provider)', () => {
  it('is stable across calls and RFC-4122 v4 shaped', () => {
    const first = getAnonymousUserId();
    expect(first).toMatch(UUID_V4);
    expect(getAnonymousUserId()).toBe(first);
  });
});
