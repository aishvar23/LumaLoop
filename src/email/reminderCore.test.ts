import { describe, expect, it, vi } from 'vitest';

import {
  buildReminderEmail,
  buildReminderPush,
  isValidEmail,
  sendDailyReminders,
  sendWebPush,
  type PushSubscriptionRow,
  type Recipient,
  type SendEmail,
  type SendPush,
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

describe('buildReminderPush', () => {
  it('builds guardrail-safe copy (no IQ / brain-training claims)', () => {
    const push = buildReminderPush();
    const body = `${push.title} ${push.body}`.toLowerCase();
    expect(body).not.toMatch(/iq|brain|train|smarter|clinical|cognitive/);
  });

  it('varies morning vs evening copy', () => {
    const morning = buildReminderPush('morning');
    const evening = buildReminderPush('evening');
    expect(morning.title).not.toBe(evening.title);
    expect(morning.body).not.toBe(evening.body);
    for (const p of [morning, evening]) {
      const body = `${p.title} ${p.body}`.toLowerCase();
      expect(body).not.toMatch(/iq|brain|train|smarter|clinical|cognitive/);
    }
  });

  it('points url at the given app URL (defaulting to DEFAULT_APP_URL)', () => {
    expect(buildReminderPush('evening').url).toBe('https://witzy.app');
    expect(buildReminderPush('morning', 'https://witzy.example.app').url).toBe(
      'https://witzy.example.app',
    );
  });
});

describe('sendWebPush', () => {
  const subs: PushSubscriptionRow[] = [
    { endpoint: 'https://push/a', subscription: { keys: 'a' } },
    { endpoint: 'https://push/b', subscription: { keys: 'b' } },
  ];

  it('treats a null transport as a safe no-op', async () => {
    const summary = await sendWebPush(subs, null, null);
    expect(summary).toEqual({ sent: 0, failed: 0 });
  });

  it('sends the built payload to every subscription and tallies sent', async () => {
    const send: SendPush = vi.fn(async () => ({ ok: true }));
    const summary = await sendWebPush(subs, send, null, 'morning', 'https://app');
    expect(send).toHaveBeenCalledTimes(2);
    const payload = JSON.parse((send as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect(payload).toEqual(buildReminderPush('morning', 'https://app'));
    expect(summary).toEqual({ sent: 2, failed: 0 });
  });

  it('prunes expired subscriptions and counts them as failed', async () => {
    const send: SendPush = vi.fn(async (subscription) =>
      (subscription as { keys: string }).keys === 'a'
        ? { ok: false, expired: true }
        : { ok: true },
    );
    const deleteExpired = vi.fn(async () => {});
    const summary = await sendWebPush(subs, send, deleteExpired);
    expect(summary).toEqual({ sent: 1, failed: 1 });
    expect(deleteExpired).toHaveBeenCalledWith('https://push/a');
    expect(deleteExpired).toHaveBeenCalledTimes(1);
  });

  it('never throws when a send or a prune rejects', async () => {
    const send: SendPush = vi.fn(async () => {
      throw new Error('push service down');
    });
    const deleteExpired = vi.fn(async () => {
      throw new Error('delete failed');
    });
    const summary = await sendWebPush([subs[0]], send, deleteExpired);
    expect(summary).toEqual({ sent: 0, failed: 1 });
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
