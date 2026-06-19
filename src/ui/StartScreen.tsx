/**
 * Start screen (Technical Design §14, §16; Design §8.1, §21.8).
 *
 * The player picks a session length and sees the REQUIRED non-assessment /
 * anonymous-data notice before a session can start (Design §8.1 / §21.8,
 * Technical Design §14 / §16). Presentational only: choosing a mode invokes the
 * `onStart` callback with the chosen {@link SessionMode}. Mounting the feed /
 * session controller is the session-route container's job (#70) — this screen
 * owns no progression and no session state (CLAUDE.md §4).
 *
 * Durations and card counts are derived from `MODE_DEFAULTS` (the single source
 * of truth in src/session/sessionTypes.ts) so the copy can never drift from the
 * limits the reducer actually enforces.
 */
import {
  MODE_DEFAULTS,
  MODE_LABELS,
  type SessionMode,
} from '../session/sessionTypes';
import Button from './Button';
import Screen from './Screen';
import Stack from './Stack';

/**
 * The required start-screen notice (Technical Design §14, verbatim; Design
 * §21.8). Records anonymous interaction events and is explicitly NOT a
 * cognitive / medical / school / employment assessment.
 */
const DATA_NOTICE =
  'This prototype records anonymous interaction events like card attempts, ' +
  'timing, and completion. It is not a cognitive, medical, school, or ' +
  'employment assessment.';

/** Whole minutes for a mode's duration limit, for human-readable copy. */
function minutesFor(mode: SessionMode): number {
  return MODE_DEFAULTS[mode].maxDurationMs / 60_000;
}

/**
 * The session choices (Design §8.1), in display order. The two choices map
 * one-to-one onto the existing {@link SessionMode} union; their labels come
 * from {@link MODE_LABELS} and their limits from {@link MODE_DEFAULTS}, never
 * hardcoded here, so the start screen can't drift from those sources.
 */
const MODE_CHOICES: ReadonlyArray<SessionMode> = [
  'one_minute_rescue',
  'three_minute_reset',
];

export type StartScreenProps = {
  /**
   * Called with the chosen mode when the player starts a session. Defaults to a
   * no-op so the screen renders standalone (e.g. in isolation tests); real
   * usage wires this to the session-route container (#70).
   */
  onStart?: (mode: SessionMode) => void;
};

export default function StartScreen({ onStart }: StartScreenProps = {}) {
  return (
    <Screen aria-labelledby="start-heading">
      <Stack gap={5} justify="center" style={{ flex: 1 }}>
        <Stack gap={2} as="header">
          <h1
            id="start-heading"
            style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}
          >
            LumaLoop
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            A short, bounded loop of thinking — not endless scrolling.
          </p>
        </Stack>

        {/* Required notice (§21.8 / Tech §14), prominent and before the choice
            so the player reads it before any session can start. */}
        <section
          aria-labelledby="data-notice-heading"
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
          }}
        >
          <Stack gap={1}>
            <h2
              id="data-notice-heading"
              style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}
            >
              Before you start
            </h2>
            {/* Default (non-muted) text so the REQUIRED notice (§21.8/§14)
                reads as required, not as decorative muted copy. */}
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
              {DATA_NOTICE}
            </p>
          </Stack>
        </section>

        <Stack gap={3} aria-labelledby="choose-heading" as="section">
          <h2
            id="choose-heading"
            style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}
          >
            Choose a session
          </h2>
          <Stack gap={2}>
            {MODE_CHOICES.map((mode) => {
              const label = MODE_LABELS[mode];
              const limits = MODE_DEFAULTS[mode];
              const minutes = minutesFor(mode);
              const detail = `${minutes} minute${
                minutes === 1 ? '' : 's'
              } · up to ${limits.maxCards} cards`;
              return (
                <Button
                  key={mode}
                  // Design §8.1: 3-minute reset is the default path.
                  variant={mode === 'three_minute_reset' ? 'primary' : 'ghost'}
                  onClick={() => onStart?.(mode)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 'var(--space-1)',
                    textAlign: 'left',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  {/* Not conveyed by colour alone: the limits are spelled out
                      in text on every choice. */}
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 400,
                      opacity: 0.85,
                    }}
                  >
                    {detail}
                  </span>
                </Button>
              );
            })}
          </Stack>
        </Stack>
      </Stack>
    </Screen>
  );
}
