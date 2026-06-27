/**
 * Status story viewer (accounts pivot) — a WhatsApp/IG-style full-screen overlay
 * that plays through ONE user's recent shares (a {@link UserStatus}), with an
 * immersive, category-tinted gradient background.
 *
 * Segmented progress bars on top (one per share); the active segment animates over
 * `autoAdvanceMs` and then advances, closing past the last one. Tapping the right
 * half advances, the left half goes back; explicit prev/next buttons keep it
 * keyboard/AT accessible, and Escape closes. Each share shows the game emblem, the
 * outcome + points, and a "Play" CTA back into the feed.
 *
 * Presentational only (CLAUDE.md §4): navigation is the caller's job via `onPlay`
 * / `onClose`. Pass `autoAdvanceMs={0}` to disable auto-advance (reduced motion /
 * tests).
 */
import { useEffect, useState, type CSSProperties } from 'react';

import { resolveCategoryTheme } from '../ui/categoryTheme';
import { formatRelativeTime } from './relativeTime';
import { type ShareItem, type ShareOutcome, type UserStatus } from './statusFeed';
import './StatusViewer.css';

export interface StatusViewerProps {
  /** The user whose shares are being viewed. */
  status: UserStatus;
  /** Close the viewer. */
  onClose: () => void;
  /** Enter the feed to play a shared game. */
  onPlay: (item: ShareItem) => void;
  /** ms each share is shown before auto-advancing; 0 disables it. Default 4000. */
  autoAdvanceMs?: number;
  /** Optional cardId → category for accent tinting (defaults to neutral). */
  categoryForCard?: (cardId: string) => string | undefined;
}

/** Outcome → badge glyph + word (the word carries the meaning, not colour). */
const OUTCOME_BADGE: Record<ShareOutcome, { glyph: string; text: string }> = {
  correct: { glyph: '✓', text: 'Solved' },
  timeout: { glyph: '⏱', text: 'Timed out' },
  incorrect: { glyph: '•', text: 'Played' },
};

/** Two-letter emblem monogram for a game title ("Spot it" → "SI"). */
function emblemMonogram(title: string): string {
  return title
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function StatusViewer({
  status,
  onClose,
  onPlay,
  autoAdvanceMs = 4000,
  categoryForCard,
}: StatusViewerProps) {
  const [index, setIndex] = useState(0);
  const items = status.items;
  const item = items[index];

  function next() {
    setIndex((i) => {
      if (i >= items.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // Auto-advance: re-armed whenever the active share changes. Disabled when
  // autoAdvanceMs is 0 (reduced motion / tests).
  useEffect(() => {
    if (autoAdvanceMs <= 0) return undefined;
    const id = setTimeout(next, autoAdvanceMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, autoAdvanceMs, items.length]);

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;
  const theme = resolveCategoryTheme(categoryForCard?.(item.cardId));
  const who = status.handle ? `@${status.handle}` : status.displayName ?? 'Someone';
  const badge = OUTCOME_BADGE[item.outcome];
  const backdrop: CSSProperties = {
    background: `linear-gradient(160deg, ${theme.accent} 0%, ${theme.accentDeep} 55%, #0b0b0f 100%)`,
  };

  return (
    <div
      className="status-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${who}'s status`}
      data-testid="status-viewer"
      style={backdrop}
    >
      <span className="status-viewer__blob status-viewer__blob--a" aria-hidden="true" />
      <span className="status-viewer__blob status-viewer__blob--b" aria-hidden="true" />

      {/* Tap zones: left = previous, right = next. Behind the content/buttons. */}
      <button
        type="button"
        className="status-viewer__zone status-viewer__zone--prev"
        aria-label="Previous"
        data-testid="status-prev"
        onClick={prev}
      />
      <button
        type="button"
        className="status-viewer__zone status-viewer__zone--next"
        aria-label="Next"
        data-testid="status-next"
        onClick={next}
      />

      <div className="status-viewer__top">
        <div className="status-viewer__segments" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.id} className="status-viewer__segment">
              <span
                className="status-viewer__segment-fill"
                data-fill={i < index ? 'full' : i === index ? 'active' : 'empty'}
                style={
                  i === index && autoAdvanceMs > 0
                    ? { animationDuration: `${autoAdvanceMs}ms` }
                    : undefined
                }
              />
            </span>
          ))}
        </div>
        <div className="status-viewer__head">
          <span className="status-viewer__avatar">
            {status.avatarUrl ? (
              <img src={status.avatarUrl} alt="" />
            ) : (
              status.monogram
            )}
          </span>
          <span className="status-viewer__id">
            <span className="status-viewer__who">{who}</span>
            <span className="status-viewer__time">
              {formatRelativeTime(item.createdAt)}
            </span>
          </span>
          <button
            type="button"
            className="status-viewer__close"
            aria-label="Close"
            data-testid="status-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Centerpiece: the shared game. */}
      <div className="status-viewer__center">
        <span className="status-viewer__emblem" aria-hidden="true">
          {emblemMonogram(item.gameTitle)}
        </span>
        <span className="status-viewer__badge">
          {badge.glyph} {badge.text}
        </span>
        <span className="status-viewer__game">{item.gameTitle}</span>
        {item.points > 0 ? (
          <span className="status-viewer__points">
            +{item.points} <span className="status-viewer__points-unit">pts</span>
          </span>
        ) : null}
        {/* Plain-text result line (carries the machine-readable outcome + points). */}
        <span className="status-viewer__result">
          {item.outcomeLabel}
          {item.points > 0 ? ` · +${item.points} pts` : ''}
        </span>
      </div>

      <div className="status-viewer__bottom">
        <button
          type="button"
          className="status-viewer__play"
          data-testid="status-play"
          onClick={() => onPlay(item)}
        >
          ▶ Play this game
        </button>
        <span className="status-viewer__hint">Tap the sides to browse</span>
      </div>
    </div>
  );
}
