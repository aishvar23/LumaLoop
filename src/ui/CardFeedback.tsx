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

import { useEffect, useState } from 'react';

import type { CardResolution, ResolutionType } from '../templates/contract';
import Button from './Button';
import Stack from './Stack';

export type CardFeedbackProps = {
  /** The resolution captured from the card's renderer. */
  resolution: CardResolution;
  /** The card's authored explanation copy (title + body). */
  explanation: { title: string; body: string };
  /** Advance the feed to the next card. The ONLY way out of this state. */
  onContinue: () => void;
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
  onContinue,
}: CardFeedbackProps) {
  const { resolutionType } = resolution;
  const heading = OUTCOME_HEADING[resolutionType];
  const detail = OUTCOME_DETAIL[resolutionType];
  const glyph = OUTCOME_GLYPH[resolutionType];
  const positive = resolutionType === 'correct';

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

        {/* Phase-4 slot: the per-resolution score / streak chip drops in here,
            above the explanation, with no other change to this card. Intentionally
            empty in Phase 3 (scoring is not built yet). */}

        {/* Explanation state — headed copy, not a second live region, so the
            outcome above is not double-announced. */}
        <section aria-labelledby="card-explanation-title" style={explanationStyle}>
          <p id="card-explanation-title" style={explanationTitleStyle}>
            {explanation.title}
          </p>
          <p style={explanationBodyStyle}>{explanation.body}</p>
        </section>

        {/* Land focus here on mount so a keyboard / screen-reader user moves
            straight from the announced outcome to the only forward affordance. */}
        <Button autoFocus onClick={onContinue} data-testid="feedback-next">
          Next
        </Button>
      </Stack>
    </section>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

/** The tinted result-card surface (Phase 3). Surface/border are set per-outcome
 * inline so the one card serves both success and error. */
const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-md)',
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
