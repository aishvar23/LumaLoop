/**
 * Telemetry client (Technical Design §10) — in-memory queue, immediate flush,
 * a capped `localStorage` retry queue, and best-effort abandonment delivery via
 * `navigator.sendBeacon`.
 *
 * Design goals (CLAUDE.md §4, §6): the client is template-agnostic and fully
 * dependency-injected — transport, beacon, storage, uuid, and clock are all
 * injectable so tests run against fakes with no hidden globals, and the same
 * code paths exercise in tests as in production.
 *
 * Reliability posture (Technical Design §10):
 *   - events queue in memory and flush immediately (POST to the endpoint);
 *   - on network failure they spill to a SMALL, CAPPED `localStorage` retry
 *     queue (oldest dropped beyond the cap) so local storage cannot grow
 *     unbounded;
 *   - the next flush re-sends persisted events and de-dups by the
 *     client-generated `eventId`, removing them on success;
 *   - `Session_Abandoned` is delivered through `visibilitychange`/`pagehide`
 *     using `sendBeacon` where available (fetch keepalive fallback), and is
 *     treated as best-effort/undercount.
 *
 * Privacy (Technical Design §16): the client never adds PII and embeds no
 * secret. It only POSTs the {@link QueuedTelemetryEvent} payload; IP/UA
 * stripping and key handling are the ingestion server's job.
 *
 * Robustness: every storage and network access is wrapped so a failure (private
 * mode, quota, offline, blocked beacon) degrades gracefully and never throws
 * into the app/session.
 */

import {
  generateUuidV4,
  type ReadWriteStorage,
  type UuidGenerator,
} from './anonymousUser';
import type {
  QueuedTelemetryEvent,
  TelemetryEventInput,
} from './telemetryEvents';

/** Default ingestion endpoint; override via {@link TelemetryClientDeps.endpoint}. */
export const DEFAULT_TELEMETRY_ENDPOINT = '/api/event';

/** Namespaced key under which the capped retry queue is persisted. */
export const TELEMETRY_RETRY_QUEUE_STORAGE_KEY = 'lumaloop.telemetryRetryQueue';

/**
 * Maximum number of failed events retained in the `localStorage` retry queue.
 * Beyond this the OLDEST entries are dropped, bounding local growth (§10).
 */
export const DEFAULT_MAX_RETRY_QUEUE_SIZE = 50;

/**
 * Transport for normal (awaitable) delivery: POST `body` to `url`, resolving
 * `true` on success and `false` on any failure. Must never reject — the default
 * wraps `fetch` and converts errors to `false`.
 */
export type TelemetryTransport = (url: string, body: string) => Promise<boolean>;

/**
 * Synchronous best-effort sender for abandonment (default
 * `navigator.sendBeacon`). Returns whether the user agent accepted the payload
 * for delivery. `null` means no beacon is available (fall back to transport).
 */
export type BeaconSender = (url: string, body: string) => boolean;

/** Injectable dependencies — all optional, each with a production default. */
export interface TelemetryClientDeps {
  /** Ingestion endpoint. Defaults to {@link DEFAULT_TELEMETRY_ENDPOINT}. */
  endpoint?: string;
  /** Awaitable transport. Defaults to a `fetch`-based keepalive POST. */
  transport?: TelemetryTransport;
  /**
   * Beacon sender for abandonment. `undefined` resolves to
   * `navigator.sendBeacon` when present; pass `null` to force the transport
   * fallback; pass a fake in tests.
   */
  beacon?: BeaconSender | null;
  /**
   * Retry-queue storage. `undefined` resolves to `globalThis.localStorage`;
   * pass `null` to disable persistence; pass a fake `Storage`-like object in
   * tests. Reuses the {@link ReadWriteStorage} surface from `anonymousUser`.
   */
  storage?: ReadWriteStorage | null;
  /** UUID generator for `eventId`. Defaults to {@link generateUuidV4}. */
  generateUuid?: UuidGenerator;
  /** Clock for `timestampMs`. Defaults to `Date.now`. */
  now?: () => number;
  /** Retry-queue cap. Defaults to {@link DEFAULT_MAX_RETRY_QUEUE_SIZE}. */
  maxRetryQueueSize?: number;
}

/** The telemetry client surface consumed by app/session instrumentation (#76). */
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
   * send it synchronously via `sendBeacon`, falling back to a keepalive
   * transport (then the retry queue) when no beacon is available. Non-throwing.
   */
  trackAbandonment(event: TelemetryEventInput): void;
}

/** Resolve the default storage, treating any access failure as unavailable. */
function defaultStorage(): ReadWriteStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Resolve `navigator.sendBeacon` if present, else `null`. Never throws. */
function defaultBeacon(): BeaconSender | null {
  try {
    const nav = globalThis.navigator;
    if (nav && typeof nav.sendBeacon === 'function') {
      // Wrap the body in a typed Blob so the browser sends
      // `Content-Type: application/json` (matching the fetch transport) instead
      // of the `text/plain` it would force for a raw string — a
      // content-type-sensitive `/api/event` handler must parse both identically.
      return (url, body) =>
        nav.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    }
  } catch {
    // fall through to null
  }
  return null;
}

/** A `fetch`-based keepalive transport that converts any failure to `false`. */
function defaultTransport(): TelemetryTransport {
  return async (url, body) => {
    try {
      const fetchFn = globalThis.fetch;
      if (typeof fetchFn !== 'function') return false;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // keepalive lets in-flight POSTs survive a unloading page, which also
        // makes this a safe fallback for the abandonment path.
        keepalive: true,
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
  const endpoint = deps.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT;
  const transport = deps.transport ?? defaultTransport();
  const beacon = deps.beacon === undefined ? defaultBeacon() : deps.beacon;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const generateUuid = deps.generateUuid ?? generateUuidV4;
  const now = deps.now ?? Date.now;
  const maxRetryQueueSize =
    deps.maxRetryQueueSize ?? DEFAULT_MAX_RETRY_QUEUE_SIZE;

  const memoryQueue: QueuedTelemetryEvent[] = [];
  // Flushes are chained so concurrent/auto flushes serialize and a single
  // awaited flush observes the completion of all work queued before it.
  let flushChain: Promise<void> = Promise.resolve();

  /** Read + validate the persisted retry queue. Never throws → `[]` on failure. */
  function readRetryQueue(): QueuedTelemetryEvent[] {
    if (!storage) return [];
    try {
      const raw = storage.getItem(TELEMETRY_RETRY_QUEUE_STORAGE_KEY);
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
  function writeRetryQueue(events: QueuedTelemetryEvent[]): void {
    if (!storage) return;
    const capped =
      events.length > maxRetryQueueSize
        ? events.slice(events.length - maxRetryQueueSize)
        : events;
    try {
      storage.setItem(
        TELEMETRY_RETRY_QUEUE_STORAGE_KEY,
        JSON.stringify(capped),
      );
    } catch {
      // Best-effort: private mode / quota / disabled storage.
    }
  }

  /** Append a single failed event to the capped retry queue. Never throws. */
  function persistFailure(event: QueuedTelemetryEvent): void {
    const existing = readRetryQueue();
    const byId = new Map(existing.map((e) => [e.eventId, e]));
    byId.set(event.eventId, event);
    writeRetryQueue([...byId.values()]);
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
    const persisted = readRetryQueue();
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
    // during the awaits above, and a blind `writeRetryQueue(failed)` would
    // clobber that best-effort write (a lost-write race). Start from what is
    // currently persisted, drop the events we delivered this pass, then keep the
    // ones that failed. Successful events drop out; the cap is re-applied.
    const remaining = new Map<string, QueuedTelemetryEvent>(
      readRetryQueue().map((e) => [e.eventId, e]),
    );
    const failedIds = new Set(failed.map((e) => e.eventId));
    for (const event of byId.values()) {
      if (!failedIds.has(event.eventId)) remaining.delete(event.eventId);
    }
    for (const event of failed) remaining.set(event.eventId, event);
    writeRetryQueue([...remaining.values()]);
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

      if (beacon) {
        let accepted = false;
        try {
          accepted = beacon(endpoint, body);
        } catch {
          accepted = false;
        }
        if (accepted) return;
      }

      // No beacon (or it refused): best-effort keepalive transport, spilling to
      // the retry queue if it fails, all fire-and-forget.
      void transport(endpoint, body)
        .then((delivered) => {
          if (!delivered) persistFailure(event);
        })
        .catch(() => persistFailure(event));
    } catch {
      // Best-effort: abandonment is an accepted undercount (§10).
    }
  }

  return { enqueue, flush, trackAbandonment };
}

/** Options for {@link registerAbandonmentListeners}. */
export interface AbandonmentListenerOptions {
  /** The client whose {@link TelemetryClient.trackAbandonment} fires on unload. */
  client: TelemetryClient;
  /**
   * Builds the abandonment event at fire time (so the caller can attach current
   * session context). Return `null` to suppress (e.g. no active session).
   */
  buildEvent: () => TelemetryEventInput | null;
  /**
   * `document` to bind `visibilitychange` to. `undefined` resolves to the global
   * `document`; pass `null` to skip; pass a fake in tests.
   */
  doc?: Document | null;
  /**
   * `window` to bind `pagehide` to. `undefined` resolves to the global `window`;
   * pass `null` to skip; pass a fake in tests.
   */
  win?: Window | null;
}

/** Resolve the global `document` if present. Never throws. */
function safeDocument(): Document | null {
  try {
    return typeof document === 'undefined' ? null : document;
  } catch {
    return null;
  }
}

/** Resolve the global `window` if present. Never throws. */
function safeWindow(): Window | null {
  try {
    return typeof window === 'undefined' ? null : window;
  } catch {
    return null;
  }
}

/**
 * Register `visibilitychange`/`pagehide` listeners that fire abandonment
 * (Technical Design §10). Separately exported and NOT auto-attached on import,
 * so the session route (#76) wires it explicitly. SSR/test-safe: with no
 * `document`/`window` it is a no-op. Returns a cleanup function that detaches
 * every listener it added.
 */
export function registerAbandonmentListeners(
  options: AbandonmentListenerOptions,
): () => void {
  const doc = options.doc === undefined ? safeDocument() : options.doc;
  const win = options.win === undefined ? safeWindow() : options.win;
  if (!doc && !win) return () => {};

  const fire = (): void => {
    try {
      const event = options.buildEvent();
      if (event) options.client.trackAbandonment(event);
    } catch {
      // Best-effort: never let an unload handler throw.
    }
  };

  // visibilitychange fires on many transitions; only a hide is an abandonment.
  const onVisibility = (): void => {
    if (doc && doc.visibilityState === 'hidden') fire();
  };
  const onPageHide = (): void => fire();

  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);

  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pagehide', onPageHide);
  };
}
