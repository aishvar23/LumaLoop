/**
 * Tests for the absolute telemetry endpoint resolution (ADO #129, M5).
 */
import {
  DEFAULT_API_BASE_URL,
  resolveTelemetryEndpoint,
  TELEMETRY_EVENT_PATH,
} from './endpoint';

describe('resolveTelemetryEndpoint', () => {
  it('joins an explicit base with the event path', () => {
    expect(resolveTelemetryEndpoint('https://api.example.com')).toBe(
      `https://api.example.com${TELEMETRY_EVENT_PATH}`,
    );
  });

  it('trims a single trailing slash on the base', () => {
    expect(resolveTelemetryEndpoint('https://api.example.com/')).toBe(
      `https://api.example.com${TELEMETRY_EVENT_PATH}`,
    );
  });

  it('falls back to the documented default base when none is given', () => {
    // No arg and no EXPO_PUBLIC_API_BASE_URL set in the test env → default.
    const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    try {
      expect(resolveTelemetryEndpoint()).toBe(
        `${DEFAULT_API_BASE_URL}${TELEMETRY_EVENT_PATH}`,
      );
    } finally {
      if (previous !== undefined) process.env.EXPO_PUBLIC_API_BASE_URL = previous;
    }
  });

  it('treats a blank base as unset and uses the default', () => {
    expect(resolveTelemetryEndpoint('   ')).toBe(
      `${DEFAULT_API_BASE_URL}${TELEMETRY_EVENT_PATH}`,
    );
  });

  it('defaults to our scoped Vercel production alias (ADO #131)', () => {
    // Our STABLE production alias is scoped to our Vercel project.
    expect(DEFAULT_API_BASE_URL).toBe(
      'https://luma-loop-madhursethji-7775s-projects.vercel.app',
    );
  });

  it('never defaults to the unrelated luma-loop.vercel.app host (ADO #131)', () => {
    // `luma-loop.vercel.app` belongs to an UNRELATED project (a bottle company),
    // not ours — guard against ever regressing the default back to it.
    expect(DEFAULT_API_BASE_URL).not.toBe('https://luma-loop.vercel.app');

    const previous = process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    try {
      expect(resolveTelemetryEndpoint()).not.toContain('luma-loop.vercel.app');
    } finally {
      if (previous !== undefined) process.env.EXPO_PUBLIC_API_BASE_URL = previous;
    }
  });
});
