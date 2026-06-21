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
});
