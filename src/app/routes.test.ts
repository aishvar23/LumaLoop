import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  buildCardDeepLink,
  routeKindFor,
  type RouteKind,
} from './routes';

describe('routes', () => {
  it('exposes the home, feed and deep-link path patterns', () => {
    expect(ROUTES.home).toBe('/');
    expect(ROUTES.feed).toBe('/feed');
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
    it('maps route keys to route kinds', () => {
      // Only the feed is a feed-telemetry surface.
      expect(routeKindFor.feed).toBe('session');
      expect(routeKindFor.cardDeepLink).toBe('card_deep_link');
      // Home + account routes (accounts pivot) are not feed-telemetry surfaces.
      expect(routeKindFor.home).toBe('account');
      expect(routeKindFor.authCallback).toBe('account');
      expect(routeKindFor.profile).toBe('account');
    });

    it('only yields values from the RouteKind union', () => {
      const kinds: RouteKind[] = Object.values(routeKindFor);
      for (const kind of kinds) {
        expect(['session', 'card_deep_link', 'account']).toContain(kind);
      }
    });
  });
});
