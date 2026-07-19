/**
 * People search (accounts pivot, Phase 2/3) — find other users to follow.
 *
 * A debounced search over `public.profiles` (handle / display name), each result
 * row linking to the user's public profile (`/u/:userId`) with a {@link FollowButton}.
 * Mounted at `/people` behind RequireAuth. Provides the {@link SocialConfigProvider}
 * so the follow buttons get the client + viewer id.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { buildUserProfilePath } from '../app/routes';
import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { supabase } from '../auth/supabaseClient';
import FollowButton from './FollowButton';
import { SocialConfigProvider } from './SocialContext';
import { searchProfiles, type ProfileLite } from './userDiscoveryApi';
import './PeopleSearchPage.css';

export interface PeopleSearchPageProps {
  /** Test seam: the Supabase client. Defaults to the auth provider's. */
  client?: AuthClient;
  /** Test seam: the search impl. Defaults to {@link searchProfiles}. */
  search?: typeof searchProfiles;
  /** Test seam: debounce delay (ms). Defaults to 250. */
  debounceMs?: number;
}

export default function PeopleSearchPage({
  client: clientProp,
  search = searchProfiles,
  debounceMs = 250,
}: PeopleSearchPageProps = {}) {
  const auth = useAuth();
  const client = clientProp ?? auth.client ?? supabase;
  const userId = auth.user?.id ?? null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    let active = true;
    const id = setTimeout(() => {
      void (async () => {
        const res = await search(client, q, { excludeUserId: userId });
        if (active) {
          setResults(res);
          setSearched(true);
        }
      })();
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, client, userId, search, debounceMs]);

  return (
    <SocialConfigProvider value={{ client, userId }}>
      <div className="people-page">
        <header className="people-header">
          <Link to="/" className="people-back" aria-label="Back to home">
            ‹ Home
          </Link>
          <h1 className="people-title">Find people</h1>
        </header>
        <input
          className="people-search"
          type="search"
          value={query}
          placeholder="Search by name or @handle"
          aria-label="Search people"
          data-testid="people-search-input"
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="people-results" data-testid="people-results">
          {results.map((p) => (
            <li key={p.id} className="people-row">
              <Link to={buildUserProfilePath(p.id)} className="people-row__main">
                <span className="people-avatar" aria-hidden="true">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" />
                  ) : (
                    (p.displayName[0] ?? '?').toUpperCase()
                  )}
                </span>
                <span className="people-id">
                  <span className="people-name">{p.displayName}</span>
                  <span className="people-handle">@{p.handle}</span>
                </span>
              </Link>
              <FollowButton targetUserId={p.id} />
            </li>
          ))}
          {searched && results.length === 0 && (
            <li className="people-empty">No one found for “{query.trim()}”.</li>
          )}
        </ul>
      </div>
    </SocialConfigProvider>
  );
}
