import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SignalSetCard as SignalSetCardType } from '../../cards/types';
import SignalSetCard from './SignalSetCard';

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
});
