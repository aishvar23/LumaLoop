import * as Haptics from 'expo-haptics';

import { errorBuzz, selectionTick, successBuzz } from './haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

describe('haptics', () => {
  afterEach(() => jest.clearAllMocks());

  it('selectionTick fires a selection haptic', () => {
    selectionTick();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('successBuzz fires the success notification', () => {
    successBuzz();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('errorBuzz fires the error notification', () => {
    errorBuzz();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('never throws if the native module rejects/throws', () => {
    (Haptics.selectionAsync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no taptic engine');
    });
    expect(() => selectionTick()).not.toThrow();
  });
});
