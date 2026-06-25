/**
 * Home / Discover landing page (accounts pivot).
 *
 * The DEFAULT surface a signed-in user lands on (mounted at `/`, behind
 * RequireAuth) — an Instagram/Facebook-style home: a greeting, a snapshot of the
 * user's game stats, a grid of featured games, and a prominent "Start playing"
 * CTA that enters the immersive feed at `/feed`. It replaces dropping straight
 * into a game card on login.
 *
 * Separation of concerns (CLAUDE.md §4): this is a PRESENTATIONAL surface only.
 * It never touches the feed/session controller — "Start playing" and the featured
 * tiles are plain client-side links to `/feed`; the feed owns progression. Stats
 * reuse the SAME pipeline the /you profile uses ({@link fetchGamePlays} +
 * {@link computeStats}) — no new aggregation logic here. Featured tiles come from
 * the pure, data-driven {@link selectFeaturedGames} (template-agnostic).
 *
 * POSITIONING GUARDRAIL (Design §7 / §21.8): copy stays about playing games and
 * GAME activity — no IQ / brain-training / ability / clinical framing.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '../app/routes';
import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { fetchGamePlays } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import type { GamePlay } from '../auth/types';
import { selectFeaturedGames, type FeaturedGame } from '../cards/featured';
import { resolveCategoryTheme } from '../ui/categoryTheme';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from './computeStats';
import '../auth/AuthScreens.css';
import './HomePage.css';

export interface HomePageProps {
  /**
   * Test seam: the Supabase client. Defaults to the auth provider's client (the
   * injected fake in tests), falling back to the real browser client.
   */
  client?: AuthClient;
  /** Test seam: the featured games to show. Defaults to the catalog selection. */
  featuredGames?: readonly FeaturedGame[];
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

export default function HomePage({
  client: clientProp,
  featuredGames,
}: HomePageProps = {}) {
  const auth = useAuth();
  const { user, profile } = auth;
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  // The "Upload puzzle" creator feature isn't built yet — clicking the greyed
  // affordance reveals this notice (hover shows it via the native tooltip).
  const [uploadNotice, setUploadNotice] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const playsRes = await fetchGamePlays(client, user.id);
      if (!active) return;
      setStats(computeStats(playsRes.plays as GamePlay[]));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, user]);

  if (!profile) {
    return (
      <div className="home-page">
        <p className="profile-empty">No profile to show.</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      <header className="home-topbar">
        <span className="home-brand">
          <span className="home-brand__mark" aria-hidden="true">
            L
          </span>
          LumaLoop
        </span>
        <div className="home-topbar__actions">
          {/* "Upload puzzle" — greyed out (the creator feature is coming). It is
              intentionally NOT `disabled` so it still fires hover/click: the
              native tooltip covers hover, and clicking reveals the inline notice
              below. aria-disabled tells assistive tech it isn't actionable yet. */}
          <button
            type="button"
            className="home-upload-btn"
            aria-disabled="true"
            title="Coming soon"
            aria-label="Upload puzzle (coming soon)"
            onClick={() => setUploadNotice(true)}
          >
            <span aria-hidden="true">＋</span> Upload puzzle
          </button>
          <Link
            to={ROUTES.profile}
            className="home-profile-link"
            aria-label="Open your profile"
          >
            {profile.avatar_url ? (
              <img className="home-avatar" src={profile.avatar_url} alt="" />
            ) : (
              <span className="home-avatar" aria-hidden="true">
                {monogram(profile.display_name, profile.handle)}
              </span>
            )}
          </Link>
        </div>
      </header>

      {uploadNotice && (
        <p className="home-upload-notice" role="status">
          Uploading your own puzzles is coming soon.
        </p>
      )}

      <section className="home-hero">
        <h1 className="home-greeting">Welcome back, {profile.display_name}</h1>
        <p className="home-subtitle">
          Pick up where you left off, or jump into something new.
        </p>
        <Link to={ROUTES.feed} className="home-start-btn">
          ▶ Start playing
        </Link>
      </section>

      <section aria-label="Your game activity" className="home-stats">
        {loading ? (
          <p className="profile-empty">Loading your stats…</p>
        ) : (
          <div className="home-stats-grid">
            <HomeStat value={String(stats.gamesPlayed)} label="Games played" tone="visual_attention" />
            <HomeStat value={formatAccuracy(stats.accuracy)} label="Accuracy" tone="logical_reasoning" />
            <HomeStat value={String(stats.bestStreak)} label="Best streak" tone="cognitive_flexibility" />
            <HomeStat value={String(stats.totalPoints)} label="Total points" tone="processing_speed" />
          </div>
        )}
      </section>

      <section aria-label="Featured games" className="home-featured">
        <h2 className="home-section-title">Featured games</h2>
        <div className="home-featured-grid">
          {featured.map((game) => (
            <Link
              key={game.templateType}
              to={ROUTES.feed}
              className="home-game-tile"
              style={{
                ['--tile-accent' as string]: resolveCategoryTheme(game.category).accent,
                ['--tile-tint' as string]: resolveCategoryTheme(game.category).accentTint,
              }}
            >
              <span className="home-game-monogram" aria-hidden="true">
                {game.label
                  .split(' ')
                  .map((w) => w[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span className="home-game-title">{game.label}</span>
              <span className="home-game-meta">
                {categoryLabel(game.category)} · ~{game.estimatedSeconds}s
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomeStat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  /** Category id whose accent tints the card; cosmetic only. */
  tone: string;
}) {
  const accent = resolveCategoryTheme(tone).accent;
  return (
    <div className="home-stat" style={{ ['--stat-accent' as string]: accent }}>
      <span className="home-stat__value">{value}</span>
      <span className="home-stat__label">{label}</span>
    </div>
  );
}
