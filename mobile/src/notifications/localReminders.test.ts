import * as Notifications from 'expo-notifications';

import { configureNotificationHandler, ensureDailyReminders } from './localReminders';
import { DAILY_REMINDERS } from './reminderSchedule';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe('ensureDailyReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mocked.cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined as never);
    mocked.scheduleNotificationAsync.mockResolvedValue('id' as never);
  });

  it('cancels all then schedules both reminders with the right daily hours', async () => {
    const ok = await ensureDailyReminders();

    expect(ok).toBe(true);
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(DAILY_REMINDERS.length);

    const scheduledHours = mocked.scheduleNotificationAsync.mock.calls.map(
      ([arg]) => (arg.trigger as { hour: number }).hour,
    );
    expect(scheduledHours).toEqual([8, 20]);

    // Every scheduled trigger is a DAILY (local-time) trigger.
    for (const [arg] of mocked.scheduleNotificationAsync.mock.calls) {
      expect((arg.trigger as { type: string }).type).toBe('daily');
    }
  });

  it('requests permission when not already granted, then schedules', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' } as never);

    const ok = await ensureDailyReminders();

    expect(ok).toBe(true);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(DAILY_REMINDERS.length);
  });

  it('schedules nothing and returns false when permission is denied', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);
    mocked.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);

    const ok = await ensureDailyReminders();

    expect(ok).toBe(false);
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never throws and returns false if a native call rejects', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(new Error('no native module'));

    await expect(ensureDailyReminders()).resolves.toBe(false);
  });
});

describe('configureNotificationHandler', () => {
  it('registers a foreground handler (no sound, no badge)', async () => {
    configureNotificationHandler();

    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
    const arg = mocked.setNotificationHandler.mock.calls[0][0];
    const behavior = await arg!.handleNotification({} as never);
    expect(behavior).toMatchObject({ shouldPlaySound: false, shouldSetBadge: false });
  });
});
