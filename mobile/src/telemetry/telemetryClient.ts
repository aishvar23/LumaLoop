/**
 * Telemetry client for React Native (Technical Design §10; ADO #129, M5).
 *
 * The RN counterpart of the web `src/telemetry/telemetryClient.ts`: an in-memory
 * queue, immediate flush, and a SMALL CAPPED retry queue for failed deliveries.
 * Same reliability posture, rebuilt for RN where the web client used
 * browser-only globals:
 *   - the retry queue persists to ASYNC storage ({@link AsyncReadWriteStorage} →
 *     AsyncStorage) instead of synchronous `localStorage`, so reads/writes are
 *     awaited;
 *   - delivery is `fetch` POST (RN has `fetch`) to the ABSOLUTE Vercel endpoint;
 *   - there is NO `sendBeacon`/`visibilitychange` — abandonment is delivered
 *     through the same `fetch` transport ({@link TelemetryClient.trackAbandonment}),
 *     fired by an AppState listener in the React layer (see `useFeedTelemetry`).
 *
 * Dependency inversion (CLAUDE.md §4): transport, storage, uuid, clock, and
 * endpoint are all injected, so tests run against fakes with no native modules and
 * the same code paths exercise in tests as in production.
 *
 * Reliability (Technical Design §10):
 *   - events queue in memory and flush immediately (POST to the endpoint);
 *   - on failure they spill to the capped retry queue (oldest dropped beyond the
 *     cap) so storage cannot grow unbounded;
 *   - the next flush re-sends persisted events and de-dups by the client-generated
 *     `eventId`, removing them on success.
 *
 * Privacy (Technical Design §16): the client never adds PII and embeds no secret.
 * It only POSTs the {@link QueuedTelemetryEvent}; IP/UA stripping and key handling
 * are the ingestion server's job.
 *
 * Robustness: every storage and network access is wrapped so a failure (offline,
 * disabled store, native error) degrades gracefully and never throws into the app.
 */

import type { AsyncReadWriteStorage } from './storage';
import { defaultAsyncStorage } from './storage';
import { resolveTelemetryEndpoint } from './endpoint';
import type {
  QueuedTelemetryEvent,
  TelemetryEventInput,
} from '../core/telemetry/telemetryEvents';
import { v4 as uuidV4 } from 'uuid';

/** Namespaced key under which the capped retry queue is persisted. */
export const TELEMETRY_RETRY_QUEUE_STORAGE_KEY = 'lumaloop.telemetryRetryQueue';

/**
 * Maximum number of failed events retained in the retry queue. Beyond this the
 * OLDEST entries are dropped, bounding local growth (§10).
 */
export const DEFAULT_MAX_RETRY_QUEUE_SIZE = 50;

/** A UUID generator — defaults to `uuid`'s v4. */
export type UuidGenerator = () => string;

/**
 * Transport for delivery: POST `body` to `url`, resolving `true` on success and
 * `false` on any failure. Must never reject — the default wraps `fetch` and
 * converts errors to `false`.
 */
export type TelemetryTransport = (url: string, body: string) => Promise<boolean>;

/** Injectable dependencies — all optional, each with a production default. */
export interface TelemetryClientDeps {
  /** Absolute ingestion endpoint. Defaults to {@link resolveTelemetryEndpoint}. */
  endpoint?: string;
  /** Awaitable transport. Defaults to a `fetch`-based POST. */
  transport?: TelemetryTransport;
  /**
   * Retry-queue storage. `undefined` resolves to {@link defaultAsyncStorage};
   * pass `null` to disable persistence; pass an in-memory fake in tests.
   */
  storage?: AsyncReadWriteStorage | null;
  /** UUID generator for `eventId`. Defaults to `uuid`'s v4. */
  generateUuid?: UuidGenerator;
  /** Clock for `timestampMs`. Defaults to `Date.now`. */
  now?: () => number;
  /** Retry-queue cap. Defaults to {@link DEFAULT_MAX_RETRY_QUEUE_SIZE}. */
  maxRetryQueueSize?: number;
}

/** The telemetry client surface consumed by feed instrumentation (M5). */
export interface TelemetryClient {
  /**
   * Stamp the event (`eventId` + `timestampMs`), buffer it in memory, and kick
   * off an immediate flush. Non-throwing and fire-and-forget; await
   * {@link flush} when delivery ordering matters (e.g. tests).
   */
  enqueue(event: TelemetryEventInput): void;
  /**
   * Drain the in-memory queue and the persisted retry queue to the endpoint,
   * de-duplicating by `eventId`. Successful events are removed; failures are
   * re-persisted (capped). Never rejects.
   */
  flush(): Promise<void>;
  /**
   * Best-effort abandonment delivery (Technical Design §10): stamp the event and
   * send it through the `fetch` transport, spilling to the retry queue if it
   * fails. RN has no `sendBeacon`, so this is the same transport as a normal
   * flush. Non-throwing; abandonment is an accepted undercount.
   */
  trackAbandonment(event: TelemetryEventInput): void;
}

/** A `fetch`-based transport that converts any failure to `false`. */
function defaultTransport(): TelemetryTransport {
  return async (url, body) => {
    try {
      const fetchFn = globalThis.fetch;
      if (typeof fetchFn !== 'function') return false;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}

/** Narrow unknown parsed JSON to a transmittable queued event (no PII fields). */
function isQueuedEvent(value: unknown): value is QueuedTelemetryEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.eventId === 'string' &&
    typeof e.eventName === 'string' &&
    typeof e.anonymousUserId === 'string' &&
    typeof e.sessionId === 'string' &&
    typeof e.timestampMs === 'number'
  );
}

/**
 * Create a telemetry client. Each call yields an isolated instance with its own
 * in-memory queue and flush chain, so tests stay independent.
 */
export function createTelemetryClient(
  deps: TelemetryClientDeps = {},
): TelemetryClient {
  const endpoint = deps.endpoint ?? resolveTelemetryEndpoint();
  const transport = deps.transport ?? defaultTransport();
  const storage = deps.storage === undefined ? defaultAsyncStorage() : deps.storage;
  const generateUuid = deps.generateUuid ?? uuidV4;
  const now = deps.now ?? Date.now;
  const maxRetryQueueSize =
    deps.maxRetryQueueSize ?? DEFAULT_MAX_RETRY_QUEUE_SIZE;

  const memoryQueue: QueuedTelemetryEvent[] = [];
  // Flushes are chained so concurrent/auto flushes serialize and a single
  // awaited flush observes the completion of all work queued before it.
  let flushChain: Promise<void> = Promise.resolve();

  /** Read + validate the persisted retry queue. Never throws → `[]` on failure. */
  async function readRetryQueue(): Promise<QueuedTelemetryEvent[]> {
    if (!storage) return [];
    try {
      const raw = await storage.getItem(TELEMETRY_RETRY_QUEUE_STORAGE_KEY);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isQueuedEvent);
    } catch {
      return [];
    }
  }

  /**
   * Persist the retry queue, capped to the newest {@link maxRetryQueueSize}
   * events (oldest dropped). Never throws.
   */
  async function writeRetryQueue(events: QueuedTelemetryEvent[]): Promise<void> {
    if (!storage) return;
    const capped =
      events.length > maxRetryQueueSize
        ? events.slice(events.length - maxRetryQueueSize)
        : events;
    try {
      await storage.setItem(
        TELEMETRY_RETRY_QUEUE_STORAGE_KEY,
        JSON.stringify(capped),
      );
    } catch {
      // Best-effort: disabled store / quota / native error.
    }
  }

  /** Append a single failed event to the capped retry queue. Never throws. */
  async function persistFailure(event: QueuedTelemetryEvent): Promise<void> {
    const existing = await readRetryQueue();
    const byId = new Map(existing.map((e) => [e.eventId, e]));
    byId.set(event.eventId, event);
    await writeRetryQueue([...byId.values()]);
  }

  /** Stamp a caller's input with `eventId` and (if absent) `timestampMs`. */
  function stamp(input: TelemetryEventInput): QueuedTelemetryEvent {
    return {
      ...input,
      timestampMs: input.timestampMs ?? now(),
      eventId: generateUuid(),
    };
  }

  /** One drain pass: send memory + persisted events, de-dup, re-persist fails. */
  async function drain(): Promise<void> {
    const memoryBatch = memoryQueue.splice(0, memoryQueue.length);
    const persisted = await readRetryQueue();
    if (memoryBatch.length === 0 && persisted.length === 0) return;

    // De-dup by eventId; persisted (older) first so memory wins on collision.
    const byId = new Map<string, QueuedTelemetryEvent>();
    for (const event of persisted) byId.set(event.eventId, event);
    for (const event of memoryBatch) byId.set(event.eventId, event);

    const failed: QueuedTelemetryEvent[] = [];
    for (const event of byId.values()) {
      let delivered = false;
      try {
        delivered = await transport(endpoint, JSON.stringify(event));
      } catch {
        delivered = false;
      }
      if (!delivered) failed.push(event);
    }

    // Re-read current storage and MERGE rather than blindly overwriting the key:
    // a `persistFailure` (abandonment fallback) may have written a new event
    // during the awaits above, and a blind overwrite would clobber it (a
    // lost-write race). Start from what is currently persisted, drop the events
    // delivered this pass, then keep the failures. The cap is re-applied.
    const remaining = new Map<string, QueuedTelemetryEvent>(
      (await readRetryQueue()).map((e) => [e.eventId, e]),
    );
    const failedIds = new Set(failed.map((e) => e.eventId));
    for (const event of byId.values()) {
      if (!failedIds.has(event.eventId)) remaining.delete(event.eventId);
    }
    for (const event of failed) remaining.set(event.eventId, event);
    await writeRetryQueue([...remaining.values()]);
  }

  function flush(): Promise<void> {
    // Append to the chain so an awaited flush also awaits work queued before it;
    // `.catch` keeps the chain alive and the public promise non-rejecting.
    flushChain = flushChain.then(drain).catch(() => {});
    return flushChain;
  }

  function enqueue(input: TelemetryEventInput): void {
    try {
      memoryQueue.push(stamp(input));
    } catch {
      // Stamping is pure, but guard defensively so enqueue never throws.
      return;
    }
    void flush();
  }

  function trackAbandonment(input: TelemetryEventInput): void {
    try {
      const event = stamp(input);
      const body = JSON.stringify(event);
      // No beacon in RN: best-effort transport, spilling to the retry queue if it
      // fails, all fire-and-forget.
      void transport(endpoint, body)
        .then((delivered) => {
          if (!delivered) return persistFailure(event);
        })
        .catch(() => persistFailure(event));
    } catch {
      // Best-effort: abandonment is an accepted undercount (§10).
    }
  }

  return { enqueue, flush, trackAbandonment };
}
