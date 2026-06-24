/**
 * Per-card social surface for the feed (likes + comments).
 *
 * A compact action rail (a like/heart button with its count, and a comment
 * button with its count) plus an expandable comments sheet (the comment list +
 * a length-capped input with a live counter). It is mounted INSIDE the active
 * feed slide but is a FEED-LAYER concern keyed by `cardId` — it never branches
 * on `templateType` and never touches the game renderer's logic (CLAUDE.md
 * §4/§6).
 *
 * Loading is ACTIVATION-GATED via {@link useGameSocial}: only the focused slide
 * (`active`) fetches, and the load never blocks gameplay — on failure it shows
 * the zero/empty baseline. When there is no social config (no provider, e.g. the
 * feed mounted standalone in tests) it renders nothing, so the engine stays
 * auth-free.
 *
 * Copy is guardrail-safe (Design §7): plain social "likes"/"comments", no
 * ability/IQ/trait/clinical framing. Author identity uses only the public
 * profile fields (handle/display name) — no extra PII.
 */
import { useState, type FormEvent } from 'react';

import { useSocialConfig } from './SocialContext';
import { useGameSocial } from './useGameSocial';
import { formatRelativeTime } from './relativeTime';
import { COMMENT_MAX_LENGTH, type GameComment } from './types';
import './CardSocialRail.css';

export interface CardSocialRailProps {
  /** The card this rail is attached to. */
  cardId: string;
  /** The feed activation signal — true only for the focused slide. */
  active: boolean;
}

export default function CardSocialRail({ cardId, active }: CardSocialRailProps) {
  const config = useSocialConfig();
  // No social config (no provider) → render nothing, keeping the engine auth-free.
  if (!config) return null;
  return <CardSocialRailInner cardId={cardId} active={active} config={config} />;
}

function CardSocialRailInner({
  cardId,
  active,
  config,
}: CardSocialRailProps & { config: NonNullable<ReturnType<typeof useSocialConfig>> }) {
  const { client, userId } = config;
  const social = useGameSocial({ client, cardId, userId, active });
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div className="card-social" data-testid="card-social">
      <div className="card-social__rail">
        <button
          type="button"
          className="card-social__btn"
          data-testid="card-social-like"
          aria-pressed={social.viewerLiked}
          aria-label={social.viewerLiked ? 'Unlike this game' : 'Like this game'}
          disabled={!userId}
          onClick={social.toggleLike}
        >
          <span
            className={`card-social__heart${social.viewerLiked ? ' card-social__heart--on' : ''}`}
            aria-hidden="true"
          >
            {social.viewerLiked ? '♥' : '♡'}
          </span>
          <span className="card-social__count" data-testid="card-social-like-count">
            {social.likeCount}
          </span>
        </button>

        <button
          type="button"
          className="card-social__btn"
          data-testid="card-social-comment-toggle"
          aria-expanded={commentsOpen}
          aria-label="Show comments"
          onClick={() => setCommentsOpen((open) => !open)}
        >
          <span className="card-social__bubble" aria-hidden="true">
            💬
          </span>
          <span className="card-social__count" data-testid="card-social-comment-count">
            {social.comments.length}
          </span>
        </button>
      </div>

      {commentsOpen && (
        <CommentsSheet
          comments={social.comments}
          canPost={userId !== null}
          loading={social.loading}
          onSubmit={social.submitComment}
          onDelete={social.removeComment}
        />
      )}
    </div>
  );
}

function CommentsSheet({
  comments,
  canPost,
  loading,
  onSubmit,
  onDelete,
}: {
  comments: GameComment[];
  canPost: boolean;
  loading: boolean;
  onSubmit: (body: string) => Promise<string | null>;
  onDelete: (commentId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = COMMENT_MAX_LENGTH - draft.length;
  const trimmedEmpty = draft.trim().length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || trimmedEmpty) return;
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(draft);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft(''); // success — clear the input.
  }

  return (
    <div className="card-social__sheet" data-testid="card-social-sheet">
      {canPost && (
        <form className="card-social__form" onSubmit={handleSubmit}>
          <label className="card-social__visually-hidden" htmlFor="card-social-input">
            Add a comment
          </label>
          <textarea
            id="card-social-input"
            className="card-social__input"
            data-testid="card-social-input"
            value={draft}
            // Hard cap at the DB limit so the field can never exceed 280.
            maxLength={COMMENT_MAX_LENGTH}
            rows={2}
            placeholder="Add a comment…"
            onChange={(e) => {
              setDraft(e.target.value.slice(0, COMMENT_MAX_LENGTH));
              if (error) setError(null);
            }}
          />
          <div className="card-social__form-foot">
            <span
              className={`card-social__counter${remaining <= 0 ? ' card-social__counter--max' : ''}`}
              data-testid="card-social-counter"
            >
              {remaining}
            </span>
            <button
              type="submit"
              className="card-social__post"
              data-testid="card-social-post"
              disabled={submitting || trimmedEmpty}
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
          {error && (
            <p className="card-social__error" role="alert" data-testid="card-social-error">
              {error}
            </p>
          )}
        </form>
      )}

      <ul className="card-social__list" data-testid="card-social-list">
        {loading && comments.length === 0 && (
          <li className="card-social__empty">Loading comments…</li>
        )}
        {!loading && comments.length === 0 && (
          <li className="card-social__empty">No comments yet. Be the first.</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="card-social__comment">
            <div className="card-social__comment-head">
              <span className="card-social__author">
                {c.authorDisplayName ??
                  (c.authorHandle ? `@${c.authorHandle}` : 'Someone')}
              </span>
              <span className="card-social__time">{formatRelativeTime(c.createdAt)}</span>
              {c.isOwn && (
                <button
                  type="button"
                  className="card-social__delete"
                  data-testid={`card-social-delete-${c.id}`}
                  aria-label="Delete your comment"
                  onClick={() => onDelete(c.id)}
                >
                  Delete
                </button>
              )}
            </div>
            <p className="card-social__body">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
