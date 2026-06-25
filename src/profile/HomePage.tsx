/**
 * Home / Discover landing page (accounts pivot).
 *
 * The DEFAULT surface a signed-in user lands on (mounted at `/`, behind
 * RequireAuth) — an Instagram/Facebook-style home, visually distinct from the
 * /you profile: a "Recent activity" stories rail, a bold gradient hero with the
 * "Start playing" CTA, a slim stats strip, and a grid of featured games. It
 * replaces dropping straight into a game card on login.
 *
 * Separation of concerns (CLAUDE.md §4): this is a PRESENTATIONAL surface only.
 * It never touches the feed/session controller — "Start playing", the activity
 * bubbles, and the featured tiles are plain client-side links to `/feed`; the
 * feed owns progression. Stats reuse the SAME pipeline the /you profile uses
 * ({@link fetchGamePlays} + {@link computeStats}); the activity rail reuses the
 * cross-readable social tables via {@link fetchRecentActivity} (no follow graph
 * yet — it shows recent COMMUNITY activity). Featured tiles come from the pure
 * {@link selectFeaturedGames}.
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
import { getCardById as defaultGetCardById } from '../cards/catalog';
import { selectFeaturedGames, templateLabel, type FeaturedGame } from '../cards/featured';
import type { LiquidCard } from '../cards/types';
import { fetchRecentActivity } from '../social/activityApi';
import { activityCaption, type ActivityItem } from '../social/activityFeed';
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
  /** Test seam: preset activity items (skips the network read when provided). */
  activityItems?: readonly ActivityItem[];
  /** Test seam: cardId → card resolver for activity game titles. */
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

export default function HomePage({
  client: clientProp,
  featuredGames,
  activityItems,
  getCardById = defaultGetCardById,
}: HomePageProps = {}) {
  const auth = useAuth();
  const { user, profile } = auth;
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<readonly ActivityItem[]>(activityItems ?? []);
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

  // Recent COMMUNITY activity for the stories rail (skipped when a test injects it).
  useEffect(() => {
    if (activityItems !== undefined) return;
    let active = true;
    void (async () => {
      const items = await fetchRecentActivity(client, {
        // Prototype: there's no follow graph yet and often a single account, so
        // INCLUDE the viewer's own recent activity (like IG showing "your story")
        // — otherwise the rail is empty until other users exist. Pass the viewer
        // id here to switch to "others only" once there's a real community.
        excludeUserId: null,
        resolveTitle: (cardId) => {
          const card = getCardById(cardId);
          return card ? templateLabel(card.templateType) : cardId;
        },
      });
      if (active) setActivity(items);
    })();
    return () => {
      active = false;
    };
  }, [client, user, activityItems, getCardById]);

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

      {activity.length > 0 && (
        <section aria-label="Recent activity" className="home-activity">
          <h2 className="home-section-title">Recent activity</h2>
          <div className="home-stories">
            {activity.map((item) => (
              <Link
                key={`${item.kind}:${item.id}`}
                to={ROUTES.feed}
                className="home-story"
                aria-label={`${activityCaption(item)} — open the feed`}
                title={activityCaption(item)}
              >
                <span className="home-story__ring" aria-hidden="true">
                  {item.avatarUrl ? (
                    <img className="home-story__avatar" src={item.avatarUrl} alt="" />
                  ) : (
                    <span className="home-story__avatar">{item.monogram}</span>
                  )}
                  <span
                    className="home-story__badge"
                    data-kind={item.kind}
                    aria-hidden="true"
                  >
                    {item.kind === 'like' ? '♥' : '💬'}
                  </span>
                </span>
                <span className="home-story__name">
                  {item.handle ? `@${item.handle}` : item.displayName ?? 'Someone'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="home-hero">
        <div className="home-hero__glow" aria-hidden="true" />
        <p className="home-hero__eyebrow">Today’s loop</p>
        <h1 className="home-greeting">
          Welcome back, {profile.display_name}
        </h1>
        <p className="home-subtitle">
          Pick up where you left off, or jump into something new.
        </p>
        <Link to={ROUTES.feed} className="home-start-btn">
          ▶ Start playing
        </Link>
        {!loading && (
          <div className="home-stat-strip" aria-label="Your game activity">
            <StatChip icon="🎮" value={String(stats.gamesPlayed)} label="Games played" />
            <StatChip icon="🎯" value={formatAccuracy(stats.accuracy)} label="Accuracy" />
            <StatChip icon="🔥" value={String(stats.bestStreak)} label="Best streak" />
            <StatChip icon="⭐" value={String(stats.totalPoints)} label="Total points" />
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
                ['--tile-deep' as string]: resolveCategoryTheme(game.category).accentDeep,
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
              <span className="home-game-play" aria-hidden="true">
                Play ▸
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** A compact inline stat chip (slim strip, distinct from the profile's card grid). */
function StatChip({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <span className="home-stat-chip">
      <span className="home-stat-chip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="home-stat-chip__value">{value}</span>
      <span className="home-stat-chip__label">{label}</span>
    </span>
  );
}
