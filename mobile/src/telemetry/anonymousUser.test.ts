/**
 * Tests for the RN anonymous user id (ADO #129, M5). Against an in-memory async
 * storage + deterministic uuid: generate-once, persistence, second-load stability,
 * and a non-throwing in-memory fallback when storage fails.
 */
import {
  ANONYMOUS_USER_ID_STORAGE_KEY,
  createAnonymousUserIdProvider,
} from './anonymousUser';
import type { AsyncReadWriteStorage } from './storage';

function makeStorage(seed: Record<string, string> = {}): AsyncReadWriteStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

const FIXED_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSISTED_UUID = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';

describe('anonymousUser (RN)', () => {
  it('generates once and persists when no id exists', async () => {
    const storage = makeStorage();
    const provider = createAnonymousUserIdProvider({
      storage,
      generateUuid: () => FIXED_UUID,
    });

    const id = await provider.ensureAnonymousUserId();
    expect(id).toBe(FIXED_UUID);
    // Persisted under the namespaced key.
    expect(storage.map.get(ANONYMOUS_USER_ID_STORAGE_KEY)).toBe(FIXED_UUID);
    // Repeated calls return the SAME id and don't re-generate.
    expect(await provider.ensureAnonymousUserId()).toBe(FIXED_UUID);
    expect(provider.getAnonymousUserId()).toBe(FIXED_UUID);
  });

  it('adopts a previously-persisted id (second load returns the same id)', async () => {
    const storage = makeStorage({
      [ANONYMOUS_USER_ID_STORAGE_KEY]: PERSISTED_UUID,
    });
    // Even though the generator would produce a different id, the persisted one wins.
    const provider = createAnonymousUserIdProvider({
      storage,
      generateUuid: () => FIXED_UUID,
    });

    const id = await provider.ensureAnonymousUserId();
    expect(id).toBe(PERSISTED_UUID);
    expect(provider.getAnonymousUserId()).toBe(PERSISTED_UUID);
  });

  it('ignores a malformed persisted value and regenerates', async () => {
    const storage = makeStorage({
      [ANONYMOUS_USER_ID_STORAGE_KEY]: 'not-a-uuid',
    });
    const provider = createAnonymousUserIdProvider({
      storage,
      generateUuid: () => FIXED_UUID,
    });

    const id = await provider.ensureAnonymousUserId();
    expect(id).toBe(FIXED_UUID);
    expect(storage.map.get(ANONYMOUS_USER_ID_STORAGE_KEY)).toBe(FIXED_UUID);
  });

  it('concurrent ensure calls resolve to one id and read storage once', async () => {
    let reads = 0;
    const storage: AsyncReadWriteStorage = {
      async getItem() {
        reads += 1;
        return null;
      },
      async setItem() {},
    };
    const provider = createAnonymousUserIdProvider({
      storage,
      generateUuid: () => FIXED_UUID,
    });

    const [a, b] = await Promise.all([
      provider.ensureAnonymousUserId(),
      provider.ensureAnonymousUserId(),
    ]);
    expect(a).toBe(FIXED_UUID);
    expect(b).toBe(FIXED_UUID);
    expect(reads).toBe(1);
  });

  it('falls back to a stable in-memory id when storage is disabled (null)', async () => {
    const provider = createAnonymousUserIdProvider({
      storage: null,
      generateUuid: () => FIXED_UUID,
    });

    const id = await provider.ensureAnonymousUserId();
    expect(id).toBe(FIXED_UUID);
    expect(provider.getAnonymousUserId()).toBe(FIXED_UUID);
  });

  it('never throws when storage access fails — uses the in-memory fallback', async () => {
    const throwingStorage: AsyncReadWriteStorage = {
      async getItem() {
        throw new Error('read failed');
      },
      async setItem() {
        throw new Error('write failed');
      },
    };
    const provider = createAnonymousUserIdProvider({
      storage: throwingStorage,
      generateUuid: () => FIXED_UUID,
    });

    let id = '';
    await expect(
      (async () => {
        id = await provider.ensureAnonymousUserId();
      })(),
    ).resolves.toBeUndefined();
    expect(id).toBe(FIXED_UUID);
    // The fallback is stable across reads.
    expect(provider.getAnonymousUserId()).toBe(FIXED_UUID);
  });

  it('getAnonymousUserId is non-empty even before ensure resolves', () => {
    const provider = createAnonymousUserIdProvider({
      storage: makeStorage(),
      generateUuid: () => FIXED_UUID,
    });
    // Eager in-memory seed → never an empty id.
    expect(provider.getAnonymousUserId()).toBe(FIXED_UUID);
  });
});
