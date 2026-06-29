/**
 * Tests for the mobile "Challenge a friend" button (RN counterpart of web
 * `src/social/CardChallengeButton.test.tsx`). Mocks `Share.share`; no backend.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import CardChallengeButton from './CardChallengeButton';

describe('CardChallengeButton (mobile)', () => {
  it('shares a message with a challenge URL containing the cardId and score', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);

    render(<CardChallengeButton cardId="spot_it-1" points={420} />);
    fireEvent.press(screen.getByTestId('card-challenge'));

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('/c/spot_it-1');
    expect(arg.message).toContain('s=420');
    expect(arg.message).toMatch(/420/);

    shareSpy.mockRestore();
  });
});
