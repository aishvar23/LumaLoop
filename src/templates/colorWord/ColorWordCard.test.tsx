/**
 * Tests for the Color Word (Stroop) renderer (Design §9; Tech §7, §14).
 *
 * Driven through React Testing Library with an INJECTED clock and vitest fake
 * timers: fake timers drive both the renderer-owned trial cadence
 * (show→gap→next on `trialDurationMs` / `interTrialGapMs`) and the shared
 * `useCardTimer` countdown, while the injected `now` supplies the measured-time
 * math (RT, elapsed). The pure `evaluateColorWord` is the scoring source of
 * truth; these tests assert the renderer collects per-trial picks correctly and
 * routes them through it.
 *
 * Regression focus (the reported bug): a player who taps the swatch matching the
 * INK they just saw must be scored CORRECT even if the tap lands a beat late,
 * during the inter-trial gap — the swatches are still on screen, so dropping
 * that pick to an omission wrongly fails an otherwise-correct run.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ColorWordCard as ColorWordCardType } from '../../cards/types';
import type { CardResolution, CardStartContext } from '../contract';
import ColorWordCard from './ColorWordCard';

function colorWordCard(
  overrides: Partial<ColorWordCardType['config']> = {},
): ColorWordCardType {
  return {
    cardId: 'cw-1',
    creatorHandle: '@test',
    templateType: 'color_word',
    category: 'cognitive_flexibility',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Tap the colour each word is printed in.',
    puzzleDna: {
      mechanic: 'stroop-interference',
      inputMode: 'tap',
      measuredSignals: ['accuracy', 'reaction_time'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      colors: [
        { id: 'red', label: 'Red', hex: '#e5484d' },
        { id: 'blue', label: 'Blue', hex: '#3e63dd' },
        { id: 'green', label: 'Green', hex: '#46a758' },
      ],
      trials: [
        // word ≠ ink on every trial: the correct pick is always the INK swatch.
        { id: 't0', word: 'BLUE', inkColorId: 'red', congruent: false },
        { id: 't1', word: 'GREEN', inkColorId: 'blue', congruent: false },
      ],
      trialDurationMs: 1_000,
      interTrialGapMs: 200,
      timeLimitMs: 20_000,
      ...overrides,
    },
  };
}

function startContext(overrides: Partial<CardStartContext> = {}): CardStartContext {
  return {
    sessionId: 'sess-1',
    cardIndex: 0,
    activeAtMs: 1_000,
    interactionEnabledAtMs: 1_000,
    ...overrides,
  };
}

type RenderOpts = {
  card?: ColorWordCardType;
  context?: CardStartContext;
  now?: () => number;
};

function renderCard(opts: RenderOpts = {}) {
  const onAttempt = vi.fn();
  const onResolve = vi.fn();
  render(
    <ColorWordCard
      card={opts.card ?? colorWordCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const start = () =>
  act(() => void fireEvent.click(screen.getByTestId('cw-start')));
const pick = (colorId: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`cw-swatch-${colorId}`)));
const lastResolution = (onResolve: ReturnType<typeof vi.fn>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0] as CardResolution;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Color Word renderer', () => {
  it('shows the ink colour the word is printed in (visual matches inkColorId)', () => {
    renderCard({ now: () => 1_000 });
    start();
    const word = screen.getByTestId('cw-word');
    // t0: word BLUE printed in RED ink (#e5484d → rgb(229, 72, 77)).
    expect(word).toHaveTextContent('BLUE');
    expect(word).toHaveStyle({ color: 'rgb(229, 72, 77)' });
  });

  it('labels every swatch with text (colour is never the sole signal)', () => {
    renderCard({ now: () => 1_000 });
    start();
    expect(screen.getByTestId('cw-swatch-red')).toHaveAccessibleName('Red');
    expect(screen.getByTestId('cw-swatch-blue')).toHaveAccessibleName('Blue');
    expect(screen.getByTestId('cw-swatch-green')).toHaveAccessibleName('Green');
  });

  it('scores correct when the player taps the INK they see on every trial', () => {
    let t = 1_000;
    const { onResolve } = renderCard({ now: () => t });
    start();
    // t0: ink is RED → tap red.
    t = 1_200;
    pick('red');
    advance(1_000); // show → gap
    advance(200); // gap → t1 show
    // t1: ink is BLUE → tap blue.
    t = 2_500;
    pick('blue');
    advance(1_000);
    advance(200); // → done → resolve
    const res = lastResolution(onResolve);
    expect(res.isCorrect).toBe(true);
    expect(res.resolutionType).toBe('correct');
  });

  it('REGRESSION: a correct pick during the inter-trial gap still counts (not an omission)', () => {
    let t = 1_000;
    const { onResolve } = renderCard({ now: () => t });
    start();
    // t0: let the SHOW window fully elapse before the player taps — the tap now
    // lands during the gap, while the swatches are still on screen.
    advance(1_000); // show → gap (no pick yet)
    t = 1_100;
    pick('red'); // correct ink for t0, but during the gap
    advance(200); // gap → t1 show
    // t1: tap the ink (blue) within the show window.
    t = 1_500;
    pick('blue');
    advance(1_000);
    advance(200);
    const res = lastResolution(onResolve);
    // Before the fix, the gap pick was dropped → t0 omission → "incorrect".
    expect(res.isCorrect).toBe(true);
    expect(res.signals.omissions).toBe(0);
    expect(res.signals.overall_accuracy).toBe(1);
  });

  it('scores incorrect when the player taps the WORD colour instead of the ink', () => {
    let t = 1_000;
    const { onResolve } = renderCard({ now: () => t });
    start();
    // t0: word is BLUE, ink is RED. Tapping blue (the WORD) is a false tap.
    t = 1_200;
    pick('blue');
    advance(1_000);
    advance(200);
    // t1: tap correctly so only t0 is wrong.
    t = 2_500;
    pick('blue');
    advance(1_000);
    advance(200);
    const res = lastResolution(onResolve);
    expect(res.isCorrect).toBe(false);
    expect(res.signals.false_taps).toBe(1);
  });
});
