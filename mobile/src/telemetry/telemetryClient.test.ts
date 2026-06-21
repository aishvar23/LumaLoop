/**
 * Tests for the RN telemetry client (ADO #129, M5). Everything is faked — a fake
 * `fetch`-shaped transport, an in-memory async storage, and deterministic uuid +
 * clock — so the same code paths run as in production with no native modules and
 * no real network (mirroring the web #75 fake-transport posture).
 */
import {
  createTelemetryClient,
  DEFAULT_MAX_RETRY_QUEUE_SIZE,
  TELEMETRY_RETRY_QUEUE_STORAGE_KEY,
  type TelemetryTransport,
} from './telemetryClient';
import type { AsyncReadWriteStorage } from './storage';
import type {
  QueuedTelemetryEvent,
  TelemetryEventInput,
} from '../core/telemetry/telemetryEvents';

/** A controllable in-memory async storage. */
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

/** A transport whose success is toggled; records every body it received. */
function makeTransport(ok = true): TelemetryTransport & {
  calls: string[];
  ok: boolean;
} {
  const transport = (async (_url: string, body: string) => {
    transport.calls.push(body);
    return transport.ok;
  }) as TelemetryTransport & { calls: string[]; ok: boolean };
  transport.calls = [];
  transport.ok = ok;
  return transport;
}

/** A deterministic, monotonically increasing uuid generator. */
function makeUuid() {
  let n = 0;
  return () => `uuid-${++n}`;
}

const ENDPOINT = 'https://example.test/api/event';

const baseInput: TelemetryEventInput = {
  eventName: 'Card_Rendered',
  anonymousUserId: 'anon-1',
  sessionId: 'feed-1',
};

function parseQueue(raw: string | null): QueuedTelemetryEvent[] {
  return raw === null ? [] : (JSON.parse(raw) as QueuedTelemetryEvent[]);
}

describe('createTelemetryClient (RN)', () => {
  it('enqueue + flush POSTs the stamped event with the correct payload shape', async () => {
    const transport = makeTransport(true);
    const storage = makeStorage();
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    client.enqueue(baseInput);
    await client.flush();

    expect(transport.calls).toHaveLength(1);
    const sent = JSON.parse(transport.calls[0]) as QueuedTelemetryEvent;
    expect(sent).toEqual({
      eventName: 'Card_Rendered',
      anonymousUserId: 'anon-1',
      sessionId: 'feed-1',
      eventId: 'uuid-1',
      timestampMs: 1000,
    });
    // Delivered → nothing left in the retry queue.
    expect(parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null)).toHaveLength(0);
  });

  it('keeps a caller-supplied timestampMs and only stamps eventId', async () => {
    const transport = makeTransport(true);
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage: makeStorage(),
      generateUuid: makeUuid(),
      now: () => 9999,
    });

    client.enqueue({ ...baseInput, timestampMs: 42 });
    await client.flush();

    const sent = JSON.parse(transport.calls[0]) as QueuedTelemetryEvent;
    expect(sent.timestampMs).toBe(42);
    expect(sent.eventId).toBe('uuid-1');
  });

  it('persists to the capped retry queue on transport failure (non-throwing)', async () => {
    const transport = makeTransport(false);
    const storage = makeStorage();
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    expect(() => client.enqueue(baseInput)).not.toThrow();
    await client.flush();

    const queued = parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null);
    expect(queued).toHaveLength(1);
    expect(queued[0].eventId).toBe('uuid-1');
  });

  it('drains + de-dups the persisted queue on the next successful flush', async () => {
    const transport = makeTransport(false);
    const storage = makeStorage();
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    // First flush fails → event persisted.
    client.enqueue(baseInput);
    await client.flush();
    expect(parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null)).toHaveLength(1);

    // Recover the network and flush again with no new memory events: the persisted
    // one is re-sent and removed.
    transport.ok = true;
    transport.calls.length = 0;
    await client.flush();

    expect(transport.calls).toHaveLength(1);
    expect((JSON.parse(transport.calls[0]) as QueuedTelemetryEvent).eventId).toBe('uuid-1');
    expect(parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null)).toHaveLength(0);
  });

  it('does not double-send an event present in BOTH memory and the retry queue', async () => {
    const transport = makeTransport(true);
    // Pre-seed the retry queue with an event id that the memory event will collide on.
    const storage = makeStorage({
      [TELEMETRY_RETRY_QUEUE_STORAGE_KEY]: JSON.stringify([
        {
          eventId: 'uuid-1',
          eventName: 'Card_Rendered',
          anonymousUserId: 'anon-1',
          sessionId: 'feed-1',
          timestampMs: 500,
        },
      ]),
    });
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage,
      generateUuid: () => 'uuid-1', // same id as the persisted event
      now: () => 1000,
    });

    client.enqueue(baseInput);
    await client.flush();

    // De-duped by eventId → sent exactly once.
    expect(transport.calls).toHaveLength(1);
  });

  it('enforces the retry-queue cap, dropping the oldest events', async () => {
    const transport = makeTransport(false);
    const storage = makeStorage();
    const cap = 3;
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
      maxRetryQueueSize: cap,
    });

    for (let i = 0; i < cap + 2; i += 1) {
      client.enqueue(baseInput);
      await client.flush();
    }

    const queued = parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null);
    expect(queued).toHaveLength(cap);
    // Oldest (uuid-1, uuid-2) dropped; the newest `cap` remain.
    expect(queued.map((e) => e.eventId)).toEqual(['uuid-3', 'uuid-4', 'uuid-5']);
  });

  it('default cap constant is a sane bound', () => {
    expect(DEFAULT_MAX_RETRY_QUEUE_SIZE).toBeGreaterThan(0);
  });

  it('trackAbandonment sends via the transport and persists on failure', async () => {
    const failing = makeTransport(false);
    const storage = makeStorage();
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport: failing,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    client.trackAbandonment({
      ...baseInput,
      eventName: 'Session_Abandoned',
    });
    // trackAbandonment is fire-and-forget; let its promise chain settle.
    await new Promise<void>((resolve) => setImmediate(() => resolve()));

    expect(failing.calls).toHaveLength(1);
    const queued = parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null);
    expect(queued).toHaveLength(1);
    expect(queued[0].eventName).toBe('Session_Abandoned');
  });

  it('never throws when storage is disabled (null)', async () => {
    const transport = makeTransport(false);
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport,
      storage: null,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    expect(() => client.enqueue(baseInput)).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
    // Failed + no storage → simply dropped, no crash.
    expect(transport.calls).toHaveLength(1);
  });

  it('flush never rejects even if the transport throws', async () => {
    const throwing: TelemetryTransport = async () => {
      throw new Error('boom');
    };
    const storage = makeStorage();
    const client = createTelemetryClient({
      endpoint: ENDPOINT,
      transport: throwing,
      storage,
      generateUuid: makeUuid(),
      now: () => 1000,
    });

    client.enqueue(baseInput);
    await expect(client.flush()).resolves.toBeUndefined();
    // The throw is treated as a failure → event persisted for retry.
    expect(parseQueue(storage.map.get(TELEMETRY_RETRY_QUEUE_STORAGE_KEY) ?? null)).toHaveLength(1);
  });
});
