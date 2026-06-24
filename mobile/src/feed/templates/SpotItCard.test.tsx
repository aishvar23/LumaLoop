/**
 * Tests for the native Spot It renderer (ADO #128). The pure evaluator already has
 * its own unit tests; these cover the RN renderer's contract behaviour: correct tap
 * resolves CORRECT, false taps are counted but non-fatal, `onAttempt` fires once
 * with TTI from the interaction-enabled origin, and the shared timer resolves
 * TIMEOUT on expiry.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { SpotItCard as SpotItCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import { GameThemeProvider } from './GameTheme';
import SpotItCard from './SpotItCard';
import { categoryAccents, fontSize, space } from './tokens';

const ACTIVE_AT = 1000;

function makeCard(
  overrides: Partial<SpotItCardType['config']> = {},
): SpotItCardType {
  return {
    cardId: 'spot-1',
    creatorHandle: '@gridwise',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Tap the odd one out',
    puzzleDna: { mechanic: 'scan', inputMode: 'tap', measuredSignals: [] },
    explanation: { title: 'Why', body: 'Because.' },
    config: {
      rows: 2,
      columns: 2,
      baseElement: 'O',
      anomalyElement: 'Q',
      anomalyRow: 1,
      anomalyColumn: 0,
      timeLimitMs: 1000,
      ...overrides,
    },
  };
}

it('uses a compact column gap for six-column boards', () => {
  render(
    <SpotItCard
      card={makeCard({ columns: 6, anomalyColumn: 5 })}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );

  expect(screen.getByTestId('spot-row-0')).toHaveStyle({
    width: '100%',
    gap: space.xs,
  });
  expect(screen.getByTestId('spot-cell-0-5')).toBeOnTheScreen();
});

it('shrinks two-character code glyphs below the single-glyph size', () => {
  render(
    <SpotItCard
      card={makeCard({
        rows: 1,
        columns: 2,
        baseElement: 'M7',
        anomalyElement: 'MN',
        anomalyRow: 0,
        anomalyColumn: 1,
      })}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );

  expect(screen.getByText('M7')).toHaveStyle({
    fontSize: fontSize.md,
    letterSpacing: -0.25,
  });
  expect(screen.getByText('MN')).toHaveStyle({
    fontSize: fontSize.md,
    letterSpacing: -0.25,
  });
});

it('shrinks three-character code glyphs aggressively so they fit inside each tile', () => {
  render(
    <SpotItCard
      card={makeCard({
        rows: 1,
        columns: 2,
        baseElement: 'M7N',
        anomalyElement: 'MN7',
        anomalyRow: 0,
        anomalyColumn: 1,
      })}
      context={context()}
      onAttempt={jest.fn()}
      onResolve={jest.fn()}
    />,
  );

  expect(screen.getByText('M7N')).toHaveStyle({
    fontSize: fontSize.sm,
    letterSpacing: -0.5,
  });
  expect(screen.getByText('MN7')).toHaveStyle({
    fontSize: fontSize.sm,
    letterSpacing: -0.5,
  });
});

function context(): CardStartContext {
  return {
    sessionId: 'feed-1',
    cardIndex: 0,
    activeAtMs: ACTIVE_AT,
    interactionEnabledAtMs: ACTIVE_AT,
  };
}

it('uses the feed category palette for the board, cells, and glyphs', () => {
  render(
    <GameThemeProvider category="visual_attention">
      <SpotItCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={jest.fn()}
      />
    </GameThemeProvider>,
  );

  const palette = categoryAccents.visual_attention;
  expect(screen.getByTestId('spot-grid')).toHaveStyle({
    backgroundColor: palette.surface,
    borderColor: palette.border,
  });
  expect(screen.getByTestId('spot-cell-0-0')).toHaveStyle({
    backgroundColor: palette.surfaceRaised,
    borderColor: palette.border,
  });
  expect(screen.getAllByText('O')[0]).toHaveStyle({ color: palette.accent });
});

it('resolves CORRECT when the anomaly cell is tapped, routing through the evaluator', () => {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  let t = ACTIVE_AT;
  render(
    <SpotItCard
      card={makeCard()}
      context={context()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={() => t}
    />,
  );

  t = ACTIVE_AT + 250;
  fireEvent.press(screen.getByTestId('spot-cell-1-0'));

  expect(onResolve).toHaveBeenCalledTimes(1);
  const resolution = onResolve.mock.calls[0][0];
  expect(resolution).toMatchObject({
    cardId: 'spot-1',
    resolutionType: 'correct',
    isCorrect: true,
    attemptCount: 1,
  });
  expect(resolution.signals).toMatchObject({ correct_tap: true, false_taps: 0 });
});

it('counts a false tap without resolving, and fires onAttempt once with TTI from interaction-enabled', () => {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  let t = ACTIVE_AT;
  render(
    <SpotItCard
      card={makeCard()}
      context={context()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={() => t}
    />,
  );

  // Two wrong taps: counted, non-fatal — no resolution.
  t = ACTIVE_AT + 120;
  fireEvent.press(screen.getByTestId('spot-cell-0-0'));
  t = ACTIVE_AT + 300;
  fireEvent.press(screen.getByTestId('spot-cell-0-1'));

  expect(onResolve).not.toHaveBeenCalled();
  // onAttempt fired exactly once, on the FIRST tap, with TTI off interaction-enabled.
  expect(onAttempt).toHaveBeenCalledTimes(1);
  expect(onAttempt).toHaveBeenCalledWith({ time_to_first_tap: 120 });
  expect(screen.getByTestId('spot-status')).toHaveTextContent(/2 incorrect taps/);

  // Now the correct tap resolves, reporting the accumulated false taps.
  t = ACTIVE_AT + 500;
  fireEvent.press(screen.getByTestId('spot-cell-1-0'));
  expect(onResolve).toHaveBeenCalledTimes(1);
  expect(onResolve.mock.calls[0][0].signals).toMatchObject({
    correct_tap: true,
    false_taps: 2,
  });
});

it('resolves TIMEOUT when the time limit elapses before a correct tap', () => {
  jest.useFakeTimers();
  try {
    const onResolve = jest.fn<void, [CardResolution]>();
    let t = ACTIVE_AT;
    render(
      <SpotItCard
        card={makeCard()}
        context={context()}
        onAttempt={jest.fn()}
        onResolve={onResolve}
        now={() => t}
      />,
    );

    // A false tap before the clock runs out — still no resolution.
    t = ACTIVE_AT + 200;
    fireEvent.press(screen.getByTestId('spot-cell-0-0'));
    expect(onResolve).not.toHaveBeenCalled();

    t = ACTIVE_AT + 1000;
    act(() => jest.advanceTimersByTime(1000));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = onResolve.mock.calls[0][0];
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals).toMatchObject({ timedOut: true, false_taps: 1 });

    // Post-resolution taps are inert — no extra resolve, no extra false tap.
    fireEvent.press(screen.getByTestId('spot-cell-0-1'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
