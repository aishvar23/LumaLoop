/**
 * Tests for the telemetry client (Technical Design §10).
 *
 * Every dependency — transport, beacon, storage, uuid, clock, doc/window — is
 * injected as a FAKE so the in-memory queue, capped `localStorage` retry queue,
 * idempotent de-dup, beacon-vs-transport abandonment, and best-effort
 * non-throwing posture are all deterministic and free of hidden globals.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  type ReadWriteStorage,
  type UuidGenerator,
} from './anonymousUser';
import {
  type AbandonmentListenerOptions,
  createTelemetryClient,
  DEFAULT_MAX_RETRY_QUEUE_SIZE,
  DEFAULT_TELEMETRY_ENDPOINT,
  registerAbandonmentListeners,
  TELEMETRY_RETRY_QUEUE_STORAGE_KEY,
  type TelemetryClient,
  type TelemetryTransport,
} from './telemetryClient';
import {
  type QueuedTelemetryEvent,
  TelemetryEventNames,
  type TelemetryEventInput,
} from './telemetryEvents';

/** The complete set of keys allowed on the wire (§10 payload + eventId). */
const ALLOWED_KEYS = new Set<string>([
  'eventId',
  'eventName',
  'anonymousUserId',
  'sessionId',
  'timestampMs',
  'cardId',
  'cardIndex',
  'templateType',
  'category',
  'evidenceTier',
  'difficulty',
  'routeKind',
  'source',
  'elapsedMs',
  'interactionElapsedMs',
  'isCorrect',
  'resolutionType',
  'attemptCount',
  'measuredSignals',
]);

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

/** Storage that throws on every access (private-mode / quota simulation). */
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

/** A deterministic uuid generator yielding distinct, predictable ids. */
function sequentialUuids(): UuidGenerator {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
}

/** A clock that advances by a fixed step on each read. */
function steppingClock(start = 1_000, step = 1_000): () => number {
  let t = start - step;
  return () => {
    t += step;
    return t;
  };
}

/** Read the persisted retry queue out of a fake storage. */
function readQueue(storage: ReadWriteStorage): QueuedTelemetryEvent[] {
  const raw = storage.getItem(TELEMETRY_RETRY_QUEUE_STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as QueuedTelemetryEvent[]);
}

/** A representative, fully-populated event input (covers every §10 field). */
function sampleInput(
  overrides: Partial<TelemetryEventInput> = {},
): TelemetryEventInput {
  return {
    eventName: TelemetryEventNames.Card_Resolved,
    anonymousUserId: 'anon-1',
    sessionId: 'session-1',
    cardId: 'card-1',
    cardIndex: 0,
    templateType: 'spot_it',
    category: 'visual_attention',
    evidenceTier: 'mechanic_mapped',
    difficulty: 'easy',
    routeKind: 'session',
    source: 'direct',
    elapsedMs: 1234,
    interactionElapsedMs: 999,
    isCorrect: true,
    resolutionType: 'correct',
    attemptCount: 1,
    measuredSignals: ['speed', 'accuracy'],
    ...overrides,
  };
}

describe('telemetry client constants', () => {
  it('exposes the documented defaults (Technical Design §10)', () => {
    expect(DEFAULT_TELEMETRY_ENDPOINT).toBe('/api/event');
    expect(TELEMETRY_RETRY_QUEUE_STORAGE_KEY).toBe(
      'lumaloop.telemetryRetryQueue',
    );
    expect(DEFAULT_MAX_RETRY_QUEUE_SIZE).toBe(50);
  });
});

describe('enqueue + flush', () => {
  it('POSTs to the endpoint with a stamped eventId and injected clock timestamp', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(5_000, 1_000),
    });

    // No explicit timestampMs → filled from the injected clock.
    client.enqueue(sampleInput({ measuredSignals: undefined }));
    await client.flush();

    expect(transport).toHaveBeenCalledTimes(1);
    const [url, body] = transport.mock.calls[0];
    expect(url).toBe('/api/event');

    const sent = JSON.parse(body) as QueuedTelemetryEvent;
    expect(sent.eventId).toBe('00000000-0000-4000-8000-000000000001');
    expect(typeof sent.eventId).toBe('string');
    expect(sent.timestampMs).toBe(5_000);
    expect(sent.eventName).toBe(TelemetryEventNames.Card_Resolved);
    expect(sent.anonymousUserId).toBe('anon-1');
    expect(sent.sessionId).toBe('session-1');

    // Nothing failed → retry queue stays empty.
    expect(readQueue(storage)).toEqual([]);
  });

  it('honours a caller-supplied timestampMs over the clock', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(5_000, 1_000),
    });

    client.enqueue(sampleInput({ timestampMs: 42 }));
    await client.flush();

    const sent = JSON.parse(transport.mock.calls[0][1]) as QueuedTelemetryEvent;
    expect(sent.timestampMs).toBe(42);
  });

  it('uses the endpoint override when provided', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      endpoint: 'https://example.test/ingest',
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await client.flush();

    expect(transport.mock.calls[0][0]).toBe('https://example.test/ingest');
  });

  it('transmits only the allowed §10 keys (no PII fields)', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await client.flush();

    const sent = JSON.parse(
      transport.mock.calls[0][1],
    ) as Record<string, unknown>;
    for (const key of Object.keys(sent)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
    // Defensive: explicitly assert common PII shapes are absent.
    for (const banned of ['name', 'email', 'ip', 'userAgent', 'deviceId']) {
      expect(sent).not.toHaveProperty(banned);
    }
  });
});

describe('transport failure → capped retry queue', () => {
  it('persists a failed event without throwing', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await expect(client.flush()).resolves.toBeUndefined();

    const queue = readQueue(storage);
    expect(queue).toHaveLength(1);
    expect(queue[0].eventId).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('does not throw when the transport REJECTS', async () => {
    const transport = vi
      .fn<TelemetryTransport>()
      .mockRejectedValue(new Error('network down'));
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await expect(client.flush()).resolves.toBeUndefined();
    expect(readQueue(storage)).toHaveLength(1);
  });

  it('drains the persisted retry queue on a later SUCCESSFUL flush and clears storage', async () => {
    // A controllable transport: it fails until `succeed` flips, recording the
    // eventId of every SUCCESSFUL delivery so we can assert no duplicate sends.
    let succeed = false;
    const delivered: string[] = [];
    const transport = vi.fn<TelemetryTransport>(async (_url, body) => {
      if (!succeed) return false;
      delivered.push((JSON.parse(body) as QueuedTelemetryEvent).eventId);
      return true;
    });
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await client.flush(); // fails → event spills to storage
    expect(readQueue(storage)).toHaveLength(1);
    expect(delivered).toEqual([]);

    succeed = true;
    await client.flush(); // drains the persisted event and removes it

    // The persisted event was delivered exactly once (no duplicate POST) and
    // storage is cleared on success.
    expect(delivered).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(readQueue(storage)).toEqual([]);
  });

  it('dedups by eventId so a persisted + re-enqueued event is not double-POSTed', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    // Pre-seed the retry queue with an event id that the in-memory queue will
    // also produce (sequential uuid ...0001), simulating a persisted retry that
    // collides with a freshly enqueued event.
    const persisted: QueuedTelemetryEvent = {
      ...sampleInput(),
      timestampMs: 111,
      eventId: '00000000-0000-4000-8000-000000000001',
    };
    storage.setItem(
      TELEMETRY_RETRY_QUEUE_STORAGE_KEY,
      JSON.stringify([persisted]),
    );

    client.enqueue(sampleInput()); // stamps eventId ...0001 too
    await client.flush();

    // De-duped to a single POST despite appearing in both queues.
    expect(transport).toHaveBeenCalledTimes(1);
    expect(readQueue(storage)).toEqual([]);
  });

  it('enforces the injected maxRetryQueueSize cap, dropping the OLDEST', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const storage = fakeStorage();
    const uuids = sequentialUuids();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: uuids,
      now: steppingClock(),
      maxRetryQueueSize: 3,
    });

    // Enqueue + flush five distinct failing events one at a time so they
    // accumulate in the persisted queue.
    for (let i = 0; i < 5; i += 1) {
      client.enqueue(sampleInput({ cardId: `card-${i}` }));
      await client.flush();
    }

    const queue = readQueue(storage);
    expect(queue).toHaveLength(3);
    // Oldest (ids ...0001, ...0002) dropped; newest three retained in order.
    expect(queue.map((e) => e.eventId)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });

  it('does not lose an abandonment failure persisted while a drain is in flight', async () => {
    // Reproduces the lost-write race: an in-flight `drain` (parked on its
    // transport await) must not clobber a `persistFailure` write performed by an
    // abandonment fallback during that await. We gate the drain's transport so it
    // stays in flight, persist an abandonment failure mid-flight, then release
    // the drain and assert BOTH events survive.
    let releaseDrain!: (delivered: boolean) => void;
    const drainGate = new Promise<boolean>((resolve) => {
      releaseDrain = resolve;
    });
    const transport = vi.fn<TelemetryTransport>(async (_url, body) => {
      const event = JSON.parse(body) as QueuedTelemetryEvent;
      // The abandonment fallback resolves immediately (and fails → persists);
      // the enqueued Card_Resolved drain is held open on the gate.
      if (event.eventName === TelemetryEventNames.Session_Abandoned) {
        return false;
      }
      return drainGate;
    });
    const storage = fakeStorage();
    const client = createTelemetryClient({
      beacon: null,
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    // (1) Enqueue a normal event → its flush starts a drain that sends the event
    // and then parks awaiting `drainGate`. eventId ...0001.
    client.enqueue(sampleInput({ eventName: TelemetryEventNames.Card_Resolved }));
    await Promise.resolve();
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1); // drain is parked in flight

    // (2) Mid-flight, an abandonment falls back to the transport, fails, and
    // persists itself to the retry queue. eventId ...0002.
    client.trackAbandonment(
      sampleInput({ eventName: TelemetryEventNames.Session_Abandoned }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(readQueue(storage).map((e) => e.eventId)).toEqual([
      '00000000-0000-4000-8000-000000000002',
    ]);

    // (3) Release the parked drain as a FAILURE so it writes its terminal queue.
    // The merge must preserve the abandonment write rather than overwrite it.
    releaseDrain(false);
    await client.flush();

    const ids = new Set(readQueue(storage).map((e) => e.eventId));
    // The abandonment event is NOT lost...
    expect(ids.has('00000000-0000-4000-8000-000000000002')).toBe(true);
    // ...and the drain's own failed event is still retained too.
    expect(ids.has('00000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('bounds growth at DEFAULT_MAX_RETRY_QUEUE_SIZE when no cap is injected', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    for (let i = 0; i < DEFAULT_MAX_RETRY_QUEUE_SIZE + 10; i += 1) {
      client.enqueue(sampleInput({ cardId: `card-${i}` }));
      await client.flush();
    }

    expect(readQueue(storage)).toHaveLength(DEFAULT_MAX_RETRY_QUEUE_SIZE);
  });
});

describe('robustness: never throws out of the client', () => {
  it('does not throw when storage throws on get/set', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const client = createTelemetryClient({
      transport,
      storage: throwingStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    expect(() => client.enqueue(sampleInput())).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('does not throw when transport throws synchronously', async () => {
    const transport = vi.fn<TelemetryTransport>(() => {
      throw new Error('sync boom');
    });
    const storage = fakeStorage();
    const client = createTelemetryClient({
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await expect(client.flush()).resolves.toBeUndefined();
    // The throw is treated as a failure → event persisted for retry.
    expect(readQueue(storage)).toHaveLength(1);
  });

  it('works with storage explicitly disabled (null)', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const client = createTelemetryClient({
      transport,
      storage: null,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.enqueue(sampleInput());
    await expect(client.flush()).resolves.toBeUndefined();
    // Nothing to persist into; just must not throw or duplicate.
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('trackAbandonment', () => {
  it('uses the injected beacon when present (no transport call)', () => {
    const beacon = vi.fn().mockReturnValue(true);
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      beacon,
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(7_000, 1_000),
    });

    client.trackAbandonment(
      sampleInput({ eventName: TelemetryEventNames.Session_Abandoned }),
    );

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
    const [url, body] = beacon.mock.calls[0];
    expect(url).toBe('/api/event');
    const sent = JSON.parse(body) as QueuedTelemetryEvent;
    expect(sent.eventName).toBe(TelemetryEventNames.Session_Abandoned);
    expect(sent.timestampMs).toBe(7_000);
    expect(sent.eventId).toBe('00000000-0000-4000-8000-000000000001');
    for (const key of Object.keys(sent)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });

  it('falls back to the transport when beacon is null', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      beacon: null,
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.trackAbandonment(
      sampleInput({ eventName: TelemetryEventNames.Session_Abandoned }),
    );

    // Wait for the fire-and-forget transport promise to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('falls back to transport when the beacon REFUSES the payload', async () => {
    const beacon = vi.fn().mockReturnValue(false);
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      beacon,
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.trackAbandonment(sampleInput());
    await Promise.resolve();
    await Promise.resolve();

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('persists to the retry queue when the fallback transport fails', async () => {
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(false);
    const storage = fakeStorage();
    const client = createTelemetryClient({
      beacon: null,
      transport,
      storage,
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    client.trackAbandonment(sampleInput());
    await Promise.resolve();
    await Promise.resolve();

    expect(readQueue(storage)).toHaveLength(1);
  });

  it('does not throw when the beacon throws', () => {
    const beacon = vi.fn(() => {
      throw new Error('beacon blocked');
    });
    const transport = vi.fn<TelemetryTransport>().mockResolvedValue(true);
    const client = createTelemetryClient({
      beacon,
      transport,
      storage: fakeStorage(),
      generateUuid: sequentialUuids(),
      now: steppingClock(),
    });

    expect(() => client.trackAbandonment(sampleInput())).not.toThrow();
  });
});

describe('default beacon (navigator.sendBeacon) content-type', () => {
  it('wraps the body in an application/json Blob so the content-type matches the fetch path', () => {
    // Capture the second argument the DEFAULT beacon hands to sendBeacon. A raw
    // string would force `text/plain;charset=UTF-8`; we require the JSON Blob.
    const captured: { url: string; body: unknown }[] = [];
    const sendBeacon = vi.fn((url: string, body?: BodyInit | null) => {
      captured.push({ url, body });
      return true;
    });
    vi.stubGlobal('navigator', { sendBeacon });
    try {
      // `beacon` omitted → the client resolves the real defaultBeacon(), which
      // reads the stubbed navigator.sendBeacon.
      const client = createTelemetryClient({
        transport: vi.fn<TelemetryTransport>().mockResolvedValue(true),
        storage: fakeStorage(),
        generateUuid: sequentialUuids(),
        now: steppingClock(),
      });

      client.trackAbandonment(
        sampleInput({ eventName: TelemetryEventNames.Session_Abandoned }),
      );

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].url).toBe('/api/event');
      const body = captured[0].body;
      expect(body).toBeInstanceOf(Blob);
      expect((body as Blob).type).toBe('application/json');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** A fake EventTarget capturing add/remove listener calls. */
function fakeEventTarget(): {
  listeners: Map<string, Set<EventListener>>;
  addEventListener: (type: string, cb: EventListener) => void;
  removeEventListener: (type: string, cb: EventListener) => void;
  dispatch: (type: string) => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    listeners,
    addEventListener(type, cb) {
      const set = listeners.get(type) ?? new Set();
      set.add(cb);
      listeners.set(type, set);
    },
    removeEventListener(type, cb) {
      listeners.get(type)?.delete(cb);
    },
    dispatch(type) {
      for (const cb of listeners.get(type) ?? []) {
        cb(new Event(type));
      }
    },
  };
}

/** A telemetry client stub recording trackAbandonment calls. */
function stubClient(): TelemetryClient & {
  abandonments: TelemetryEventInput[];
} {
  const abandonments: TelemetryEventInput[] = [];
  return {
    abandonments,
    enqueue: () => {},
    flush: () => Promise.resolve(),
    trackAbandonment: (event) => {
      abandonments.push(event);
    },
  };
}

describe('registerAbandonmentListeners', () => {
  it('fires trackAbandonment on visibilitychange→hidden via buildEvent', () => {
    const client = stubClient();
    const doc = {
      ...fakeEventTarget(),
      visibilityState: 'hidden' as DocumentVisibilityState,
    };
    const built = sampleInput({
      eventName: TelemetryEventNames.Session_Abandoned,
    });
    const options: AbandonmentListenerOptions = {
      client,
      buildEvent: () => built,
      doc: doc as unknown as Document,
      win: null,
    };

    registerAbandonmentListeners(options);
    doc.dispatch('visibilitychange');

    expect(client.abandonments).toEqual([built]);
  });

  it('does NOT fire on visibilitychange when the document is still visible', () => {
    const client = stubClient();
    const doc = {
      ...fakeEventTarget(),
      visibilityState: 'visible' as DocumentVisibilityState,
    };

    registerAbandonmentListeners({
      client,
      buildEvent: () => sampleInput(),
      doc: doc as unknown as Document,
      win: null,
    });
    doc.dispatch('visibilitychange');

    expect(client.abandonments).toHaveLength(0);
  });

  it('fires trackAbandonment on pagehide', () => {
    const client = stubClient();
    const win = fakeEventTarget();
    const built = sampleInput();

    registerAbandonmentListeners({
      client,
      buildEvent: () => built,
      doc: null,
      win: win as unknown as Window,
    });
    win.dispatch('pagehide');

    expect(client.abandonments).toEqual([built]);
  });

  it('suppresses the event when buildEvent returns null', () => {
    const client = stubClient();
    const win = fakeEventTarget();

    registerAbandonmentListeners({
      client,
      buildEvent: () => null,
      doc: null,
      win: win as unknown as Window,
    });
    win.dispatch('pagehide');

    expect(client.abandonments).toHaveLength(0);
  });

  it('does not throw when buildEvent throws', () => {
    const client = stubClient();
    const win = fakeEventTarget();

    registerAbandonmentListeners({
      client,
      buildEvent: () => {
        throw new Error('build boom');
      },
      doc: null,
      win: win as unknown as Window,
    });

    expect(() => win.dispatch('pagehide')).not.toThrow();
    expect(client.abandonments).toHaveLength(0);
  });

  it('returns a cleanup that detaches every listener it added', () => {
    const client = stubClient();
    const doc = {
      ...fakeEventTarget(),
      visibilityState: 'hidden' as DocumentVisibilityState,
    };
    const win = fakeEventTarget();

    const cleanup = registerAbandonmentListeners({
      client,
      buildEvent: () => sampleInput(),
      doc: doc as unknown as Document,
      win: win as unknown as Window,
    });

    cleanup();
    doc.dispatch('visibilitychange');
    win.dispatch('pagehide');

    expect(client.abandonments).toHaveLength(0);
    // Listener sets are emptied by removeEventListener.
    expect(doc.listeners.get('visibilitychange')?.size ?? 0).toBe(0);
    expect(win.listeners.get('pagehide')?.size ?? 0).toBe(0);
  });

  it('is a no-op returning a cleanup fn when both doc and win are absent', () => {
    const client = stubClient();
    let cleanup: () => void = () => {};

    expect(() => {
      cleanup = registerAbandonmentListeners({
        client,
        buildEvent: () => sampleInput(),
        doc: null,
        win: null,
      });
    }).not.toThrow();

    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    expect(client.abandonments).toHaveLength(0);
  });
});
