/**
 * The twice-daily local reminder schedule (pure data + copy).
 *
 * Kept deliberately separate from the native `expo-notifications` API so the
 * reminder times and user-facing copy are trivially unit-testable without a
 * native module. {@link localReminders} consumes this to actually schedule the
 * on-device notifications; nothing here imports React Native or Expo.
 *
 * Reminders fire at each device's LOCAL time (a DAILY trigger matches the local
 * hour/minute), so there is no timezone handling to do — 8:00 and 20:00 always
 * mean the user's own morning and evening.
 *
 * Copy guardrail (Design §7): no IQ / brain-training / "smarter" / clinical /
 * cognitive claims — just a friendly nudge back into the puzzle feed.
 */

/** Which of the two daily slots a reminder belongs to. */
export type ReminderSlot = 'morning' | 'evening';

/** A single scheduled reminder: when it fires (local time) and what it says. */
export interface ScheduledReminder {
  slot: ReminderSlot;
  /** Local hour, 0–23. */
  hour: number;
  /** Local minute, 0–59. */
  minute: number;
  title: string;
  body: string;
}

/**
 * The two daily reminders, at 8:00 and 20:00 LOCAL time. Data-driven so adding /
 * retiming a slot is a one-line change with no native-code edits.
 */
export const DAILY_REMINDERS: ScheduledReminder[] = [
  {
    slot: 'morning',
    hour: 8,
    minute: 0,
    title: '☀️ Warm up with a Witzy puzzle',
    body: 'A fresh feed of quick puzzles is ready — play a few and keep your streak going.',
  },
  {
    slot: 'evening',
    hour: 20,
    minute: 0,
    title: '🌙 Your evening Witzy break',
    body: 'Take a short break and solve a few quick puzzles before the day is out.',
  },
];
