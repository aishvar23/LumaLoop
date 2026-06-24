/**
 * /you profile page (accounts pivot).
 *
 * Shows the signed-in user's avatar / handle / display name and their GAME
 * activity stats, computed from `game_plays` via the pure {@link computeStats}
 * (all aggregation logic lives there, not in this component): games played,
 * accuracy %, best streak, total points, and a per-category breakdown. Includes a
 * Sign out button.
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): everything here is GAME activity —
 * "games played", "points", "best streak", "performance categories". Never
 * traits / IQ / ability / clinical framing.
 */
import { useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { fetchGamePlays } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import type { GamePlay } from '../auth/types';
import { getCardById as defaultGetCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from './computeStats';
import { fetchGameScores } from './gameScoresApi';
import { buildYourGames, type YourGameRow } from './yourGames';
import '../auth/AuthScreens.css';
import './ProfilePage.css';

export interface ProfilePageProps {
  /**
   * Test seam: the Supabase client. Defaults to the auth provider's client (the
   * injected fake in tests), falling back to the real browser client.
   */
  client?: AuthClient;
  /** Test seam: cardId → card resolver for friendly game titles. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
}

/** Format a category id ("visual_attention") into a label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The monogram for the avatar fallback (first letter of name/handle). */
function monogram(displayName: string, handle: string): string {
  const source = displayName.trim() || handle.trim();
  return (source[0] ?? '?').toUpperCase();
}

export default function ProfilePage({
  client: clientProp,
  getCardById = defaultGetCardById,
}: ProfilePageProps) {
  const auth = useAuth();
  const { user, profile, signOut } = auth;
  const client = clientProp ?? auth.client ?? supabase;
  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [games, setGames] = useState<YourGameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      // Aggregate stats + per-game scores in parallel; both best-effort.
      const [playsRes, scoresRes] = await Promise.all([
        fetchGamePlays(client, user.id),
        fetchGameScores(client, user.id),
      ]);
      if (!active) return;
      if (playsRes.error) setError(playsRes.error);
      setStats(computeStats(playsRes.plays as GamePlay[]));
      setGames(buildYourGames(scoresRes.scores, getCardById, 'recent'));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, user, getCardById]);

  if (!profile) {
    return (
      <div className="profile-page">
        <p className="profile-empty">No profile to show.</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        {profile.avatar_url ? (
          <img
            className="profile-avatar"
            src={profile.avatar_url}
            alt=""
          />
        ) : (
          <span className="profile-avatar" aria-hidden="true">
            {monogram(profile.display_name, profile.handle)}
          </span>
        )}
        <div className="profile-identity">
          <h1 className="profile-name">{profile.display_name}</h1>
          <p className="profile-handle">@{profile.handle}</p>
        </div>
      </header>

      <section aria-label="Your game activity">
        {loading ? (
          <p className="profile-empty">Loading your stats…</p>
        ) : (
          <div className="profile-stats-grid">
            <Stat value={String(stats.gamesPlayed)} label="Games played" />
            <Stat value={formatAccuracy(stats.accuracy)} label="Accuracy" />
            <Stat value={String(stats.bestStreak)} label="Best streak" />
            <Stat value={String(stats.totalPoints)} label="Total points" />
          </div>
        )}
      </section>

      {!loading && stats.categories.length > 0 && (
        <section aria-label="Per-category breakdown">
          <h2 className="profile-section-title">By performance category</h2>
          {stats.categories.map((c) => (
            <div key={c.category} className="profile-category-row">
              <span className="profile-category-name">
                {categoryLabel(c.category)}
              </span>
              <span className="profile-category-meta">
                {c.played} played · {formatAccuracy(c.accuracy)} · {c.points} pts
              </span>
            </div>
          ))}
        </section>
      )}

      {!loading && games.length > 0 && (
        <section aria-label="Your games">
          <h2 className="profile-section-title">Your games</h2>
          {games.map((g) => (
            <div key={g.cardId} className="profile-game-row">
              <span className="profile-game-main">
                <span className="profile-game-title">{g.title}</span>
                <span className="profile-game-category">{g.categoryLabel}</span>
              </span>
              <span className="profile-game-scores">
                <span className="profile-game-best">Best {g.bestPoints}</span>
                {' · '}Last {g.lastPoints}
                {' · '}
                {g.timesPlayed === 1
                  ? '1 play'
                  : `${g.timesPlayed} plays`}
              </span>
            </div>
          ))}
        </section>
      )}

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="auth-provider-btn"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat__value">{value}</span>
      <span className="profile-stat__label">{label}</span>
    </div>
  );
}
