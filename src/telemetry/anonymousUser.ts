/**
 * Anonymous user identity (Technical Design §10).
 *
 * A stable, best-effort anonymous id used to attribute telemetry and to seed
 * deterministic session composition. It is generated ONCE and persisted in
 * `localStorage` under a namespaced key; repeated calls in the same browser
 * return the SAME id.
 *
 * BEST-EFFORT by design (Technical Design §10): the identity is *not* durable.
 * It breaks across private/incognito browsing, browser changes, cache clearing,
 * and devices — that is acceptable and intended. All storage access is wrapped
 * so a disabled/quota-exceeded/private-mode `localStorage` never throws; in that
 * case we fall back to an in-memory id that is stable for the page lifetime.
 *
 * NO PII: the id is a random RFC-4122 v4 UUID. It carries no names, email,
 * contacts, or device identifiers.
 */

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const ANONYMOUS_USER_ID_STORAGE_KEY = 'lumaloop.anonymousUserId';

/** RFC-4122 v4 shape — version nibble `4`, variant nibble `8|9|a|b`. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal storage surface this module needs (a subset of the DOM `Storage`). */
export type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** A UUID generator — defaults to {@link generateUuidV4}. */
export type UuidGenerator = () => string;

/** Injectable dependencies (for testability — no hidden globals in tests). */
export interface AnonymousUserIdDeps {
  /**
   * Storage backend. `undefined` (the default) resolves to
   * `globalThis.localStorage`; pass `null` to force the in-memory fallback; pass
   * a fake `Storage`-like object in tests.
   */
  storage?: ReadWriteStorage | null;
  /** UUID generator — inject a deterministic one in tests. */
  generateUuid?: UuidGenerator;
}

/** A provider exposing the generate-once anonymous id, with its own memo. */
export interface AnonymousUserIdProvider {
  /** Returns the stable anonymous id; repeated calls return the SAME id. */
  getAnonymousUserId(): string;
}

/** Resolve the default storage, treating any access failure as unavailable. */
function defaultStorage(): ReadWriteStorage | null {
  try {
    // Accessing `localStorage` itself can throw in sandboxed contexts.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Fill `length` random bytes, preferring the Web Crypto API. */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  // Last-resort, best-effort fallback for environments without Web Crypto.
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generate an RFC-4122 v4 UUID. Prefers `crypto.randomUUID()` when available,
 * otherwise builds one from `crypto.getRandomValues` (per Technical Design §10).
 */
export function generateUuidV4(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-` +
    `${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-` +
    `${hex.slice(10, 16).join('')}`
  );
}

/** Read a previously-persisted, well-formed id — never throws. */
function readPersistedId(storage: ReadWriteStorage | null): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY);
    return raw !== null && UUID_V4.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the id best-effort — a storage failure is swallowed, never thrown. */
function persistId(storage: ReadWriteStorage | null, id: string): void {
  if (!storage) return;
  try {
    storage.setItem(ANONYMOUS_USER_ID_STORAGE_KEY, id);
  } catch {
    // Best-effort: private mode / quota / disabled storage. The in-memory memo
    // in the provider keeps the id stable for the page lifetime regardless.
  }
}

/**
 * Build a provider with its own generate-once memo. Each provider reads/creates
 * the id lazily on first call and caches it, so repeated calls return the SAME
 * id even when storage is unavailable. Tests create isolated providers with fake
 * dependencies; production uses the shared default provider below.
 */
export function createAnonymousUserIdProvider(
  deps: AnonymousUserIdDeps = {},
): AnonymousUserIdProvider {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const generateUuid = deps.generateUuid ?? generateUuidV4;
  let cached: string | null = null;

  return {
    getAnonymousUserId(): string {
      if (cached !== null) return cached;
      const existing = readPersistedId(storage);
      if (existing !== null) {
        cached = existing;
        return cached;
      }
      const created = generateUuid();
      persistId(storage, created);
      cached = created;
      return cached;
    },
  };
}

/** Shared, process-wide provider backed by the real `localStorage`. */
const defaultProvider = createAnonymousUserIdProvider();

/**
 * Return the stable, best-effort anonymous user id (Technical Design §10).
 * Generated once and persisted; repeated calls return the SAME id. Never throws.
 */
export function getAnonymousUserId(): string {
  return defaultProvider.getAnonymousUserId();
}
