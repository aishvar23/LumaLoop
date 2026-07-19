import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import {
  enablePush,
  isPushSupported,
  urlBase64ToUint8Array,
  VAPID_PUBLIC_KEY,
} from './webPush';

/**
 * Web push is a moving target across browsers, so the client flow is
 * best-effort: the parts that MUST be exact — the VAPID decoder and the
 * persisted subscription payload — are pinned here; the permission/subscribe
 * plumbing is exercised through light globals mocks.
 */

/** Install a fake push-capable browser; returns a restore fn + captured spies. */
function installBrowser(options: {
  permission?: NotificationPermission;
  endpoint?: string;
  subscriptionJson?: unknown;
}) {
  const endpoint = options.endpoint ?? 'https://push.example/abc';
  const subscription = {
    endpoint,
    toJSON: () => options.subscriptionJson ?? { endpoint, keys: { p256dh: 'k' } },
  };
  const subscribe = vi.fn(async () => subscription);
  const register = vi.fn(async () => ({ pushManager: { subscribe } }));
  const requestPermission = vi.fn(async () => options.permission ?? 'granted');

  vi.stubGlobal('navigator', { serviceWorker: { register } });
  // jsdom's `window` is the global; add the feature-detect surfaces to it.
  (window as unknown as { PushManager: unknown }).PushManager = function () {};
  vi.stubGlobal('Notification', { requestPermission });

  return { register, subscribe, requestPermission, endpoint };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { PushManager?: unknown }).PushManager;
  vi.restoreAllMocks();
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a URL-safe base64 key to the expected bytes', () => {
    // 'Ab-_' url-safe → 'Ab+/' standard → bytes [0x01, 0xbf, 0xbf].
    const out = urlBase64ToUint8Array('Ab-_');
    expect(Array.from(out)).toEqual([0x01, 0xbf, 0xbf]);
  });

  it('pads correctly and round-trips a known byte string', () => {
    // btoa('hi') = 'aGk=' → decode back to 'h','i' (104, 105).
    const out = urlBase64ToUint8Array('aGk');
    expect(Array.from(out)).toEqual([104, 105]);
  });

  it('exposes the VAPID public key from the env', () => {
    expect(typeof VAPID_PUBLIC_KEY).toBe('string');
  });
});

describe('isPushSupported', () => {
  it('is true when SW + PushManager + Notification are present', () => {
    installBrowser({});
    expect(isPushSupported()).toBe(true);
  });

  it('is false when PushManager is missing', () => {
    installBrowser({});
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    expect(isPushSupported()).toBe(false);
  });
});

describe('enablePush', () => {
  function fakeClient() {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    return { client: { from } as unknown as AuthClient, from, upsert };
  }

  it('bails as unsupported when the browser lacks the APIs', async () => {
    // No installBrowser → no serviceWorker/PushManager.
    vi.stubGlobal('navigator', {});
    const { client, upsert } = fakeClient();
    const res = await enablePush(client, 'user-1');
    expect(res).toEqual({ ok: false, reason: 'unsupported' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('bails as denied when permission is not granted', async () => {
    const { requestPermission } = installBrowser({ permission: 'denied' });
    const { client, upsert } = fakeClient();
    const res = await enablePush(client, 'user-1');
    expect(requestPermission).toHaveBeenCalled();
    expect(res).toEqual({ ok: false, reason: 'denied' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('subscribes and upserts the subscription with the right payload', async () => {
    const subscriptionJson = { endpoint: 'https://push.example/xyz', keys: { p256dh: 'K' } };
    const { register } = installBrowser({
      endpoint: 'https://push.example/xyz',
      subscriptionJson,
    });
    const { client, from, upsert } = fakeClient();

    const res = await enablePush(client, 'user-42');

    expect(res).toEqual({ ok: true });
    expect(register).toHaveBeenCalledWith('/service-worker.js');
    expect(from).toHaveBeenCalledWith('push_subscriptions');
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-42',
        endpoint: 'https://push.example/xyz',
        subscription: subscriptionJson,
      },
      { onConflict: 'endpoint' },
    );
  });

  it('returns an error result (never throws) when subscribe rejects', async () => {
    installBrowser({});
    (navigator.serviceWorker.register as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('sw failed'),
    );
    const { client } = fakeClient();
    const res = await enablePush(client, 'user-1');
    expect(res).toEqual({ ok: false, reason: 'error' });
  });
});
