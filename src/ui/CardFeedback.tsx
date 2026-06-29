/**
 * CardFeedback — the uniform, in-feed FEEDBACK + EXPLANATION state shown after a
 * card resolves (Design §8.2 "Immediate success/failure feedback" + "Optional
 * explanation after resolution"; Technical Design §14 "Card feedback state" /
 * "Explanation state").
 *
 * This is the ADDITIONAL uniform step that every template shares, regardless of
 * whether its renderer surfaces its own in-play feedback (CLAUDE.md §4/§6). It
 * is purely presentational: it reports correct / incorrect / timeout, shows the
 * card's authored `explanation`, and exposes a single "Next" affordance. It owns
 * NO progression — advancing the feed is the caller's job via `onContinue`
 * (renderers/feedback never advance the feed directly; Technical Design §4).
 *
 * Non-modal by design (Technical Design §14 "No nested modal game experiences"):
 * this renders in-flow as a `<section>`, never as an overlay/dialog.
 *
 * The outcome is announced via a dedicated polite live region whose text is set
 * AFTER mount (empty on first paint, then the outcome in an effect): a live
 * region reliably announces a MUTATION, not content already present on a freshly
 * inserted node, so populating it post-mount is what guarantees assistive tech
 * hears the outcome. The visible heading/detail are plain (non-live) text so the
 * outcome is announced exactly once; the explanation is plain headed copy too.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { performanceTags, type CardScore } from '../feed/scoring';
import type { CardResolution, ResolutionType } from '../templates/contract';
import Button from './Button';
import Stack from './Stack';

export type CardFeedbackProps = {
  /** The resolution captured from the card's renderer. */
  resolution: CardResolution;
  /** The card's authored explanation copy (title + body). */
  explanation: { title: string; body: string };
  /**
   * The GAME-POINTS this card earned (Phase 4). When present, a points + streak/
   * combo chip is shown in the reserved slot. Omitted ≡ no scoring (standalone
   * renders, tests) → the chip is not shown. GAME language only (Design §7/§21.8).
   */
  cardScore?: CardScore | null;
  /**
   * The card's time limit (ms), used to derive the FAST performance tag
   * (engagement §4.3). Omitted/non-finite ≡ no time pressure → never "Fast".
   */
  timeLimitMs?: number;
  /**
   * Optional presentational slot rendered just above "Next" — used by the feed to
   * inject the social Share action (kept OUT of this component so it stays pure /
   * Supabase-free; CLAUDE.md §4). Omitted in standalone renders/tests.
   */
  footer?: ReactNode;
  /** Advance the feed to the next card. The ONLY way out of this state. */
  onContinue: () => void;
  /**
   * Replay the SAME card from the start. When provided, a secondary "Play again"
   * action is shown beneath "Next"; each replay is recorded as a new play
   * (product decision 2026-06). Omitted in standalone renders/tests → not shown.
   */
  onReplay?: () => void;
};

/** Per-outcome heading copy. Modest + performance-based (Design §7). */
const OUTCOME_HEADING: Readonly<Record<ResolutionType, string>> = {
  correct: 'Correct',
  incorrect: 'Not quite',
  timeout: "Time's up",
};

/** Per-outcome supporting line. Keeps tone encouraging, never pressuring. */
const OUTCOME_DETAIL: Readonly<Record<ResolutionType, string>> = {
  correct: 'Nice — you got it.',
  incorrect: 'Here is how this one works.',
  timeout: 'The timer ran out — here is how this one works.',
};

/**
 * Decorative badge glyph per outcome (Phase 3). The outcome WORD carries the
 * meaning (Technical Design §14); the glyph + colour only REINFORCE it, so the
 * card stays readable without colour. Hidden from assistive tech.
 */
const OUTCOME_GLYPH: Readonly<Record<ResolutionType, string>> = {
  correct: '✓',
  incorrect: '✕',
  timeout: '⏱',
};

export default function CardFeedback({
  resolution,
  explanation,
  cardScore,
  timeLimitMs,
  footer,
  onContinue,
  onReplay,
}: CardFeedbackProps) {
  const { resolutionType } = resolution;
  // Game-framing performance tags (engagement §4.3) — empty for a miss/timeout.
  const tags = performanceTags(resolution, timeLimitMs ?? Number.POSITIVE_INFINITY);
  const heading = OUTCOME_HEADING[resolutionType];
  const detail = OUTCOME_DETAIL[resolutionType];
  const glyph = OUTCOME_GLYPH[resolutionType];
  const positive = resolutionType === 'correct';
  const failureReason =
    typeof resolution.signals.failure_reason === 'string' &&
    resolution.signals.failure_reason.trim().length > 0
      ? resolution.signals.failure_reason
      : null;

  // Outcome-tinted RESULT card (Phase 3, mirroring mobile): a success hue
  // reinforces "Correct"; the softer error hue reinforces "Not quite"/"Time's up".
  // Always paired with the outcome word + glyph, so colour is never the sole cue.
  const tint = positive
    ? {
        surface: 'var(--color-success-surface)',
        border: 'var(--color-success-border)',
        bright: 'var(--color-success-bright)',
      }
    : {
        surface: 'var(--color-error-surface)',
        border: 'var(--color-error-border)',
        bright: 'var(--color-error-bright)',
      };

  // Populate the live region AFTER mount so it announces as a mutation. Keyed on
  // the outcome so a new card's feedback re-announces.
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    setAnnounced(`${heading}. ${detail}`);
  }, [heading, detail]);

  return (
    <section
      aria-label="Card feedback"
      data-testid="card-feedback"
      data-outcome={resolutionType}
      style={{
        ...cardStyle,
        background: tint.surface,
        borderColor: tint.border,
      }}
    >
      <Stack gap={3}>
        {/* Dedicated polite live region — empty on first paint, set post-mount
            (above) so the outcome reliably announces. Visually hidden; the
            visible outcome text below carries the meaning on screen. */}
        <div role="status" aria-live="polite" style={visuallyHidden}>
          {announced}
        </div>

        {/* Outcome badge: a tinted glyph chip + the outcome word. The word carries
            the meaning (not colour-only). Plain (non-live) visible text so the
            outcome is announced exactly once (via the live region above). */}
        <div style={outcomeRowStyle}>
          <span
            aria-hidden="true"
            style={{ ...badgeStyle, borderColor: tint.bright, color: tint.bright }}
          >
            {glyph}
          </span>
          <div>
            <p style={{ ...outcomeHeadingStyle, color: tint.bright }}>{heading}</p>
            <p style={outcomeDetailStyle}>{detail}</p>
          </div>
        </div>

        {/* Engagement §4.3: game-framing performance tags (Perfect/Fast/Clean/
            Recovered) above the points chip — a small reward flourish. Empty for a
            miss/timeout → nothing rendered. GAME words only (Design §7/§21.8). */}
        {tags.length > 0 ? (
          <div style={tagsRowStyle} data-testid="feedback-tags">
            {tags.map((tag) => (
              <span key={tag} style={tagChipStyle} data-testid="feedback-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* Phase-4 slot: the per-resolution GAME-POINTS chip — points earned plus
            the current streak/combo — themed with the slide accent. Shown only
            when a score was supplied (feed runs); omitted in standalone renders. */}
        {cardScore ? <ScoreChip cardScore={cardScore} /> : null}

        {/* Explanation state — headed copy, not a second live region, so the
            outcome above is not double-announced. */}
        {failureReason ? (
          <section
            aria-labelledby="card-failure-title"
            data-testid="card-failure-reason"
            style={failureReasonStyle}
          >
            <p id="card-failure-title" style={failureReasonTitleStyle}>
              What went wrong
            </p>
            <p style={failureReasonBodyStyle}>{failureReason}</p>
          </section>
        ) : null}

        <section aria-labelledby="card-explanation-title" style={explanationStyle}>
          <p id="card-explanation-title" style={explanationTitleStyle}>
            {explanation.title}
          </p>
          <p style={explanationBodyStyle}>{explanation.body}</p>
        </section>

        {/* Optional injected actions (the feed's Share button). Above "Next" so
            the player can share before advancing. */}
        {footer}

        {/* Land focus here on mount so a keyboard / screen-reader user moves
            straight from the announced outcome to the only forward affordance. */}
        <Button autoFocus onClick={onContinue} data-testid="feedback-next">
          Next
        </Button>

        {/* Optional replay of the SAME card — secondary to "Next". Each replay
            is recorded as a new play (the gate wires the recording). */}
        {onReplay ? (
          <Button
            variant="ghost"
            onClick={onReplay}
            data-testid="feedback-replay"
          >
            Play again
          </Button>
        ) : null}
      </Stack>
    </section>
  );
}

/**
 * The per-resolution GAME-POINTS chip (Phase 4). Shows points earned and, on a
 * streak, the current run length + combo multiplier. GAME language only — "pts",
 * "streak", "combo" — never skill/ability/IQ/trait framing (Design §7/§21.8).
 *
 * Accent-aware: it reads the slide's `--accent` aliases (seeded per-category on
 * `.feed-slide`) so it matches the card it belongs to. A miss shows a neutral,
 * non-pressuring "Streak reset" so the player understands the run broke.
 */
function ScoreChip({ cardScore }: { cardScore: CardScore }) {
  const { points, correct, streak, combo } = cardScore;
  // Combo is only meaningful (>1) once a streak builds; round for display.
  const showCombo = correct && combo > 1;
  const label = correct
    ? `Plus ${points} points${streak > 1 ? `, streak ${streak}` : ''}`
    : 'Streak reset';
  return (
    <div style={scoreChipStyle} data-testid="card-score" aria-label={label}>
      {correct ? (
        <>
          <span style={scorePointsStyle}>+{points} pts</span>
          {streak > 1 ? (
            <span style={scoreMetaStyle} data-testid="card-score-streak">
              {`🔥 ${streak} streak`}
              {showCombo ? ` · ×${combo.toFixed(1)} combo` : ''}
            </span>
          ) : null}
        </>
      ) : (
        <span style={scoreMetaStyle} data-testid="card-score-reset">
          Streak reset
        </span>
      )}
    </div>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

/** The game-points chip surface — accent-tinted, sits above the explanation.
 *
 * Phase 5: the chip pops in just after the card (a short delay sequences it
 * behind the result card's own pop), so a correct answer's points feel like
 * they "land". Disabled under prefers-reduced-motion (global.css). */
const scoreChipStyle = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--accent, var(--color-accent))',
  background: 'var(--accent-tint, var(--color-surface-overlay))',
  animation: 'card-score-pop var(--motion-base) var(--ease-pop) 80ms both',
} as const;

const scorePointsStyle = {
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)',
} as const;

/** The performance-tags row (engagement §4.3) — small accent-tinted chips that
 * sit just above the points chip. Accent-aware via the slide's `--accent`. */
const tagsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
} as const;

const tagChipStyle = {
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--accent, var(--color-accent))',
  background: 'var(--accent-tint, var(--color-surface-overlay))',
  color: 'var(--accent, var(--color-accent))',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-bold)',
} as const;

const scoreMetaStyle = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-text-muted)',
} as const;

/** The tinted result-card surface (Phase 3). Surface/border are set per-outcome
 * inline so the one card serves both success and error.
 *
 * Phase 5: the card POPS in (scale + fade) when it mounts — the feedback gate
 * mounts a fresh CardFeedback the instant a card resolves, so the animation
 * fires exactly once at the rewarding moment with no extra state. Uses the
 * slight-overshoot `--ease-pop` so a correct answer feels punchy without being
 * cartoonish. Disabled under prefers-reduced-motion (global.css forces the
 * duration to ~0 → the card simply appears). */
const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-md)',
  animation: 'card-feedback-pop var(--motion-base) var(--ease-pop) both',
} as const;

const outcomeRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
} as const;

const badgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-pill)',
  border: '2px solid currentColor',
  background: 'var(--color-surface-overlay)',
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-bold)',
  lineHeight: 1,
} as const;

/** Off-screen but accessible — carries the announced outcome for assistive tech
 * without affecting the visible layout. */
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

const outcomeHeadingStyle = {
  margin: 0,
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  lineHeight: 'var(--line-height-snug)',
} as const;

const outcomeDetailStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;

const explanationStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
} as const;

const failureReasonStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-error-border)',
  background: 'var(--color-error-surface)',
} as const;

const failureReasonTitleStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-error-bright)',
} as const;

const failureReasonBodyStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  lineHeight: 'var(--line-height-normal)',
  color: 'var(--color-text)',
} as const;

const explanationTitleStyle = {
  margin: 0,
  fontSize: 'var(--font-size-md)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-text)',
} as const;

const explanationBodyStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  lineHeight: 'var(--line-height-normal)',
  color: 'var(--color-text)',
} as const;
