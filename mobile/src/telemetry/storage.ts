/**
 * Async key/value storage seam for the RN telemetry layer (ADO #129, M5).
 *
 * The web telemetry client persisted to the SYNCHRONOUS `localStorage`; React
 * Native has no `localStorage`, so both the capped retry queue
 * ({@link ../telemetry/telemetryClient}) and the persisted anonymous id
 * ({@link ./anonymousUser}) persist through `@react-native-async-storage/async-storage`,
 * whose API is PROMISE-based. This module defines the minimal async surface those
 * consumers depend on and adapts the real AsyncStorage to it.
 *
 * Dependency inversion (CLAUDE.md §4): consumers take an {@link AsyncReadWriteStorage}
 * so unit tests inject an in-memory fake (no native module, no Jest mock of
 * AsyncStorage) and the production wiring injects {@link defaultAsyncStorage}. The
 * adapter NEVER throws — a disabled/failed native store degrades to a no-op so
 * telemetry can never crash the app (Technical Design §10 robustness posture).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Minimal async storage surface the telemetry layer needs — the AsyncStorage
 * subset (`getItem`/`setItem`). `getItem` resolves `null` when absent;
 * implementations must resolve (never reject) so callers need not try/catch.
 */
export interface AsyncReadWriteStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Adapt the real `AsyncStorage` to {@link AsyncReadWriteStorage}, swallowing any
 * failure so a read resolves `null` and a write resolves silently. Returned by a
 * factory (not a module singleton) so the import has no side effects under test.
 */
export function defaultAsyncStorage(): AsyncReadWriteStorage {
  return {
    async getItem(key) {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        // Best-effort: a failed native write must never throw into the app.
      }
    },
  };
}
