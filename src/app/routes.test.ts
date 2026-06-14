import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  buildCardDeepLink,
  routeKindFor,
  type RouteKind,
} from './routes';

describe('routes', () => {
  it('exposes the session and deep-link path patterns', () => {
    expect(ROUTES.session).toBe('/');
    expect(ROUTES.cardDeepLink).toBe('/c/:cardId');
  });

  describe('buildCardDeepLink', () => {
    it('builds a `/c/<cardId>` path for a simple id', () => {
      expect(buildCardDeepLink('abc123')).toBe('/c/abc123');
    });

    it('URL-encodes ids with reserved/unsafe characters', () => {
      expect(buildCardDeepLink('a/b?c#d')).toBe('/c/a%2Fb%3Fc%23d');
      expect(buildCardDeepLink('with space')).toBe('/c/with%20space');
    });

    it('round-trips through decodeURIComponent (the id is recoverable)', () => {
      const ids = ['abc123', 'a/b?c#d', 'with space', 'créateur+1'];
      for (const id of ids) {
        const path = buildCardDeepLink(id);
        const encoded = path.slice('/c/'.length);
        expect(decodeURIComponent(encoded)).toBe(id);
      }
    });
  });

  describe('routeKindFor', () => {
    it('maps route keys to telemetry route kinds', () => {
      expect(routeKindFor.session).toBe('session');
      expect(routeKindFor.cardDeepLink).toBe('card_deep_link');
    });

    it('only yields the telemetry-aligned RouteKind union', () => {
      const kinds: RouteKind[] = Object.values(routeKindFor);
      for (const kind of kinds) {
        expect(['session', 'card_deep_link']).toContain(kind);
      }
    });
  });
});
