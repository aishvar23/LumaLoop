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
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '../app/routes';
import Wordmark from '../ui/Wordmark';
import { useAuth } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/authClient';
import { fetchGamePlays } from '../auth/profileApi';
import { supabase } from '../auth/supabaseClient';
import type { GamePlay } from '../auth/types';
import { getCardById as defaultGetCardById } from '../cards/catalog';
import { selectFeaturedGames, templateLabel, type FeaturedGame } from '../cards/featured';
import type { LiquidCard } from '../cards/types';
import { readStreak as defaultReadStreak } from '../feed/streakStore';
import type { StreakState } from '../feed/dailyStreak';
import { fetchRecentShares } from '../social/gameShareApi';
import { fetchFollowing } from '../social/followApi';
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
  /** Test seam: read the persisted daily streak. Defaults to the local store. */
  readStreak?: () => StreakState;
}

/** Format a category id ("visual_attention") into a label ("Visual attention"). */
function categoryLabel(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Feed path that opens a SPECIFIC game first (featured-game deep link). */
function feedPathFor(cardId: string): string {
  return `${ROUTES.feed}?card=${encodeURIComponent(cardId)}`;
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
  readStreak = defaultReadStreak,
}: HomePageProps = {}) {
  const auth = useAuth();
  const { user, profile } = auth;
  const navigate = useNavigate();
  const client = clientProp ?? auth.client ?? supabase;
  const featured = featuredGames ?? selectFeaturedGames();

  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [loading, setLoading] = useState(true);
  // Daily streak (engagement — consecutive days played). Read once from the local
  // store; sync so it's ready on the first paint. Hidden until the player has a
  // live streak (current > 0) — no streak, no badge, and never any shame copy.
  const [streak] = useState<StreakState>(() => readStreak());
  const [statuses, setStatuses] = useState<readonly UserStatus[]>(statusesProp ?? []);
  // The open status story (null when the viewer is closed).
  const [openStatus, setOpenStatus] = useState<UserStatus | null>(null);
  // The "Upload puzzle" creator feature isn't built yet — clicking it reveals a
  // "coming soon" notice that auto-dismisses after 2s.
  const [uploadNotice, setUploadNotice] = useState(false);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showComingSoon() {
    setUploadNotice(true);
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => setUploadNotice(false), 2000);
  }
  useEffect(
    () => () => {
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
    },
    [],
  );

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
      // Following feed: if you follow anyone, show THEIR statuses + your own;
      // otherwise fall back to the whole community so the rail isn't empty.
      const following = user ? await fetchFollowing(client, user.id) : new Set<string>();
      if (!active) return;
      const rows =
        user && following.size > 0
          ? await fetchRecentShares(client, {
              userIds: [...following, user.id],
              limit: 60,
            })
          : await fetchRecentShares(client, { limit: 60 });
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
          <span className="home-logo" aria-hidden="true">
            <span className="home-logo__loop">✦</span>
          </span>
          <Wordmark className="home-wordmark" />
        </span>
        <div className="home-topbar__actions">
          {/* Find other users to follow. */}
          <Link
            to={ROUTES.people}
            className="home-search-link"
            aria-label="Find people"
          >
            <span aria-hidden="true">🔍</span>
          </Link>
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
        <div className="home-hero__blob home-hero__blob--a" aria-hidden="true" />
        <div className="home-hero__blob home-hero__blob--b" aria-hidden="true" />
        <h1 className="home-greeting">
          Hi {profile.display_name}! <span aria-hidden="true">🎮</span>
        </h1>
        <p className="home-subtitle">Ready for today’s puzzles?</p>
        {streak.current > 0 && (
          <div className="home-streak" data-testid="home-streak">
            <span className="home-streak__pill">
              <span aria-hidden="true">🔥</span>
              <span className="home-streak__count">
                {streak.current}-day streak
              </span>
            </span>
            {streak.longest > streak.current && (
              <span className="home-streak__best">Best {streak.longest}</span>
            )}
          </div>
        )}
        <div className="home-hero__cta">
          <Link to={ROUTES.feed} className="home-cta-btn">
            <span className="home-cta-icon home-cta-icon--play" aria-hidden="true">
              ▶
            </span>
            Play now
          </Link>
          <span className="home-cta-wrap">
            <button
              type="button"
              className="home-cta-btn"
              aria-label="Upload puzzle"
              onClick={showComingSoon}
            >
              <span className="home-cta-icon home-cta-icon--upload" aria-hidden="true">
                ＋
              </span>
              Upload puzzle
            </button>
            {uploadNotice && (
              <span className="home-upload-pop" role="status">
                Coming soon ✨
                <span className="home-upload-pop__tail" aria-hidden="true" />
              </span>
            )}
          </span>
        </div>
        {!loading && (
          <div className="home-stat-strip" aria-label="Your game activity">
            <StatChip icon="🎮" value={String(stats.gamesPlayed)} label="Games" tone="visual_attention" />
            <StatChip icon="🎯" value={formatAccuracy(stats.accuracy)} label="Accuracy" tone="logical_reasoning" />
            <StatChip icon="🔥" value={String(stats.bestStreak)} label="Streak" tone="cognitive_flexibility" />
            <StatChip icon="⭐" value={String(stats.totalPoints)} label="Points" tone="processing_speed" />
          </div>
        )}
      </section>

      <section aria-label="Featured games" className="home-featured">
        <h2 className="home-section-title">Featured games</h2>
        <div className="home-featured-grid">
          {featured.map((game) => (
            <Link
              key={game.templateType}
              to={feedPathFor(game.cardId)}
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
          onPlay={(item) => {
            setOpenStatus(null);
            navigate(feedPathFor(item.cardId));
          }}
        />
      )}
    </div>
  );
}

/** A compact, color-tinted stat chip (playful strip, distinct from the profile grid). */
function StatChip({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: string;
  label: string;
  /** Category id whose accent tints the chip; cosmetic only. */
  tone: string;
}) {
  const theme = resolveCategoryTheme(tone);
  return (
    <span
      className="home-stat-chip"
      style={{
        ['--chip-accent' as string]: theme.accent,
        ['--chip-tint' as string]: theme.accentTint,
      }}
    >
      <span className="home-stat-chip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="home-stat-chip__value">{value}</span>
      <span className="home-stat-chip__label">{label}</span>
    </span>
  );
}
