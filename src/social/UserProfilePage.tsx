/**
 * Another user's public profile (accounts pivot, Phase 2/3), mounted at
 * `/u/:userId`.
 *
 * Shows their avatar / handle / display name / bio, follower+following counts, a
 * {@link FollowButton}, their PUBLIC game-stats aggregate (games played / accuracy
 * / points — from `user_public_stats`, not their private raw plays), and their
 * live (24h) statuses (tap opens the shared {@link StatusViewer}). Provides the
 * {@link SocialConfigProvider} so the follow button gets the client + viewer id.
 *
 * POSITIONING GUARDRAIL (Design §7): GAME activity only — never ability/IQ/trait.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../auth/supabaseClient';
import { getCardById as defaultGetCardById } from '../cards/catalog';
import { templateLabel } from '../cards/featured';
import { formatAccuracy } from '../profile/computeStats';
import { resolveCategoryTheme } from '../ui/categoryTheme';
import FollowButton from './FollowButton';
import { fetchFollowCounts, type FollowCounts } from './followApi';
import { fetchRecentShares } from './gameShareApi';
import { SocialConfigProvider } from './SocialContext';
import StatusViewer from './StatusViewer';
import { groupSharesByUser, type UserStatus } from './statusFeed';
import {
  fetchProfileById,
  fetchPublicStats,
  publicAccuracy,
  type ProfileLite,
  type PublicStats,
} from './userDiscoveryApi';
import './UserProfilePage.css';

const EMPTY_COUNTS: FollowCounts = { followers: 0, following: 0 };
const EMPTY_STATS: PublicStats = { gamesPlayed: 0, correctCount: 0, totalPoints: 0 };

export default function UserProfilePage() {
  const { userId } = useParams<'userId'>();
  const auth = useAuth();
  const client = auth.client ?? supabase;
  const viewerId = auth.user?.id ?? null;

  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [counts, setCounts] = useState<FollowCounts>(EMPTY_COUNTS);
  const [stats, setStats] = useState<PublicStats>(EMPTY_STATS);
  const [statuses, setStatuses] = useState<readonly UserStatus[]>([]);
  const [openStatus, setOpenStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      const [p, c, s, rows] = await Promise.all([
        fetchProfileById(client, userId),
        fetchFollowCounts(client, userId),
        fetchPublicStats(client, userId),
        fetchRecentShares(client, { userIds: [userId] }),
      ]);
      if (!active) return;
      setProfile(p);
      setCounts(c);
      setStats(s);
      setStatuses(
        // On another user's profile every status is theirs (never the viewer's),
        // so own-first ordering is irrelevant — pass null and keep this load off
        // the viewer id so it runs once (not again when the session resolves).
        groupSharesByUser(rows, {
          viewerId: null,
          resolveTitle: (cardId) => {
            const card = defaultGetCardById(cardId);
            return card ? templateLabel(card.templateType) : cardId;
          },
        }),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, userId]);

  if (loading) {
    return (
      <div className="user-profile">
        <p className="user-profile__empty">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="user-profile">
        <Link to="/people" className="user-profile__back">
          ‹ Find people
        </Link>
        <p className="user-profile__empty">User not found.</p>
      </div>
    );
  }

  const status = statuses[0];

  return (
    <SocialConfigProvider value={{ client, userId: viewerId }}>
      <div className="user-profile">
        <Link to="/people" className="user-profile__back" aria-label="Back to search">
          ‹ Find people
        </Link>

        <header className="user-profile__header">
          {profile.avatarUrl ? (
            <img className="user-profile__avatar" src={profile.avatarUrl} alt="" />
          ) : (
            <span className="user-profile__avatar" aria-hidden="true">
              {(profile.displayName[0] ?? '?').toUpperCase()}
            </span>
          )}
          <div className="user-profile__id">
            <h1 className="user-profile__name">{profile.displayName}</h1>
            <p className="user-profile__handle">@{profile.handle}</p>
          </div>
          <FollowButton targetUserId={profile.id} />
        </header>

        {profile.bio ? <p className="user-profile__bio">{profile.bio}</p> : null}

        <div className="user-profile__counts">
          <span>
            <strong data-testid="followers-count">{counts.followers}</strong> followers
          </span>
          <span>
            <strong data-testid="following-count">{counts.following}</strong> following
          </span>
        </div>

        <div className="user-profile__stats" aria-label="Game activity">
          <Stat value={String(stats.gamesPlayed)} label="Games" tone="visual_attention" />
          <Stat value={formatAccuracy(publicAccuracy(stats))} label="Accuracy" tone="logical_reasoning" />
          <Stat value={String(stats.totalPoints)} label="Points" tone="processing_speed" />
        </div>

        {status ? (
          <section className="user-profile__statuses" aria-label="Active statuses">
            <h2 className="user-profile__section">Active statuses</h2>
            <button
              type="button"
              className="user-profile__status"
              data-testid="user-status-bubble"
              onClick={() => setOpenStatus(status)}
            >
              <span className="user-profile__status-ring" aria-hidden="true">
                {(profile.displayName[0] ?? '?').toUpperCase()}
                {status.items.length > 1 && (
                  <span className="user-profile__status-badge">{status.items.length}</span>
                )}
              </span>
              <span className="user-profile__status-label">
                {status.items.length === 1 ? '1 game' : `${status.items.length} games`}
              </span>
            </button>
          </section>
        ) : null}

        {openStatus && (
          <StatusViewer
            status={openStatus}
            categoryForCard={(cardId) => defaultGetCardById(cardId)?.category}
            onClose={() => setOpenStatus(null)}
            onPlay={() => setOpenStatus(null)}
          />
        )}
      </div>
    </SocialConfigProvider>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  const accent = resolveCategoryTheme(tone).accent;
  return (
    <div className="user-profile__stat" style={{ ['--stat-accent' as string]: accent }}>
      <span className="user-profile__stat-value">{value}</span>
      <span className="user-profile__stat-label">{label}</span>
    </div>
  );
}
