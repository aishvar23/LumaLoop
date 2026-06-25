import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { catalog } from '../../core/cards/catalog';
import type {
  SignalSetCard as SignalSetCardType,
  SignalTile,
} from '../../core/cards/types';
import { isValidSignalTrio } from '../../core/templates/signalSet/signalSetEvaluator';
import SignalSetCard, { DEMO_TILES } from './SignalSetCard';

const card: SignalSetCardType = {
  cardId: 'ss-test',
  creatorHandle: '@test',
  templateType: 'signal_set',
  category: 'pattern_recognition',
  difficulty: 'medium',
  evidenceTier: 'mechanic_mapped',
  reviewStatus: 'manual_reviewed',
  estimatedSeconds: 20,
  prompt: 'Pick a trio',
  puzzleDna: {
    mechanic: 'attribute-triad',
    inputMode: 'choice',
    measuredSignals: ['accuracy'],
  },
  explanation: { title: 't', body: 'b' },
  config: {
    tiles: [
      { id: 'a', shape: 'circle', fill: 'solid', count: 1 },
      { id: 'b', shape: 'triangle', fill: 'striped', count: 2 },
      { id: 'c', shape: 'diamond', fill: 'outline', count: 3 },
      { id: 'd', shape: 'circle', fill: 'solid', count: 2 },
      { id: 'e', shape: 'triangle', fill: 'solid', count: 3 },
      { id: 'f', shape: 'diamond', fill: 'solid', count: 1 },
    ],
    solutionIds: ['a', 'b', 'c'],
    timeLimitMs: 10000,
  },
};
const context = {
  sessionId: 's',
  cardIndex: 0,
  activeAtMs: 1000,
  interactionEnabledAtMs: 1000,
};

describe('SignalSetCard', () => {
  it('selects a trio and resolves it', () => {
    const onAttempt = jest.fn();
    const onResolve = jest.fn();
    render(
      <SignalSetCard
        card={card}
        context={context}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => 1500}
      />,
    );
    fireEvent.press(screen.getByTestId('ss-tile-a'));
    fireEvent.press(screen.getByTestId('ss-tile-b'));
    fireEvent.press(screen.getByTestId('ss-tile-c'));
    fireEvent.press(screen.getByTestId('ss-submit'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, resolutionType: 'correct' }),
    );
  });

  describe('demo', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('opens the demo overlay and auto-advances through the features', () => {
      render(
        <SignalSetCard
          card={card}
          context={context}
          onAttempt={jest.fn()}
          onResolve={jest.fn()}
          now={() => 1500}
        />,
      );
      fireEvent.press(screen.getByTestId('ss-demo-button'));
      expect(screen.getByTestId('ss-demo-board')).toBeTruthy();
      expect(screen.getByTestId('ss-demo-instruction').props.children).toMatch(
        /all the same or all different/i,
      );
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId('ss-demo-instruction').props.children).toMatch(
        /shape/i,
      );
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('ss-demo-instruction').props.children).toMatch(
        /count/i,
      );
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId('ss-your-turn')).toBeTruthy();
    });

    it('hides the demo affordance once the player interacts', () => {
      render(
        <SignalSetCard
          card={card}
          context={context}
          onAttempt={jest.fn()}
          onResolve={jest.fn()}
          now={() => 1500}
        />,
      );
      expect(screen.getByTestId('ss-demo-button')).toBeTruthy();
      fireEvent.press(screen.getByTestId('ss-tile-a'));
      expect(screen.queryByTestId('ss-demo-button')).toBeNull();
    });
  });

  describe('demo example', () => {
    it('is a genuinely valid trio under the evaluator rule', () => {
      expect(isValidSignalTrio(DEMO_TILES)).toBe(true);
    });

    it('differs from every catalog signal_set solution trio', () => {
      const featureSignature = (
        tiles: ReadonlyArray<Pick<SignalTile, 'shape' | 'fill' | 'count'>>,
      ): string =>
        (['shape', 'fill', 'count'] as const)
          .map(
            (dimension) => new Set(tiles.map((tile) => tile[dimension])).size,
          )
          .join('-');

      const demoSignature = featureSignature(DEMO_TILES);
      const signalSetSolutions = catalog
        .filter(
          (entry): entry is SignalSetCardType =>
            entry.templateType === 'signal_set',
        )
        .map((entry) => {
          const byId = new Map(
            entry.config.tiles.map((tile) => [tile.id, tile]),
          );
          return entry.config.solutionIds.map((id) => {
            const tile = byId.get(id);
            if (!tile) throw new Error(`missing solution tile ${id}`);
            return tile;
          });
        });

      expect(signalSetSolutions.length).toBeGreaterThan(0);
      for (const solution of signalSetSolutions) {
        expect(featureSignature(solution)).not.toBe(demoSignature);
      }
    });
  });
});
