import { DAILY_REMINDERS } from './reminderSchedule';

// Guardrail (Design §7): reminder copy must not make IQ / brain-training /
// clinical / cognitive claims. Assert the forbidden vocabulary never appears.
const FORBIDDEN = /\b(iq|brain|train(?:ing)?|smarter?|clinical|cognitive)\b/i;

describe('DAILY_REMINDERS', () => {
  it('defines exactly two reminders', () => {
    expect(DAILY_REMINDERS).toHaveLength(2);
  });

  it('has distinct slots: one morning, one evening', () => {
    const slots = DAILY_REMINDERS.map((r) => r.slot);
    expect(slots).toEqual(['morning', 'evening']);
    expect(new Set(slots).size).toBe(2);
  });

  it('fires at 8:00 and 20:00 local time', () => {
    const morning = DAILY_REMINDERS.find((r) => r.slot === 'morning');
    const evening = DAILY_REMINDERS.find((r) => r.slot === 'evening');
    expect(morning).toMatchObject({ hour: 8, minute: 0 });
    expect(evening).toMatchObject({ hour: 20, minute: 0 });
  });

  it('gives every reminder a distinct, non-empty title and body', () => {
    const titles = DAILY_REMINDERS.map((r) => r.title);
    expect(new Set(titles).size).toBe(DAILY_REMINDERS.length);
    for (const r of DAILY_REMINDERS) {
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps copy within the positioning guardrails (no IQ/brain/clinical claims)', () => {
    for (const r of DAILY_REMINDERS) {
      expect(`${r.title} ${r.body}`).not.toMatch(FORBIDDEN);
    }
  });
});
