/**
 * Hand-written Supabase fakes for the mobile unit tests (accounts pivot — adapted
 * from web `src/auth/testFakes.ts`).
 *
 * Real OAuth / a real Supabase backend cannot run in CI, so every account
 * behaviour is verified against these fakes, which implement exactly the narrow
 * {@link AuthClient} surface the app depends on. They are deliberately simple and
 * controllable: a fixed session, scripted query results, and recorded inserts.
 * Adds the native-only auth methods the RN AuthProvider uses
 * (`signInWithOAuth` returning an authorize URL, and `signInWithIdToken`).
 *
 * Test-only — never imported by app code.
 */
import type { Session, User } from '@supabase/supabase-js';

import type { AuthClient } from './authClient';
import type { GamePlay, Profile, UserGameScore } from '../core/auth/types';

export interface FakeAuthOptions {
  /** The session returned by getSession() and pushed to subscribers. */
  session?: Session | null;
  /** The profile row a `profiles` select resolves to (null = not created yet). */
  profile?: Profile | null;
  /** The plays a `game_plays` select resolves to. */
  plays?: GamePlay[];
  /** The rows a `user_game_scores` select resolves to (D2/D3). */
  gameScores?: UserGameScore[];
  /** Force a profiles-select error message. */
  profileError?: string | null;
  /** The authorize URL `signInWithOAuth` returns. */
  oauthUrl?: string;
  /** Force the profiles-insert to fail with this Postgres code (e.g. '23505'). */
  insertProfileErrorCode?: string;
}

export interface FakeAuthClient {
  client: AuthClient;
  /** Inserts captured against `game_plays`. */
  gamePlayInserts: unknown[];
  /** Inserts captured against `profiles`. */
  profileInserts: unknown[];
  /** Push a new auth state to all current subscribers. */
  emitAuthState: (session: Session | null) => void;
  /** Spies. */
  calls: {
    signInWithOAuth: unknown[];
    signInWithOtp: unknown[];
    signInWithIdToken: unknown[];
    signOut: number;
    exchangeCodeForSession: unknown[];
  };
}

/** Build a minimal fake user. */
export function makeUser(id = 'user-1'): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  } as User;
}

/** Build a minimal fake session for a user. */
export function makeSession(user: User = makeUser()): Session {
  return {
    access_token: 'fake-access',
    refresh_token: 'fake-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  } as Session;
}

/** Build a fake profile row. */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    handle: 'player_one',
    display_name: 'Player One',
    avatar_url: null,
    bio: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create a fake {@link AuthClient}. The query builder is a tiny thenable that
 * resolves to the scripted data for the table, supporting the chained methods the
 * app uses (`select/eq/order/maybeSingle/single/insert`).
 */
export function createFakeAuthClient(options: FakeAuthOptions = {}): FakeAuthClient {
  const subscribers = new Set<(session: Session | null) => void>();
  const gamePlayInserts: unknown[] = [];
  const profileInserts: unknown[] = [];
  const calls = {
    signInWithOAuth: [] as unknown[],
    signInWithOtp: [] as unknown[],
    signInWithIdToken: [] as unknown[],
    signOut: 0,
    exchangeCodeForSession: [] as unknown[],
  };

  function profilesBuilder() {
    const result = {
      data: options.profile ?? null,
      error: options.profileError
        ? { message: options.profileError, code: 'XXXXX' }
        : null,
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      insert: (row: unknown) => {
        profileInserts.push(row);
        return {
          select: () => ({
            single: () =>
              options.insertProfileErrorCode
                ? Promise.resolve({
                    data: null,
                    error: {
                      message: 'insert failed',
                      code: options.insertProfileErrorCode,
                    },
                  })
                : Promise.resolve({
                    data: { ...makeProfile(), ...(row as object) },
                    error: null,
                  }),
          }),
        };
      },
    };
    return builder;
  }

  function gamePlaysBuilder() {
    const result = { data: options.plays ?? [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      insert: (row: unknown) => {
        gamePlayInserts.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  // `user_game_scores` (a read-only VIEW): D2 reads it via `.select().eq()` and
  // D3 via `.select().eq().order()`. Both terminal calls resolve to the scripted
  // rows, so a single thenable-free builder serves both shapes.
  function gameScoresBuilder() {
    const result = { data: options.gameScores ?? [], error: null };
    const builder = {
      select: () => builder,
      eq: () => ({
        ...builder,
        order: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => void) => resolve(result),
      }),
      order: () => Promise.resolve(result),
    };
    return builder;
  }

  const client = {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: options.session ?? null } }),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        const wrapped = (s: Session | null) => cb('SIGNED_IN', s);
        subscribers.add(wrapped);
        return {
          data: {
            subscription: { unsubscribe: () => subscribers.delete(wrapped) },
          },
        };
      },
      signInWithOAuth: (args: unknown) => {
        calls.signInWithOAuth.push(args);
        return Promise.resolve({
          data: { url: options.oauthUrl ?? 'https://provider.example/authorize' },
          error: null,
        });
      },
      signInWithOtp: (args: unknown) => {
        calls.signInWithOtp.push(args);
        return Promise.resolve({ data: {}, error: null });
      },
      signInWithIdToken: (args: unknown) => {
        calls.signInWithIdToken.push(args);
        return Promise.resolve({ data: {}, error: null });
      },
      signOut: () => {
        calls.signOut += 1;
        return Promise.resolve({ error: null });
      },
      exchangeCodeForSession: (arg: unknown) => {
        calls.exchangeCodeForSession.push(arg);
        return Promise.resolve({ data: {}, error: null });
      },
    },
    from: (table: string) => {
      if (table === 'game_plays') return gamePlaysBuilder();
      if (table === 'user_game_scores') return gameScoresBuilder();
      return profilesBuilder();
    },
  } as unknown as AuthClient;

  return {
    client,
    gamePlayInserts,
    profileInserts,
    calls,
    emitAuthState: (session) => {
      for (const cb of subscribers) cb(session);
    },
  };
}

/** A no-op deep-link source for the AuthProvider tests (no initial URL, no events). */
export function createFakeLinking(initialUrl: string | null = null) {
  const handlers = new Set<(url: string) => void>();
  return {
    getInitialURL: () => Promise.resolve(initialUrl),
    addEventListener: (handler: (url: string) => void) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    },
    /** Simulate an incoming deep link (warm start). */
    emit: (url: string) => {
      for (const h of handlers) h(url);
    },
  };
}
