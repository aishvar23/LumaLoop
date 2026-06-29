/**
 * Tests for the mobile challenge-link helpers (RN counterpart of web
 * `src/social/challengeLink.test.ts`). Pure logic; uses jest globals.
 */
import {
  CHALLENGE_BASE_URL,
  buildChallengeUrl,
  challengeShareText,
  parseChallenge,
} from './challengeLink';

describe('buildChallengeUrl (mobile)', () => {
  it('builds a URL with the score query when points are positive', () => {
    expect(
      buildChallengeUrl({ cardId: 'spot_it-1', points: 420, origin: 'https://x.app' }),
    ).toBe('https://x.app/c/spot_it-1?s=420');
  });

  it('omits the score query when points are null/<=0', () => {
    expect(buildChallengeUrl({ cardId: 'c', points: null, origin: 'https://x.app' })).toBe(
      'https://x.app/c/c',
    );
    expect(buildChallengeUrl({ cardId: 'c', points: 0, origin: 'https://x.app' })).toBe(
      'https://x.app/c/c',
    );
  });

  it('trims a trailing slash from the origin and encodes the cardId', () => {
    expect(
      buildChallengeUrl({ cardId: 'a/b?c#d', points: 10, origin: 'https://x.app/' }),
    ).toBe('https://x.app/c/a%2Fb%3Fc%23d?s=10');
  });

  it('falls back to the public base URL when no origin is given', () => {
    expect(buildChallengeUrl({ cardId: 'c', points: 10 })).toBe(
      `${CHALLENGE_BASE_URL}/c/c?s=10`,
    );
  });
});

describe('parseChallenge (mobile)', () => {
  it('parses a valid positive score', () => {
    expect(parseChallenge('?s=420')).toEqual({ points: 420 });
  });

  it('returns null when missing or garbage', () => {
    expect(parseChallenge('')).toEqual({ points: null });
    expect(parseChallenge('?s=abc')).toEqual({ points: null });
    expect(parseChallenge('?s=0')).toEqual({ points: null });
  });
});

describe('challengeShareText (mobile)', () => {
  it('frames the score when present, prompts a solve otherwise', () => {
    expect(challengeShareText(420)).toBe(
      'I scored 420 on this Witzy puzzle — can you beat me?',
    );
    expect(challengeShareText(null)).toBe('Try this Witzy puzzle — can you solve it?');
  });

  it('never uses IQ / skill / ability framing (Design §7)', () => {
    for (const text of [challengeShareText(420), challengeShareText(null)]) {
      expect(text).not.toMatch(/iq|brain|smart|cognitive|intelligence/i);
    }
  });
});
