import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalog } from '../../cards/catalog';
import type {
  SignalSetCard as SignalSetCardType,
  SignalTile,
} from '../../cards/types';
import SignalSetCard, { DEMO_TILES } from './SignalSetCard';
import { isValidSignalTrio } from './signalSetEvaluator';

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
  it('selects three tiles and resolves through the evaluator', () => {
    const onAttempt = vi.fn();
    const onResolve = vi.fn();
    render(
      <SignalSetCard
        card={card}
        context={context}
        onAttempt={onAttempt}
        onResolve={onResolve}
        now={() => 1500}
      />,
    );
    fireEvent.click(screen.getByTestId('ss-tile-a'));
    fireEvent.click(screen.getByTestId('ss-tile-b'));
    fireEvent.click(screen.getByTestId('ss-tile-c'));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ss-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('ss-submit'));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, resolutionType: 'correct' }),
    );
  });

  describe('demo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('opens the demo overlay and walks through every feature', () => {
      render(
        <SignalSetCard
          card={card}
          context={context}
          onAttempt={vi.fn()}
          onResolve={vi.fn()}
          now={() => 1500}
        />,
      );
      fireEvent.click(screen.getByTestId('ss-demo-button'));
      expect(screen.getByTestId('ss-demo-board')).toBeInTheDocument();
      // Stepped, auto-advancing explanation cycles shape → fill → count.
      expect(screen.getByTestId('ss-demo-instruction').textContent).toMatch(
        /all the same or all different/i,
      );
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId('ss-demo-instruction').textContent).toMatch(
        /shape/i,
      );
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId('ss-demo-instruction').textContent).toMatch(
        /fill/i,
      );
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByTestId('ss-demo-instruction').textContent).toMatch(
        /count/i,
      );
      // Auto-closes and shows the "your turn" prompt.
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('ss-demo-board')).not.toBeInTheDocument();
      expect(screen.getByTestId('ss-your-turn')).toBeInTheDocument();
    });

    it('hides the demo affordance once the player interacts', () => {
      render(
        <SignalSetCard
          card={card}
          context={context}
          onAttempt={vi.fn()}
          onResolve={vi.fn()}
          now={() => 1500}
        />,
      );
      expect(screen.getByTestId('ss-demo-button')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('ss-tile-a'));
      expect(screen.queryByTestId('ss-demo-button')).not.toBeInTheDocument();
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
        // The demo keeps TWO features the same (a same-shape, same-fill,
        // different-count trio); no catalog solution shares that signature, so
        // the demo can never reveal a real answer.
        expect(featureSignature(solution)).not.toBe(demoSignature);
      }
    });
  });
});
