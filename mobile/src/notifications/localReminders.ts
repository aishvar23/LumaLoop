/**
 * On-device (LOCAL) scheduled reminder notifications.
 *
 * These are LOCAL notifications, not remote push — no APNs/FCM credentials, no
 * server, no domain. Expo schedules them on the device and the OS fires them at
 * the matching local time, so they keep working offline and need no timezone
 * handling ({@link DAILY_REMINDERS} times are the user's own local clock).
 *
 * Everything here is best-effort and NEVER throws: reminders are a nicety, so a
 * denied permission or a flaky native call must never break sign-in or the feed.
 */
import * as Notifications from 'expo-notifications';

import { DAILY_REMINDERS } from './reminderSchedule';

/**
 * Ensure the twice-daily reminders are scheduled for this device.
 *
 * Requests notification permission on first call (one prompt), then re-schedules
 * from scratch: it cancels all previously scheduled notifications before adding
 * the current set so repeated calls (e.g. once per signed-in launch) stay
 * idempotent instead of piling up duplicates.
 *
 * @returns `true` if the reminders were (re)scheduled, `false` if permission was
 * denied or anything failed. Never throws.
 */
export async function ensureDailyReminders(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return false;

    // Idempotent: clear any prior schedule so launching repeatedly can't stack
    // duplicate reminders.
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const r of DAILY_REMINDERS) {
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body },
        // SDK 56 daily trigger: fires once per day when the LOCAL hour/minute
        // match. (The `DAILY` trigger repeats by nature — there is no `repeats`
        // field on this input shape.)
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: r.hour,
          minute: r.minute,
        },
      });
    }
    return true;
  } catch {
    // Best-effort — a missing native module / rejected call must not surface.
    return false;
  }
}

/**
 * Configure how a reminder is presented while the app is foregrounded. Call once
 * (at module import or from App). Shows the banner + list entry, no sound, no
 * badge — an unobtrusive nudge.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // `shouldShowAlert` is retained for older-runtime compatibility; SDK 56
      // reads `shouldShowBanner` / `shouldShowList`.
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
