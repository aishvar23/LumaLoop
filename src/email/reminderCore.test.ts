import { describe, expect, it, vi } from 'vitest';

import {
  buildReminderEmail,
  isValidEmail,
  sendDailyReminders,
  type Recipient,
  type SendEmail,
} from './reminderCore';

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  player@example.com  ')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('buildReminderEmail', () => {
  it('builds guardrail-safe copy (no IQ / brain-training claims)', () => {
    const email = buildReminderEmail();
    expect(email.subject).toMatch(/witzy/i);
    const body = `${email.text} ${email.html}`.toLowerCase();
    expect(body).not.toMatch(/iq|brain|train|smarter|clinical|cognitive/);
    expect(email.html).toContain('href="https://witzy.app"');
  });

  it('varies morning vs evening copy (twice-daily nudges should not read as dupes)', () => {
    const morning = buildReminderEmail('morning');
    const evening = buildReminderEmail('evening');
    expect(morning.subject).not.toBe(evening.subject);
    expect(morning.subject).toMatch(/witzy/i);
    for (const e of [morning, evening]) {
      const body = `${e.text} ${e.html}`.toLowerCase();
      expect(body).not.toMatch(/iq|brain|train|smarter|clinical|cognitive/);
    }
  });

  it('points "Start playing" at the given app URL', () => {
    const email = buildReminderEmail('evening', 'https://witzy.example.app');
    expect(email.html).toContain('href="https://witzy.example.app"');
    expect(email.text).toContain('https://witzy.example.app');
  });
});

describe('sendDailyReminders', () => {
  const recipients: Recipient[] = [
    { email: 'a@example.com' },
    { email: 'b@example.com' },
  ];

  it('sends to every valid recipient and reports delivered', async () => {
    const send: SendEmail = vi.fn(async () => ({ ok: true }));
    const summary = await sendDailyReminders(recipients, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ attempted: 2, sent: 2, skipped: 0, delivered: true });
  });

  it('treats a null transport as a safe no-op (provider not configured)', async () => {
    const summary = await sendDailyReminders(recipients, null);
    expect(summary).toEqual({
      attempted: 2,
      sent: 0,
      skipped: 2,
      errors: [],
      delivered: false,
    });
  });

  it('skips invalid addresses without calling the transport for them', async () => {
    const send: SendEmail = vi.fn(async () => ({ ok: true }));
    const summary = await sendDailyReminders(
      [{ email: 'good@example.com' }, { email: 'bad-address' }],
      send,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ attempted: 2, sent: 1, skipped: 1 });
  });

  it('records a provider error and keeps going (one bad send does not abort)', async () => {
    const send: SendEmail = vi.fn(async ({ to }) =>
      to === 'a@example.com' ? { ok: false, error: 'rate limited' } : { ok: true },
    );
    const summary = await sendDailyReminders(recipients, send);
    expect(summary).toMatchObject({ attempted: 2, sent: 1, skipped: 1, delivered: true });
    expect(summary.errors).toEqual(['rate limited']);
  });

  it('never throws when the transport throws', async () => {
    const send: SendEmail = vi.fn(async () => {
      throw new Error('network down');
    });
    const summary = await sendDailyReminders([{ email: 'a@example.com' }], send);
    expect(summary).toMatchObject({ sent: 0, skipped: 1, delivered: false });
    expect(summary.errors).toEqual(['network down']);
  });
});
