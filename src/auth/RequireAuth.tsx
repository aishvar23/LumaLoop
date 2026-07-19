/**
 * Feed gate (accounts pivot).
 *
 * A clean wrapper that decides which surface a visitor sees BEFORE the feed,
 * based purely on the {@link useAuth} state — three states:
 *   1. not signed in        → {@link LoginScreen}
 *   2. signed in, no profile → {@link ProfileCreationScreen}
 *   3. signed in WITH profile → the wrapped children (the feed)
 *
 * It deliberately knows nothing about the feed/session controller (CLAUDE.md §4)
 * — it only renders one of three things — so auth never entangles the engine. The
 * loading state shows a neutral placeholder until the initial session + profile
 * resolve, so we never flash the login screen for an already-signed-in user.
 */
import type { ReactNode } from 'react';

import { useAuth } from './AuthProvider';
import LoginScreen from './LoginScreen';
import ProfileCreationScreen from './ProfileCreationScreen';
import './AuthScreens.css';

export interface RequireAuthProps {
  children: ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const { session, profile, loading, profileLoading } = useAuth();

  // Initial resolution (session + first profile load) — neutral placeholder so
  // we don't flash Login for a returning signed-in user.
  if (loading || profileLoading) {
    return (
      <div className="auth-screen" aria-busy="true">
        <p className="auth-tagline">Loading…</p>
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  if (!profile) return <ProfileCreationScreen />;
  return <>{children}</>;
}
