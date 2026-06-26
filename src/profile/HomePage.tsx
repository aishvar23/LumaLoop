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
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '../app/routes';
import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { fetchGamePlays } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import type { GamePlay } from '../auth/types';
import { getCardById as defaultGetCardById } from '../cards/catalog';
import { selectFeaturedGames, templateLabel, type FeaturedGame } from '../cards/featured';
import type { LiquidCard } from '../cards/types';
import { fetchRecentShares } from '../social/gameShareApi';
import { groupSharesByUser, type UserStatus } from '../social/statusFeed';
import StatusViewer from '../social/StatusViewer';
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
  /** Test seam: preset status rail (skips the network read when provided). */
  statuses?: readonly UserStatus[];
  /** Test seam: cardId → card resolver for status game titles + accents. */
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
  statuses: statusesProp,
  getCardById = defaultGetCardById,
}: HomePageProps = {}) {
  const auth = useAuth();
  const { user, profile } = auth;
  const navigate = useNavigate();
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<readonly UserStatus[]>(statusesProp ?? []);
  // The open status story (null when the viewer is closed).
  const [openStatus, setOpenStatus] = useState<UserStatus | null>(null);
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

  // Recent ephemeral SHARES (statuses), grouped per user for the rail (skipped
  // when a test injects them). RLS bounds the read to the last 24h.
  useEffect(() => {
    if (statusesProp !== undefined) return;
    let active = true;
    void (async () => {
      const rows = await fetchRecentShares(client, { limit: 60 });
      if (!active) return;
      setStatuses(
        groupSharesByUser(rows, {
          viewerId: user?.id ?? null,
          resolveTitle: (cardId) => {
            const card = getCardById(cardId);
            return card ? templateLabel(card.templateType) : cardId;
          },
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [client, user, statusesProp, getCardById]);

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

      {statuses.length > 0 && (
        <section aria-label="Recent activity" className="home-activity">
          <h2 className="home-section-title">Recent activity</h2>
          <div className="home-stories">
            {statuses.map((status) => {
              const who = status.handle
                ? `@${status.handle}`
                : status.displayName ?? 'Someone';
              const count = status.items.length;
              return (
                <button
                  key={status.userId}
                  type="button"
                  className="home-story"
                  data-testid={`home-status-${status.userId}`}
                  aria-label={`${status.isOwn ? 'Your' : `${who}’s`} status — ${count} shared ${count === 1 ? 'game' : 'games'}`}
                  onClick={() => setOpenStatus(status)}
                >
                  <span
                    className="home-story__ring"
                    data-multi={count > 1 ? 'true' : 'false'}
                    aria-hidden="true"
                  >
                    {status.avatarUrl ? (
                      <img className="home-story__avatar" src={status.avatarUrl} alt="" />
                    ) : (
                      <span className="home-story__avatar">{status.monogram}</span>
                    )}
                    {count > 1 && (
                      <span className="home-story__badge" aria-hidden="true">
                        {count}
                      </span>
                    )}
                  </span>
                  <span className="home-story__name">
                    {status.isOwn ? 'Your status' : who}
                  </span>
                </button>
              );
            })}
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

      {openStatus && (
        <StatusViewer
          status={openStatus}
          categoryForCard={(cardId) => getCardById(cardId)?.category}
          onClose={() => setOpenStatus(null)}
          onPlay={() => {
            setOpenStatus(null);
            navigate(ROUTES.feed);
          }}
        />
      )}
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
