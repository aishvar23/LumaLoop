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
 * this renders in-flow as a `<section>`, never as an overlay/dialog. The result
 * line is a polite live region so assistive tech hears the outcome; the
 * explanation is plain headed copy (not a second live region) so the outcome is
 * announced exactly once.
 */

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

export default function CardFeedback({
  resolution,
  explanation,
  onContinue,
}: CardFeedbackProps) {
  const heading = OUTCOME_HEADING[resolution.resolutionType];
  const detail = OUTCOME_DETAIL[resolution.resolutionType];

  return (
    <section
      aria-label="Card feedback"
      data-testid="card-feedback"
      data-outcome={resolution.resolutionType}
      style={sectionStyle}
    >
      <Stack gap={3}>
        {/* Outcome — announced once (polite). Not colour-only: the outcome word
            itself carries the meaning (Technical Design §14). */}
        <div role="status" aria-live="polite">
          <p style={outcomeHeadingStyle}>{heading}</p>
          <p style={outcomeDetailStyle}>{detail}</p>
        </div>

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

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
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
