/**
 * ExitControl — the in-feed "leave the session" affordance (Design §8.3,
 * Technical Design §14; Azure DevOps #72).
 *
 * "The exit path should be visually clear" (Tech §14): a single, clearly
 * labelled control sits in the feed so the user can leave at any time. Leaving
 * is terminal (the controller's `exited` status is terminal), so this adds a
 * minimal inline confirm — NOT a nested modal game (Tech §14) — so one stray
 * tap can't discard a live session. The confirm is the only friction: it makes
 * exit deliberate without pressuring the user to stay.
 *
 * This is an EXIT, never a skip: there is no user-facing skip affordance in the
 * prototype (Tech §14). Leaving ends the session; it never advances past a card.
 *
 * Presentational only: it owns its own confirm toggle but no session state — the
 * actual transition is the injected `onExit` (the controller's `exitSession`).
 */
import { useState } from 'react';

import Button from './Button';
import Cluster from './Cluster';
import Stack from './Stack';

export type ExitControlProps = {
  /** Ends the session (wired to the controller's `exitSession`). */
  onExit: () => void;
};

export default function ExitControl({ onExit }: ExitControlProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Cluster justify="center" data-testid="exit-control">
        <Button
          variant="ghost"
          data-testid="exit-open"
          onClick={() => setConfirming(true)}
        >
          End session
        </Button>
      </Cluster>
    );
  }

  return (
    <Stack
      gap={2}
      role="group"
      aria-label="End this session?"
      data-testid="exit-confirm"
    >
      <p style={{ margin: 0, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        End this session? Your progress so far is saved to your receipt.
      </p>
      <Cluster gap={2} justify="center">
        <Button
          variant="ghost"
          data-testid="exit-cancel"
          onClick={() => setConfirming(false)}
        >
          Keep playing
        </Button>
        <Button data-testid="exit-confirm-leave" onClick={onExit}>
          Leave now
        </Button>
      </Cluster>
    </Stack>
  );
}
