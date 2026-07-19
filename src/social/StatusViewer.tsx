/**
 * Status story viewer (accounts pivot) — a WhatsApp/IG-style full-screen overlay
 * that plays through ONE user's recent shares (a {@link UserStatus}).
 *
 * Each share is shown as the ACTUAL game screen, rendered faded + non-interactive
 * in the background (so it reads as a preview of the real game), with the full
 * game name, the outcome status + points in front, and a "Play this game" CTA at
 * the bottom. Segmented progress bars on top; the active one animates over
 * `autoAdvanceMs` then advances, closing past the last share. Tapping the right
 * half advances, the left half goes back; Escape closes.
 *
 * Presentational only (CLAUDE.md §4): navigation is the caller's job via `onPlay`
 * / `onClose`. The faded preview mounts a BASE renderer with a non-finite timer
 * and `isActive={false}` so it never counts down, never resolves, and never takes
 * input — it is decorative (`inert` + pointer-events none). Pass `autoAdvanceMs={0}`
 * to disable auto-advance (reduced motion / tests).
 */
import { createElement, useEffect, useState, type CSSProperties } from 'react';

import { getCardById as defaultGetCardById } from '../cards/catalog';
import type { LiquidCard } from '../cards/types';
import {
  defaultRendererRegistry,
  resolveRenderer,
  type RendererRegistry,
  type TemplateRenderer,
} from '../session/rendererRegistry';
import type { CardStartContext } from '../templates/contract';
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
  /** Test seam: cardId → card for the faded preview. Defaults to the catalog. */
  getCardById?: (cardId: string) => LiquidCard | undefined;
  /** Test seam: renderer registry for the faded preview. Defaults to the app's. */
  registry?: RendererRegistry;
}

/** Outcome → status glyph + word (the word carries the meaning, not colour). */
const OUTCOME_BADGE: Record<ShareOutcome, { glyph: string; text: string }> = {
  correct: { glyph: '✓', text: 'Solved' },
  timeout: { glyph: '⏱', text: 'Timed out' },
  incorrect: { glyph: '•', text: 'Played' },
};

/** Disarm the card's countdown so the faded preview never ticks (mirrors the feed). */
function previewCard(card: LiquidCard): LiquidCard {
  return {
    ...card,
    config: { ...card.config, timeLimitMs: Number.POSITIVE_INFINITY },
  } as LiquidCard;
}

export default function StatusViewer({
  status,
  onClose,
  onPlay,
  autoAdvanceMs = 4000,
  categoryForCard,
  getCardById = defaultGetCardById,
  registry = defaultRendererRegistry,
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

  // Auto-advance: re-armed whenever the active share changes. Disabled when 0.
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
  const category = categoryForCard?.(item.cardId);
  const theme = resolveCategoryTheme(category);
  const who = status.handle ? `@${status.handle}` : status.displayName ?? 'Someone';
  const badge = OUTCOME_BADGE[item.outcome];
  const backdrop: CSSProperties = {
    background: `linear-gradient(160deg, ${theme.accent} 0%, ${theme.accentDeep} 55%, #0b0b0f 100%)`,
  };

  // The faded game-screen preview (the real renderer, disarmed + non-interactive).
  const card = getCardById(item.cardId);
  const Renderer = card ? resolveRenderer(registry, card) : undefined;

  return (
    <div
      className="status-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${who}'s status`}
      data-testid="status-viewer"
      style={backdrop}
    >
      {/* Faded preview of the actual game screen, behind everything. */}
      {card && Renderer ? (
        <div
          className="status-viewer__preview"
          data-testid="status-preview"
          aria-hidden="true"
          ref={(node) => {
            // `inert` removes it from focus/AT/interaction (decorative only).
            if (node) (node as HTMLElement & { inert: boolean }).inert = true;
          }}
          style={
            {
              '--accent': theme.accent,
              '--accent-deep': theme.accentDeep,
              '--accent-tint': theme.accentTint,
            } as CSSProperties
          }
        >
          {createElement(Renderer as TemplateRenderer<LiquidCard>, {
            card: previewCard(card),
            context: PREVIEW_CONTEXT,
            isActive: false,
            onAttempt: noop,
            onResolve: noop,
          })}
        </div>
      ) : null}
      <span className="status-viewer__scrim" aria-hidden="true" />

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

      {/* Front: the full game name + status + score. */}
      <div className="status-viewer__center">
        <span className="status-viewer__kicker">Shared a game</span>
        <span className="status-viewer__game">{item.gameTitle}</span>
        <span className="status-viewer__badge">
          {badge.glyph} {badge.text}
        </span>
        {item.points > 0 ? (
          <span className="status-viewer__points">
            +{item.points} <span className="status-viewer__points-unit">pts</span>
          </span>
        ) : null}
        {/* Accessible result summary (carries outcome + points text). */}
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

/** No-op handlers + a static context for the decorative preview renderer. */
function noop(): void {}
const PREVIEW_CONTEXT: CardStartContext = {
  sessionId: 'status-preview',
  cardIndex: 0,
  activeAtMs: 0,
  interactionEnabledAtMs: 0,
};
