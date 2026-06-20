/**
 * SessionReceipt — end-of-session receipt UI (Design §8.4, Technical Design §9;
 * Azure DevOps #71).
 *
 * PRESENTATIONAL & PURE: this component takes an already-computed
 * {@link SessionSummary} (from the pure `computeSessionSummary`, #62) as its
 * only prop. It NEVER recomputes stats, reads the clock, or touches the
 * controller/reducer — it only renders. Keeping it pure makes it trivially
 * testable and lets the #72 exit path reuse it with a summary built from an
 * `exited` session.
 *
 * POSITIONING (Design §7 / §8.4, CLAUDE.md §7): the receipt is "a record of
 * challenge performance," NOT a claim about intelligence or ability. Copy
 * celebrates effort + completion and reports factual session/category stats
 * only. No trait / ability / IQ / brain-training / clinical / employment
 * framing; categories are framed as "performance categories" the session
 * *included*, never as scores a person *has*. This is the highest-risk surface
 * for guardrail violations, so the copy here is deliberately conservative.
 */
import type { ReactNode } from 'react';

import type { ChallengeCategory } from '../cards/types';
import { MODE_LABELS } from '../session/sessionTypes';
import type { SessionSummary } from '../session/sessionSummary';
import Button from './Button';
import Cluster from './Cluster';
import Screen from './Screen';
import Stack from './Stack';

/**
 * Human-readable, modest performance-category labels (Design §7). These mirror
 * the neutral "performance category" framing in the catalog — never trait, IQ,
 * or clinical wording. Typed over the full {@link ChallengeCategory} union so a
 * new category forces a label here at compile time.
 */
const CATEGORY_LABELS: Readonly<Record<ChallengeCategory, string>> = {
  visual_attention: 'Visual attention',
  working_memory: 'Working memory',
  logical_reasoning: 'Logical reasoning',
  cognitive_flexibility: 'Cognitive flexibility',
  pattern_recognition: 'Pattern recognition',
  processing_speed: 'Processing speed',
};

/** Format a 0..1 accuracy as a whole-number percentage (e.g. 0.857 → "86%"). */
function formatAccuracy(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}

/**
 * Format a millisecond duration as human-readable time. Sub-minute durations
 * read as seconds with one decimal ("4.2s", matching the §9 receipt example);
 * a minute or more reads as "Xm Ys" so a full-session total stays legible.
 */
function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  // Round to whole seconds FIRST, then divmod, so a boundary value can never
  // render "1m 60s" (e.g. 119_500ms → 120s → "2m 0s", not "1m 60s").
  const wholeSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds - minutes * 60;
  return `${minutes}m ${seconds}s`;
}

/** A label/value stat line, stacked for large readable text (not colour-only). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <span
        style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
        {value}
      </span>
    </Stack>
  );
}

export type SessionReceiptProps = {
  /** The pre-computed session summary to render (Technical Design §9). */
  summary: SessionSummary;
  /**
   * Whether the session reached its bounded end (`completed`) or the user left
   * early (`exited`, Design §8.3). Drives ONLY the framing copy — the stats and
   * the on-time exit badge come entirely from `summary` (a `completedOnTime`
   * session earns the badge; an early leave does not). Defaults to `completed`
   * so existing call sites and tests are unaffected. The early-exit copy is
   * modest, not punitive (Design §8.3 — celebrate completion, never pressure).
   */
  outcome?: 'completed' | 'exited';
  /**
   * Optional controls rendered below the receipt body — the #72 seam for the
   * intentional "Keep going" continue control on a completed session. Kept a
   * slot so the receipt stays presentational and template-agnostic.
   */
  footer?: ReactNode;
  /**
   * Optional share handler — when provided, a minimal "Share" control renders so
   * the user can share their session from the receipt (the #76 `Receipt_Shared`
   * seam). Kept a callback so the receipt stays presentational: the actual share
   * action + telemetry live in the caller. Copy stays within the positioning
   * guardrails (Design §7) — a record of a session, never an ability claim.
   */
  onShare?: () => void;
};

export default function SessionReceipt({
  summary,
  outcome = 'completed',
  footer,
  onShare,
}: SessionReceiptProps) {
  const {
    mode,
    completedCards,
    correctCards,
    accuracy,
    fastestCorrectCard,
    categoryBreakdown,
    earnedExitBadge,
  } = summary;

  const exited = outcome === 'exited';

  return (
    <Screen aria-labelledby="session-complete-heading">
      <Stack gap={5} justify="center" style={{ flex: 1 }}>
        {/* Celebration — modest: effort + completion, never ability praise. The
            early-exit framing is neutral (no "complete" claim, not punitive). */}
        <Stack gap={1} as="header">
          <h1
            id="session-complete-heading"
            data-testid="session-complete-seam"
            style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}
          >
            {exited ? 'Session ended' : 'Session complete'}
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {exited
              ? `You stepped away from your ${MODE_LABELS[mode]} loop. Here's your progress so far.`
              : `Nice work finishing your ${MODE_LABELS[mode]} loop.`}
          </p>
        </Stack>

        {/* Exit badge — celebrates leaving on time (Design §8.3/§8.4). Conveyed
            by text + emoji, never colour alone. */}
        {earnedExitBadge && (
          <p
            data-testid="exit-badge"
            style={{
              margin: 0,
              alignSelf: 'flex-start',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
            }}
          >
            ✓ Left on time
          </p>
        )}

        {/* Factual session stats (Design §8.4 / Tech §9). */}
        <Stack gap={3} as="section" aria-labelledby="receipt-stats-heading">
          <h2
            id="receipt-stats-heading"
            style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}
          >
            This session
          </h2>
          <Cluster gap={5} align="start">
            <Stat label="Cards completed" value={String(completedCards)} />
            <Stat label="Accuracy" value={formatAccuracy(accuracy)} />
            <Stat
              label="Correct"
              value={`${correctCards} of ${completedCards}`}
            />
          </Cluster>
          {fastestCorrectCard && (
            <Stat
              label="Fastest correct card"
              value={formatElapsed(fastestCorrectCard.elapsedMs)}
            />
          )}
        </Stack>

        {/* Category mix — "this session INCLUDED these performance categories",
            never a per-category trait/ability score (Design §7 / §9). Omitted
            entirely when no card mapped to a category. */}
        {categoryBreakdown.length > 0 && (
          <Stack gap={2} as="section" aria-labelledby="receipt-categories-heading">
            <h2
              id="receipt-categories-heading"
              style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}
            >
              This session included
            </h2>
            <Stack gap={2} as="ul" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {categoryBreakdown.map((row) => (
                <Stack
                  key={row.category}
                  as="li"
                  gap={0}
                  data-testid={`category-row-${row.category}`}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                  }}
                >
                  <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
                    {CATEGORY_LABELS[row.category]}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {row.correct} of {row.attempted} correct · median{' '}
                    {formatElapsed(row.medianElapsedMs)}
                  </span>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Minimal share affordance (#76). Modest copy — sharing a session, not
            an ability/score (Design §7). Rendered above the footer so it never
            overshadows the primary continue control. */}
        {onShare && (
          <Button
            variant="ghost"
            data-testid="share-control"
            style={{ width: '100%' }}
            onClick={onShare}
          >
            Share
          </Button>
        )}

        {/* Optional controls (e.g. the #72 intentional continue). Rendered as a
            modest footer so continuing never overshadows finishing (Design
            §8.3 — the receipt rewards completion, it does not pressure more). */}
        {footer && <div>{footer}</div>}
      </Stack>
    </Screen>
  );
}
