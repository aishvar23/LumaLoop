/**
 * Web push subscribe flow (accounts pivot) — client side.
 *
 * Registers the root service worker, asks the browser for notification
 * permission (only ever on a user gesture — see {@link enablePush}), subscribes
 * to the push service with our VAPID public key, and persists the resulting
 * subscription to Supabase so the daily-reminder cron can deliver to it.
 *
 * Best-effort by design: every browser here is a moving target (permission can
 * be blocked, the push service can be unreachable, iOS only supports this once
 * "Added to Home Screen"), so {@link enablePush} NEVER throws — it returns a
 * typed `{ ok, reason }` the UI can reflect quietly. The pure decoder
 * ({@link urlBase64ToUint8Array}) and the persisted payload shape are the parts
 * that must be exactly right, so those are unit-tested.
 */
import type { AuthClient } from '../auth/authClient';

/** The VAPID public key (client half). Undefined when web push isn't configured. */
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

/** Whether this browser can do web push at all (SW + Push + Notification APIs). */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Decode a URL-safe base64 VAPID key into the `Uint8Array` the Push API's
 * `applicationServerKey` requires. Pure — no browser globals — so it's unit
 * testable and reusable. (Standard VAPID decoder: pad, swap `-_`→`+/`, atob.)
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Why {@link enablePush} could not turn reminders on (for quiet UI copy). */
export type EnablePushReason = 'unsupported' | 'denied' | 'error';

/**
 * Turn on web-push reminders for `userId`. Best-effort: registers the SW,
 * requests permission (must be called from a user gesture), subscribes, and
 * upserts the subscription to Supabase. Returns `{ ok:true }` on success, or
 * `{ ok:false, reason }` for the unsupported/denied/error paths — never throws.
 */
export async function enablePush(
  client: AuthClient,
  userId: string,
): Promise<{ ok: boolean; reason?: EnablePushReason }> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: 'denied' };
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: our decoder returns a plain `Uint8Array`; the DOM lib narrows
      // `applicationServerKey` to an ArrayBuffer-backed view, which this is.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    await client.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: sub.toJSON(),
      },
      { onConflict: 'endpoint' },
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
