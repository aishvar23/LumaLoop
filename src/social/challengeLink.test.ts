import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_BASE_URL,
  buildChallengeUrl,
  challengeShareText,
  parseChallenge,
} from './challengeLink';

describe('buildChallengeUrl', () => {
  it('builds a URL with the score query when points are positive', () => {
    expect(
      buildChallengeUrl({ cardId: 'spot_it-1', points: 420, origin: 'https://x.app' }),
    ).toBe('https://x.app/c/spot_it-1?s=420');
  });

  it('omits the score query when points are null', () => {
    expect(
      buildChallengeUrl({ cardId: 'spot_it-1', points: null, origin: 'https://x.app' }),
    ).toBe('https://x.app/c/spot_it-1');
  });

  it('omits the score query when points are zero or negative', () => {
    expect(buildChallengeUrl({ cardId: 'c', points: 0, origin: 'https://x.app' })).toBe(
      'https://x.app/c/c',
    );
    expect(buildChallengeUrl({ cardId: 'c', points: -5, origin: 'https://x.app' })).toBe(
      'https://x.app/c/c',
    );
  });

  it('rounds fractional points', () => {
    expect(
      buildChallengeUrl({ cardId: 'c', points: 99.6, origin: 'https://x.app' }),
    ).toBe('https://x.app/c/c?s=100');
  });

  it('trims a trailing slash from the origin', () => {
    expect(
      buildChallengeUrl({ cardId: 'c', points: 10, origin: 'https://x.app/' }),
    ).toBe('https://x.app/c/c?s=10');
  });

  it('encodes a cardId with reserved characters', () => {
    expect(buildChallengeUrl({ cardId: 'a/b?c#d', points: 10, origin: 'https://x.app' })).toBe(
      'https://x.app/c/a%2Fb%3Fc%23d?s=10',
    );
  });

  it('falls back to the public base URL when no origin is given', () => {
    expect(buildChallengeUrl({ cardId: 'c', points: 10 })).toBe(
      `${CHALLENGE_BASE_URL}/c/c?s=10`,
    );
  });
});

describe('parseChallenge', () => {
  it('parses a valid positive score', () => {
    expect(parseChallenge('?s=420')).toEqual({ points: 420 });
    expect(parseChallenge('s=420')).toEqual({ points: 420 });
  });

  it('returns null when the score param is missing', () => {
    expect(parseChallenge('')).toEqual({ points: null });
    expect(parseChallenge('?other=1')).toEqual({ points: null });
  });

  it('returns null for garbage / non-positive scores', () => {
    expect(parseChallenge('?s=abc')).toEqual({ points: null });
    expect(parseChallenge('?s=0')).toEqual({ points: null });
    expect(parseChallenge('?s=-5')).toEqual({ points: null });
  });
});

describe('challengeShareText', () => {
  it('frames the score when points are present', () => {
    expect(challengeShareText(420)).toBe(
      'I scored 420 on this Witzy puzzle — can you beat me?',
    );
  });

  it('falls back to a solve prompt when points are absent', () => {
    expect(challengeShareText(null)).toBe('Try this Witzy puzzle — can you solve it?');
    expect(challengeShareText(0)).toBe('Try this Witzy puzzle — can you solve it?');
  });

  it('never uses IQ / skill / ability framing (Design §7)', () => {
    for (const text of [challengeShareText(420), challengeShareText(null)]) {
      expect(text).not.toMatch(/iq|brain|smart|cognitive|intelligence/i);
    }
  });
});
