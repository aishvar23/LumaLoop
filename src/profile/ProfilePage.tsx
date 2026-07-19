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
import { resolveCategoryTheme } from '../ui/categoryTheme';
import {
  computeStats,
  EMPTY_PROFILE_STATS,
  formatAccuracy,
  type ProfileStats,
} from './computeStats';
import { fetchGameScores } from './gameScoresApi';
import {
  buildCategoryBars,
  buildPointsDistribution,
  type CategoryBar,
  type DistributionSegment,
} from './profileCharts';
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

/** How many "Your games" rows to reveal per page (the list is paged, not loaded
 * all at once). "Show more" reveals the next page. */
const YOUR_GAMES_PAGE_SIZE = 6;

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
  // How many "Your games" rows are currently revealed (paged via "Show more").
  const [visibleGames, setVisibleGames] = useState(YOUR_GAMES_PAGE_SIZE);
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
      setVisibleGames(YOUR_GAMES_PAGE_SIZE); // reset paging on a fresh load.
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
            <Stat icon="🎮" value={String(stats.gamesPlayed)} label="Games played" tone="visual_attention" />
            <Stat icon="🎯" value={formatAccuracy(stats.accuracy)} label="Accuracy" tone="logical_reasoning" />
            <Stat icon="🔥" value={String(stats.bestStreak)} label="Best streak" tone="cognitive_flexibility" />
            <Stat icon="⭐" value={String(stats.totalPoints)} label="Total points" tone="processing_speed" />
          </div>
        )}
      </section>

      {!loading && (
        <section aria-label="Accuracy by performance category">
          <h2 className="profile-section-title">Accuracy by performance category</h2>
          {stats.categories.length > 0 ? (
            <div className="profile-chart" role="list">
              {buildCategoryBars(stats.categories, 'accuracy').map((bar) => (
                <CategoryBarRow key={bar.category} bar={bar} />
              ))}
            </div>
          ) : (
            <p className="profile-empty">
              Play a few games and your category accuracy will chart here.
            </p>
          )}
        </section>
      )}

      {!loading && stats.categories.length > 0 && stats.totalPoints > 0 && (
        <section aria-label="Points share by category">
          <h2 className="profile-section-title">Where your points come from</h2>
          <PointsDistribution
            segments={buildPointsDistribution(stats.categories)}
          />
        </section>
      )}

      {!loading && games.length > 0 && (
        <section aria-label="Your games">
          <h2 className="profile-section-title">Your games</h2>
          {/* Paged: render only the revealed page, not the whole list at once. */}
          {games.slice(0, visibleGames).map((g) => (
            <div key={g.cardId} className="profile-game-row">
              <span
                className="profile-game-accent"
                aria-hidden="true"
                style={{ background: resolveCategoryTheme(g.category).accent }}
              />
              <span className="profile-game-main">
                <span className="profile-game-title">{g.title}</span>
                <span
                  className="profile-game-category"
                  style={{ color: resolveCategoryTheme(g.category).accent }}
                >
                  {g.categoryLabel}
                </span>
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
          {visibleGames < games.length && (
            <button
              type="button"
              className="profile-show-more"
              data-testid="your-games-show-more"
              onClick={() =>
                setVisibleGames((n) =>
                  Math.min(n + YOUR_GAMES_PAGE_SIZE, games.length),
                )
              }
            >
              Show more ({games.length - visibleGames} more)
            </button>
          )}
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

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: string;
  label: string;
  /** Category id whose accent tints the card; cosmetic only. */
  tone: string;
}) {
  const accent = resolveCategoryTheme(tone).accent;
  return (
    <div
      className="profile-stat"
      style={{ ['--stat-accent' as string]: accent }}
    >
      <span className="profile-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="profile-stat__value">{value}</span>
      <span className="profile-stat__label">{label}</span>
    </div>
  );
}

/** One labelled, accent-tinted horizontal accuracy bar (color is not the only cue). */
function CategoryBarRow({ bar }: { bar: CategoryBar }) {
  const accent = resolveCategoryTheme(bar.category).accent;
  return (
    <div
      className="profile-bar"
      role="listitem"
      aria-label={`${categoryLabel(bar.category)}: ${bar.valueLabel}`}
    >
      <div className="profile-bar__head">
        <span className="profile-bar__name">{categoryLabel(bar.category)}</span>
        <span className="profile-bar__value">{bar.valueLabel}</span>
      </div>
      <div className="profile-bar__track">
        <div
          className="profile-bar__fill"
          style={{
            width: `${Math.round(bar.fill * 100)}%`,
            background: accent,
          }}
        />
      </div>
    </div>
  );
}

/** A single segmented bar of each category's share of total points, plus a legend. */
function PointsDistribution({
  segments,
}: {
  segments: DistributionSegment[];
}) {
  return (
    <>
      <div className="profile-distribution" role="img" aria-label="Points share by category">
        {segments
          .filter((s) => s.share > 0)
          .map((s) => (
            <span
              key={s.category}
              className="profile-distribution__seg"
              style={{
                width: `${s.share * 100}%`,
                background: resolveCategoryTheme(s.category).accent,
              }}
              title={`${categoryLabel(s.category)} ${s.sharePercent}`}
            />
          ))}
      </div>
      <ul className="profile-legend">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <li key={s.category} className="profile-legend__item">
              <span
                className="profile-legend__dot"
                aria-hidden="true"
                style={{ background: resolveCategoryTheme(s.category).accent }}
              />
              <span className="profile-legend__label">
                {categoryLabel(s.category)}
              </span>
              <span className="profile-legend__value">{s.sharePercent}</span>
            </li>
          ))}
      </ul>
    </>
  );
}
