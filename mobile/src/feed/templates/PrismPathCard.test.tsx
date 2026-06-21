import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { PrismPathCard as PrismPathCardType } from '../../core/cards/types';
import type { CardResolution, CardStartContext } from '../../core/templates/contract';
import PrismPathCard from './PrismPathCard';

function prismPathCard(
  overrides: Partial<PrismPathCardType['config']> = {},
): PrismPathCardType {
  return {
    cardId: 'pp-1',
    creatorHandle: '@test',
    templateType: 'prism_path',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Route the beam',
    puzzleDna: {
      mechanic: 'mirror-beam-routing',
      inputMode: 'tap',
      measuredSignals: ['accuracy'],
    },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 4,
      columns: 4,
      entry: { row: 3, column: 0 },
      entryDirection: 'right',
      target: { row: 0, column: 3 },
      mirrors: [
        { id: 'm1', row: 3, column: 2, initialOrientation: 'backslash' },
        { id: 'm2', row: 0, column: 2, initialOrientation: 'backslash' },
      ],
      blockers: [{ row: 1, column: 1 }],
      solution: [
        { mirrorId: 'm1', orientation: 'slash' },
        { mirrorId: 'm2', orientation: 'slash' },
      ],
      timeLimitMs: 10_000,
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

function renderCard(opts: {
  card?: PrismPathCardType;
  context?: CardStartContext;
  now?: () => number;
} = {}) {
  const onAttempt = jest.fn();
  const onResolve = jest.fn<void, [CardResolution]>();
  render(
    <PrismPathCard
      card={opts.card ?? prismPathCard()}
      context={opts.context ?? startContext()}
      onAttempt={onAttempt}
      onResolve={onResolve}
      now={opts.now}
    />,
  );
  return { onAttempt, onResolve };
}

const rotate = (mirrorId: string) =>
  fireEvent.press(screen.getByTestId(`pp-mirror-${mirrorId}`));

const submit = () => fireEvent.press(screen.getByTestId('pp-submit'));

const lastResolution = (onResolve: jest.Mock<void, [CardResolution]>) =>
  onResolve.mock.calls[onResolve.mock.calls.length - 1][0];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('PrismPathCard', () => {
  it('renders the prompt, board, mirrors, and status', () => {
    renderCard({ now: () => 1_000 });

    expect(screen.getByTestId('pp-prompt')).toHaveTextContent('Route the beam');
    expect(screen.getByTestId('pp-board')).toBeOnTheScreen();
    expect(screen.getByTestId('pp-mirror-m1')).toBeOnTheScreen();
    expect(screen.getByTestId('pp-status')).toHaveTextContent(/Beam currently/);
  });

  it('fires onAttempt once on the first mirror rotation with TTI', () => {
    let clock = 1_000;
    const { onAttempt } = renderCard({ now: () => clock });

    clock = 1_250;
    rotate('m1');
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ time_to_interaction: 250 });

    clock = 1_700;
    rotate('m2');
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolves correct when fired after the mirror route reaches the target', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_300;
    rotate('m1');
    rotate('m2');
    expect(screen.getByTestId('pp-status')).toHaveTextContent(
      /Beam preview reaches the star/,
    );

    clock = 2_400;
    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('correct');
    expect(resolution.isCorrect).toBe(true);
    expect(resolution.signals.reached_target).toBe(true);
    expect(resolution.signals.rotations_used).toBe(2);
    expect(resolution.signals.exit_reason).toBe('hit_target');
  });

  it('resolves incorrect when fired before the route reaches the target', () => {
    const { onResolve } = renderCard({ now: () => 1_000 });

    submit();

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('incorrect');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.reached_target).toBe(false);
  });

  it('resolves timeout with the live route state', () => {
    let clock = 1_000;
    const { onResolve } = renderCard({ now: () => clock });

    clock = 1_500;
    rotate('m1');
    act(() => void jest.advanceTimersByTime(9_999));
    expect(onResolve).not.toHaveBeenCalled();

    clock = 11_000;
    act(() => void jest.advanceTimersByTime(1));

    expect(onResolve).toHaveBeenCalledTimes(1);
    const resolution = lastResolution(onResolve);
    expect(resolution.resolutionType).toBe('timeout');
    expect(resolution.isCorrect).toBe(false);
    expect(resolution.signals.timedOut).toBe(true);
    expect(resolution.signals.rotations_used).toBe(1);
  });
});
