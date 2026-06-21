/**
 * Anonymous user identity for React Native (Technical Design §10; ADO #129, M5).
 *
 * The RN counterpart of the web `src/telemetry/anonymousUser.ts`. Same contract —
 * a stable, best-effort anonymous id that attributes telemetry and seeds
 * deterministic deck composition, generated ONCE and persisted, with repeated
 * reads returning the SAME id — but rebuilt for RN because the web module was
 * `localStorage`- and `crypto.randomUUID`-based:
 *   - Persistence is `@react-native-async-storage/async-storage` (async) instead
 *     of `localStorage`, so resolving the id is asynchronous: callers
 *     {@link AnonymousUserIdProvider.ensureAnonymousUserId | ensure} it once on
 *     app start and then read the resolved value synchronously.
 *   - The id is a UUID v4 from `uuid` (backed by `react-native-get-random-values`,
 *     polyfilled in the app entry) — Hermes has no reliable `crypto.randomUUID`.
 *
 * BEST-EFFORT by design (Technical Design §10): the identity is not durable. It
 * breaks across reinstalls and devices — acceptable and intended. Every storage
 * access is wrapped so a failed native store never throws; in that case a
 * generate-once in-memory id keeps the value stable for the process lifetime.
 *
 * NO PII (Technical Design §16): the id is a random UUID — no names, email,
 * contacts, or device identifiers.
 */

import { v4 as uuidV4 } from 'uuid';

import type { AsyncReadWriteStorage } from './storage';
import { defaultAsyncStorage } from './storage';

/** Namespaced, stable storage key. Exported so tests can pre-seed a fake store. */
export const ANONYMOUS_USER_ID_STORAGE_KEY = 'lumaloop.anonymousUserId';

/** RFC-4122 v4 shape — version nibble `4`, variant nibble `8|9|a|b`. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A UUID generator — defaults to {@link uuidV4}. */
export type UuidGenerator = () => string;

/** Injectable dependencies (for testability — no native module in tests). */
export interface AnonymousUserIdDeps {
  /**
   * Async storage backend. `undefined` (the default) resolves to
   * {@link defaultAsyncStorage}; pass `null` to force the in-memory fallback;
   * pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
  /** UUID generator — inject a deterministic one in tests. */
  generateUuid?: UuidGenerator;
}

/** A provider exposing the generate-once anonymous id, with its own memo. */
export interface AnonymousUserIdProvider {
  /**
   * Resolve the stable anonymous id once: read the persisted id, else generate
   * one and persist it (best-effort). Repeated calls return the SAME id and only
   * touch storage on the first call. Never rejects.
   */
  ensureAnonymousUserId(): Promise<string>;
  /**
   * The resolved id synchronously. Before {@link ensureAnonymousUserId} resolves
   * it returns a stable in-memory fallback (so an event never carries an empty
   * id); after resolution it returns the resolved (possibly persisted) id. Never
   * throws.
   */
  getAnonymousUserId(): string;
}

/** Read a previously-persisted, well-formed id — never throws. */
async function readPersistedId(
  storage: AsyncReadWriteStorage | null,
): Promise<string | null> {
  if (!storage) return null;
  try {
    const raw = await storage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY);
    return raw !== null && UUID_V4.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the id best-effort — a storage failure is swallowed, never thrown. */
async function persistId(
  storage: AsyncReadWriteStorage | null,
  id: string,
): Promise<void> {
  if (!storage) return;
  try {
    await storage.setItem(ANONYMOUS_USER_ID_STORAGE_KEY, id);
  } catch {
    // Best-effort: the in-memory memo keeps the id stable regardless.
  }
}

/**
 * Build a provider with its own generate-once memo. The first
 * {@link AnonymousUserIdProvider.ensureAnonymousUserId} reads/creates the id and
 * caches it; later calls (and {@link AnonymousUserIdProvider.getAnonymousUserId})
 * return the cached value, so the id is stable even when storage is unavailable.
 *
 * The cache is seeded eagerly with an in-memory id at construction so a read
 * BEFORE `ensure` resolves never yields an empty string. If storage then holds a
 * different persisted id, `ensure` ADOPTS it — so a second app launch returns the
 * same persisted id; only the never-persisted first-launch fallback is replaced,
 * and only before any event could have used it (the wiring awaits `ensure` first).
 */
export function createAnonymousUserIdProvider(
  deps: AnonymousUserIdDeps = {},
): AnonymousUserIdProvider {
  const storage = deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  const generateUuid = deps.generateUuid ?? uuidV4;

  // Eager in-memory fallback: stable for the process even if storage never works.
  let cached: string = generateUuid();
  let resolved = false;
  let inFlight: Promise<string> | null = null;

  async function resolve(): Promise<string> {
    const existing = await readPersistedId(storage);
    if (existing !== null) {
      cached = existing;
    } else {
      // No persisted id yet: persist the in-memory fallback so it becomes the
      // durable id on the next launch.
      await persistId(storage, cached);
    }
    resolved = true;
    return cached;
  }

  return {
    ensureAnonymousUserId(): Promise<string> {
      if (resolved) return Promise.resolve(cached);
      if (inFlight === null) {
        inFlight = resolve().catch(() => {
          // Storage blew up despite the wrapping — keep the in-memory fallback.
          resolved = true;
          return cached;
        });
      }
      return inFlight;
    },
    getAnonymousUserId(): string {
      return cached;
    },
  };
}

/** Shared, process-wide provider backed by the real AsyncStorage. */
const defaultProvider = createAnonymousUserIdProvider();

/**
 * Resolve the stable, best-effort anonymous user id (Technical Design §10).
 * Generated once and persisted; repeated calls return the SAME id. Never rejects.
 */
export function ensureAnonymousUserId(): Promise<string> {
  return defaultProvider.ensureAnonymousUserId();
}

/** The resolved anonymous id synchronously (in-memory fallback pre-resolution). */
export function getAnonymousUserId(): string {
  return defaultProvider.getAnonymousUserId();
}
