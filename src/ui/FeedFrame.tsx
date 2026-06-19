/**
 * FeedFrame — the full-bleed vertical shell that hosts the active card (Design
 * §8.2; Technical Design §4, §14).
 *
 * The card is PLAYED IN THE FEED: there is no loading screen and no nested modal
 * (Technical Design §14). The active card element, and — after resolution — the
 * uniform feedback/explanation step, both render IN-FLOW inside this frame; the
 * feedback step is injected by the feed registry's gate, not by this shell (see
 * `feedRegistry.tsx`). The frame is presentational only and owns no progression:
 * it renders whatever element the controller hands it (CLAUDE.md §4).
 *
 * The one-sentence prompt is the renderer's own surface (each template renders
 * its `card.prompt` / stem as part of card interaction, per §4); the frame does
 * not re-render it, so the prompt is never duplicated.
 */

import type { ReactNode } from 'react';

import Screen from './Screen';
import Stack from './Stack';
import ProgressBar from './ProgressBar';

export type FeedFrameProps = {
  /** The active card element from the controller (card in play, or its gate). */
  activeCardElement: ReactNode | null;
  /** Zero-based index of the active card (the controller's `index`). */
  index: number;
  /** Total cards composed into this session (the controller's `total`). */
  total: number;
};

export default function FeedFrame({
  activeCardElement,
  index,
  total,
}: FeedFrameProps) {
  return (
    <Screen aria-labelledby="feed-heading" scrollable={false}>
      {/* The feed has no visible chrome heading (Design §8.2 — the card is the
          content); a visually-hidden label names the landmark for assistive
          tech. */}
      <h1 id="feed-heading" style={visuallyHidden}>
        Session feed
      </h1>
      <Stack gap={4} style={{ flex: 1 }}>
        <ProgressBar index={index} total={total} />
        {/* The active card mounts here in-flow — no overlay, no transition
            screen. Empty between session arm and the first card. */}
        <div style={cardSlotStyle}>{activeCardElement}</div>
      </Stack>
    </Screen>
  );
}

// ── Token-driven styles (no hardcoded colours/sizes; Design tokens, #51) ──────

const cardSlotStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
} as const;

/** Off-screen but accessible — names the feed landmark without visible chrome. */
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
