/**
 * ProgressBar — session progress across the bounded card count (Technical
 * Design §8, §14). Presentational only: it reflects the controller's
 * `index` / `total`, it does not own progression.
 *
 * Accessibility (Technical Design §14): a real `role="progressbar"` with a
 * static `aria-label` accessible name, `aria-valuemin` / `aria-valuemax` /
 * `aria-valuenow`, plus an `aria-valuetext` and matching visible label so the
 * position is conveyed as text — never by the fill width (colour/size) alone.
 */

export type ProgressBarProps = {
  /** Zero-based index of the active card (the controller's `index`). */
  index: number;
  /** Total cards composed into this session window (the controller's `total`). */
  total: number;
};

export default function ProgressBar({ index, total }: ProgressBarProps) {
  // `index` is the count of cards already advanced past, so it doubles as the
  // "completed" value that drives the fill. The human-readable position is
  // 1-based and clamped to `total` for the final card.
  const completed = Math.max(0, Math.min(index, total));
  const current = total === 0 ? 0 : Math.min(index + 1, total);
  const label = total === 0 ? 'No cards' : `Card ${current} of ${total}`;
  const fillPercent = total === 0 ? 0 : (completed / total) * 100;

  return (
    <div style={wrapperStyle}>
      <div
        role="progressbar"
        // A static accessible NAME for the control ("what is this?"); the
        // position ("where are we?") is the value, carried by aria-valuetext and
        // the visible label. Without this the progressbar has no accessible name.
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={label}
        style={trackStyle}
      >
        <div style={{ ...fillStyle, width: `${fillPercent}%` }} />
      </div>
      {/* Not conveyed by the fill alone: the position is spelled out in text. */}
      <p style={labelStyle}>{label}</p>
    </div>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const wrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  width: '100%',
} as const;

const trackStyle = {
  width: '100%',
  height: 'var(--space-2)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  overflow: 'hidden',
} as const;

const fillStyle = {
  height: '100%',
  background: 'var(--color-accent)',
  transition: 'width 200ms ease',
} as const;

const labelStyle = {
  margin: 0,
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
} as const;
