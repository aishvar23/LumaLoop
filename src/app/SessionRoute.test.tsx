/**
 * Tests for the session-route container + the real playable feed (Azure DevOps
 * #69/#70; Technical Design §12, §14).
 *
 * Two layers are covered:
 *   - SessionRoute phase switching: start screen → real in-feed session (the
 *     old "Session in progress" placeholder is gone).
 *   - A deterministic play-through driven through {@link FeedSession} with an
 *     injected deck + the real feed registry: a card plays, resolving shows the
 *     feedback + explanation step, "Next" advances, and the final card reveals
 *     the #71 completion seam. Receipt / exit behaviour (#71/#72) is NOT
 *     asserted here.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TinyLogicCard } from '../cards/types';
import * as composeSessionModule from '../session/composeSession';
import { composeSession } from '../session/composeSession';
import { getAnonymousUserId } from '../telemetry/anonymousUser';
import { continueSeedUserId } from './continueSeed';
import SessionRoute, { FeedSession } from './SessionRoute';

// ---------------------------------------------------------------------------
// SessionRoute phase switching (real composition + real registry).
// ---------------------------------------------------------------------------

describe('SessionRoute', () => {
  it('starts in the start phase showing the StartScreen choices', () => {
    render(<SessionRoute />);

    expect(
      screen.getByRole('heading', { name: 'LumaLoop' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /choose a session/i }),
    ).toBeInTheDocument();
    // The feed is not shown until a mode is chosen.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('mounts the real feed for the chosen 3-minute reset mode', () => {
    render(<SessionRoute />);

    fireEvent.click(screen.getByRole('button', { name: /3-minute reset/i }));

    // The real feed: an accessible progress bar on the first card.
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 7')).toBeInTheDocument();
    // The start choices are gone — the route swapped phase, not appended.
    expect(
      screen.queryByRole('heading', { name: /choose a session/i }),
    ).not.toBeInTheDocument();
    // No completion seam while cards remain.
    expect(
      screen.queryByTestId('session-complete-seam'),
    ).not.toBeInTheDocument();
  });

  it('mounts the real feed for the chosen 1-minute rescue mode', () => {
    render(<SessionRoute />);

    fireEvent.click(screen.getByRole('button', { name: /1-minute rescue/i }));

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Anonymous-id default (#74): with no `anonymousUserId` prop injected, the feed
// composes with the real persisted anonymous id (Technical Design §10), not the
// retired `anon-local-dev` placeholder.
// ---------------------------------------------------------------------------

describe('FeedSession — anonymous-id default', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('composes with the real persisted anon id when no id prop is injected', () => {
    const composeSpy = vi.spyOn(composeSessionModule, 'composeSession');

    render(<FeedSession mode="one_minute_rescue" day="2026-06-19" />);

    expect(composeSpy).toHaveBeenCalled();
    const passedId = composeSpy.mock.calls[0]?.[0].anonymousUserId;
    // The id fed into composition is the real persisted anonymous id...
    expect(passedId).toBe(getAnonymousUserId());
    // ...and NOT the retired placeholder constant.
    expect(passedId).not.toBe('anon-local-dev');
  });

  it('still honours an injected fixed anonymousUserId (test seam preserved)', () => {
    const composeSpy = vi.spyOn(composeSessionModule, 'composeSession');
    const fixed = 'fixed-anon-id';

    render(
      <FeedSession
        mode="one_minute_rescue"
        day="2026-06-19"
        anonymousUserId={fixed}
      />,
    );

    expect(composeSpy.mock.calls[0]?.[0].anonymousUserId).toBe(fixed);
  });
});

// ---------------------------------------------------------------------------
// Deterministic in-feed play-through (injected deck + real feed registry).
// ---------------------------------------------------------------------------

function tinyLogicCard(
  id: string,
  explanationTitle: string,
): TinyLogicCard {
  return {
    cardId: id,
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Pick the correct answer',
    puzzleDna: {
      mechanic: 'one_move_logic_choice',
      inputMode: 'choice',
      measuredSignals: ['correct'],
    },
    explanation: { title: explanationTitle, body: `${id} explanation body` },
    config: {
      stem: `${id} stem`,
      options: [{ id: 'a', label: 'A' }],
      correctOptionId: 'a',
      timeLimitMs: 12_000,
    },
  };
}

describe('FeedSession — in-feed play-through', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('plays a card, shows feedback + explanation, advances, then completes', () => {
    const deck = [
      tinyLogicCard('card-1', 'First explanation'),
      tinyLogicCard('card-2', 'Second explanation'),
    ];

    render(<FeedSession mode="one_minute_rescue" cards={deck} />);

    // Card 1 is in play.
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('tl-stem')).toHaveTextContent('card-1 stem');

    // Resolve card 1 → the uniform feedback + explanation step appears in-flow.
    fireEvent.click(screen.getByTestId('tl-option-a'));
    expect(screen.getByTestId('card-feedback')).toHaveAttribute(
      'data-outcome',
      'correct',
    );
    expect(screen.getByText('First explanation')).toBeInTheDocument();
    // The feed has NOT advanced: still card 1, still no card 2 stem.
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(screen.queryByTestId('tl-stem')).not.toBeInTheDocument();

    // "Next" advances the feed to card 2.
    fireEvent.click(screen.getByTestId('feedback-next'));
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('tl-stem')).toHaveTextContent('card-2 stem');
    expect(screen.queryByTestId('card-feedback')).not.toBeInTheDocument();

    // Resolve card 2 and continue → the session completes (the #71 seam).
    fireEvent.click(screen.getByTestId('tl-option-a'));
    expect(screen.getByText('Second explanation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('feedback-next'));

    expect(screen.getByTestId('session-complete-seam')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('surfaces a timeout as a resolved card with the feedback step', () => {
    const deck = [tinyLogicCard('only-card', 'Only explanation')];

    render(<FeedSession mode="one_minute_rescue" cards={deck} />);

    expect(screen.getByTestId('tl-stem')).toHaveTextContent('only-card stem');

    // Let the per-card timer (12s) expire without answering: the renderer
    // resolves a timeout, which the gate surfaces as the feedback step.
    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(screen.getByTestId('card-feedback')).toHaveAttribute(
      'data-outcome',
      'timeout',
    );
    expect(screen.getByText("Time's up")).toBeInTheDocument();
    expect(screen.getByText('Only explanation')).toBeInTheDocument();

    // Advancing past the only card completes the session.
    fireEvent.click(screen.getByTestId('feedback-next'));
    expect(screen.getByTestId('session-complete-seam')).toBeInTheDocument();
  });

  it('renders the real receipt with the computed numbers on completion', () => {
    const deck = [
      tinyLogicCard('card-1', 'First explanation'),
      tinyLogicCard('card-2', 'Second explanation'),
    ];

    render(<FeedSession mode="one_minute_rescue" cards={deck} />);

    // Answer both cards correctly and advance to completion.
    fireEvent.click(screen.getByTestId('tl-option-a'));
    fireEvent.click(screen.getByTestId('feedback-next'));
    fireEvent.click(screen.getByTestId('tl-option-a'));
    fireEvent.click(screen.getByTestId('feedback-next'));

    // The real receipt surface (not the old placeholder copy).
    expect(screen.getByTestId('session-complete-seam')).toBeInTheDocument();
    expect(screen.getByText('Session complete')).toBeInTheDocument();
    // Computed stats: 2 completed, both correct → 100%, "2 of 2".
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    // Category mix attributed via the injected deck's category.
    expect(screen.getByTestId('category-row-logical_reasoning')).toBeInTheDocument();
    // Reaching the bounded end earns the exit badge (completedOnTime: true).
    expect(screen.getByTestId('exit-badge')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Exit + intentional continue (#72; Design §8.3, Technical Design §14).
// ---------------------------------------------------------------------------

describe('FeedSession — exit + intentional continue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('offers a clear exit path during the active session, and no skip', () => {
    const deck = [tinyLogicCard('card-1', 'First explanation')];

    render(<FeedSession mode="one_minute_rescue" cards={deck} />);

    // A card is in play with a visible exit control beneath it...
    expect(screen.getByTestId('tl-stem')).toHaveTextContent('card-1 stem');
    expect(screen.getByTestId('exit-control')).toBeInTheDocument();
    // ...and there is NO skip affordance anywhere in the feed (Tech §14).
    expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();
  });

  it('exiting ends the session and shows the receipt with NO exit badge', () => {
    const deck = [
      tinyLogicCard('card-1', 'First explanation'),
      tinyLogicCard('card-2', 'Second explanation'),
    ];

    render(<FeedSession mode="three_minute_reset" cards={deck} />);

    // Leave mid-session through the deliberate confirm.
    fireEvent.click(screen.getByTestId('exit-open'));
    fireEvent.click(screen.getByTestId('exit-confirm-leave'));

    // The exited surface: the receipt, framed as an early exit, with NO on-time
    // badge (completedOnTime is false for a leave) and no continue control.
    expect(screen.getByTestId('session-complete-seam')).toBeInTheDocument();
    expect(screen.getByText('Session ended')).toBeInTheDocument();
    expect(screen.queryByTestId('exit-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('continue-control')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('only continues after completion on an explicit tap, re-arming a new loop', () => {
    const deck = [
      tinyLogicCard('card-1', 'First explanation'),
      tinyLogicCard('card-2', 'Second explanation'),
    ];

    render(<FeedSession mode="one_minute_rescue" cards={deck} />);

    // Play through to the bounded end.
    fireEvent.click(screen.getByTestId('tl-option-a'));
    fireEvent.click(screen.getByTestId('feedback-next'));
    fireEvent.click(screen.getByTestId('tl-option-a'));
    fireEvent.click(screen.getByTestId('feedback-next'));

    // Completed receipt: the continue control is present, but the session has
    // NOT continued on its own — no card is in play (Tech §14: intentional tap).
    expect(screen.getByTestId('session-complete-seam')).toBeInTheDocument();
    expect(screen.getByTestId('continue-control')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tl-stem')).not.toBeInTheDocument();

    // The intentional tap re-arms a fresh active loop: a card is in play again.
    fireEvent.click(screen.getByTestId('continue-control'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByTestId('tl-stem')).toBeInTheDocument();
    expect(screen.queryByTestId('session-complete-seam')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Continue-deck seed decision (#72): the first window keeps the plain seed; each
// continue varies the seed so composition reshuffles the same pool.
// ---------------------------------------------------------------------------

describe('continueSeedUserId', () => {
  it('keeps the plain id for the first window and suffixes the counter after', () => {
    expect(continueSeedUserId('anon-local-dev', 0)).toBe('anon-local-dev');
    expect(continueSeedUserId('anon-local-dev', 1)).toBe(
      'anon-local-dev#continue-1',
    );
    expect(continueSeedUserId('anon-local-dev', 2)).toBe(
      'anon-local-dev#continue-2',
    );
  });

  it('varies the composed deck across continue windows (real composition)', () => {
    const base = 'anon-local-dev';
    const day = '2026-06-19';
    // composeSession returns an ordered list of cardIds (readonly string[]).
    const first = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: continueSeedUserId(base, 0),
      day,
    });
    const afterContinue = composeSession({
      mode: 'three_minute_reset',
      anonymousUserId: continueSeedUserId(base, 1),
      day,
    });

    // The first window is the documented plain-seed baseline...
    expect(
      composeSession({ mode: 'three_minute_reset', anonymousUserId: base, day }),
    ).toEqual(first);
    // ...and a continue produces a different ordered deck (seed actually varied).
    expect(afterContinue).not.toEqual(first);
  });
});
