/*
 * Web push service worker (accounts pivot). Served at the site root by Vite's
 * `public/` folder, so it controls the whole origin — the scope web push needs.
 *
 * Deliberately minimal and dependency-free: it only handles the two events a
 * daily-reminder push requires. All notification COPY is built server-side by
 * `buildReminderPush` (src/email/reminderCore.ts) and delivered as the push
 * payload — this file just renders whatever it receives.
 */

// A push arrived. Show the reminder notification the cron sent.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'Witzy';
  const body = payload.body || 'Time for a few quick puzzles.';
  const url = payload.url || '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

// The user tapped the notification. Focus an open app window, or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return undefined;
      }),
  );
});
