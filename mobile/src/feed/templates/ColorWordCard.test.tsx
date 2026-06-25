/**
 * Tests for the native Color Word (Stroop) renderer (Design §9; Tech §7, §14).
 *
 * Mirrors the web renderer test: fake timers drive the trial cadence and the
 * shared `useCardTimer`; an injected `now` supplies the measured-time math. The
 * pure `evaluateColorWord` is the scoring source of truth.
 *
 * Regression focus (the reported bug): a player who taps the swatch matching the
 * INK they just saw must be scored CORRECT even if the tap lands a beat late,
 * during the inter-trial gap — the swatches are still on screen, so dropping that
 * pick to an omission wrongly fails an otherwise-correct run.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { ColorWordCard as ColorWordCardType } from '../../core/cards/types';
import type {
  CardResolution,
  CardStartContext,
} from '../../core/templates/contract';
import ColorWordCard from './ColorWordCard';

const ACTIVE_AT = 1000;

function makeCard(): ColorWordCardType {
  return {
    cardId: 'cw-1',
    creatorHandle: '@hue',
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
        { id: 't0', word: 'BLUE', inkColorId: 'red', congruent: false },
        { id: 't1', word: 'GREEN', inkColorId: 'blue', congruent: false },
      ],
      trialDurationMs: 1000,
      interTrialGapMs: 200,
      timeLimitMs: 20000,
    },
  };
}

function context(): CardStartContext {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const start = () => act(() => void fireEvent.press(screen.getByTestId('cw-start')));
const pick = (colorId: string) =>
  act(() => void fireEvent.press(screen.getByTestId(`cw-swatch-${colorId}`)));

it('scores correct when the player taps the INK they see on every trial', () => {
  jest.useFakeTimers();
  try {
    let t = ACTIVE_AT;
    const onResolve = jest.fn();
    render(
      <ColorWordCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );
    start();
    t = 1200;
    pick('red'); // t0 ink is RED
    advance(1000);
    advance(200);
    t = 2500;
    pick('blue'); // t1 ink is BLUE
    advance(1000);
    advance(200);
    const res = onResolve.mock.calls.at(-1)?.[0] as CardResolution;
    expect(res.isCorrect).toBe(true);
    expect(res.resolutionType).toBe('correct');
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('REGRESSION: a correct pick during the inter-trial gap still counts (not an omission)', () => {
  jest.useFakeTimers();
  try {
    let t = ACTIVE_AT;
    const onResolve = jest.fn();
    render(
      <ColorWordCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );
    start();
    advance(1000); // t0 show fully elapses; now in the gap
    t = 1100;
    pick('red'); // correct ink for t0, but during the gap
    advance(200); // gap → t1 show
    t = 1500;
    pick('blue'); // t1 ink is BLUE
    advance(1000);
    advance(200);
    const res = onResolve.mock.calls.at(-1)?.[0] as CardResolution;
    expect(res.isCorrect).toBe(true);
    expect(res.signals.omissions).toBe(0);
    expect(res.signals.overall_accuracy).toBe(1);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
