/**
 * Session-route container (Azure DevOps #69, Technical Design §12 / §14).
 *
 * Owns the start→session PHASE state for the `/` route. App and the router stay
 * routing-only (CLAUDE.md §4): routing selects which element renders, but the
 * decision of *which phase of the session surface* to show lives here, not in
 * the route table. This keeps session progression out of routing while giving
 * `/` a single mount point.
 *
 * Phases:
 *   - "start"        → the real {@link StartScreen}; choosing a mode advances.
 *   - "in_progress"  → a clearly-marked feed placeholder.
 *
 * SEAM FOR #70: the "in_progress" branch is a deliberate placeholder. Task #70
 * drops the real feed / session controller in here, reading the chosen `mode`
 * from this container's state. Do not add feed, receipt, or exit logic to this
 * file before then — keep the controller independent of routing (CLAUDE.md §4).
 */
import { useState } from 'react';
import Screen from '../ui/Screen';
import Stack from '../ui/Stack';
import StartScreen from '../ui/StartScreen';
import {
  MODE_DEFAULTS,
  MODE_LABELS,
  type SessionMode,
} from '../session/sessionTypes';

type Phase =
  | { name: 'start' }
  | { name: 'in_progress'; mode: SessionMode };

export default function SessionRoute() {
  const [phase, setPhase] = useState<Phase>({ name: 'start' });

  if (phase.name === 'start') {
    return (
      <StartScreen
        onStart={(mode) => setPhase({ name: 'in_progress', mode })}
      />
    );
  }

  // SEAM FOR #70 — replace this placeholder with the real feed for `phase.mode`.
  const limits = MODE_DEFAULTS[phase.mode];
  return (
    <Screen aria-labelledby="in-progress-heading">
      <Stack gap={3} justify="center" style={{ flex: 1 }}>
        <h1
          id="in-progress-heading"
          style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}
        >
          Session in progress
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          Feed UI lands in #70. You chose the{' '}
          <strong>{MODE_LABELS[phase.mode]}</strong> session (up to{' '}
          {limits.maxCards} cards).
        </p>
      </Stack>
    </Screen>
  );
}
