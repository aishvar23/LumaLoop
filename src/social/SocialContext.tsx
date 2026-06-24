/**
 * Feed-layer context supplying the social surface with the auth client + the
 * signed-in user's id.
 *
 * The likes/comments surface is a FEED-LAYER concern keyed by `card.cardId`
 * (CLAUDE.md §4/§6) — NOT per-template. Rather than thread the Supabase client
 * and user id through every FeedScreen/FeedSlide prop, the wiring layer
 * ({@link FeedRoute}) provides them once via this context, and the per-slide
 * social rail reads them. When there is no provider (the feed mounted
 * standalone in tests/isolation), {@link useSocialConfig} returns null and the
 * rail simply renders nothing — keeping the engine auth-free.
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { AuthClient } from '../auth/authClient';

export interface SocialConfig {
  /** The Supabase client to read/write social rows with (the auth provider's). */
  client: AuthClient;
  /** The signed-in user's id, or null when signed out (read-only). */
  userId: string | null;
}

const SocialConfigContext = createContext<SocialConfig | null>(null);

export function SocialConfigProvider({
  value,
  children,
}: {
  value: SocialConfig;
  children: ReactNode;
}) {
  return (
    <SocialConfigContext.Provider value={value}>{children}</SocialConfigContext.Provider>
  );
}

/** The social config, or null when no provider is mounted (engine stays auth-free). */
export function useSocialConfig(): SocialConfig | null {
  return useContext(SocialConfigContext);
}
