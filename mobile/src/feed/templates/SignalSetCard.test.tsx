import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SignalSetCard as SignalSetCardType } from '../../core/cards/types';
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
});
