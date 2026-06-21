/**
 * Tests for {@link useReducedMotion} (MP3 #135). The hook surfaces the OS
 * "reduce motion" preference so animations can degrade to an instant appearance.
 * We drive it through a spied `AccessibilityInfo` so neither the async read nor the
 * change subscription depends on a real device.
 */
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { useReducedMotion } from './useReducedMotion';

function Probe() {
  const reduced = useReducedMotion();
  return <Text testID="probe">{reduced ? 'reduced' : 'full'}</Text>;
}

it('defaults to full motion until the async read resolves, then reflects it', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const remove = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockReturnValue({ remove } as any);

  render(<Probe />);
  // Initial render (before the promise settles) is the safe default: motion on.
  expect(screen.getByTestId('probe')).toHaveTextContent('full');
  await waitFor(() =>
    expect(screen.getByTestId('probe')).toHaveTextContent('full'),
  );
});

it('reports reduced when the preference is enabled', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockReturnValue({ remove: jest.fn() } as any);

  render(<Probe />);
  await waitFor(() =>
    expect(screen.getByTestId('probe')).toHaveTextContent('reduced'),
  );
});

it('updates live when the preference toggles, and unsubscribes on unmount', async () => {
  let listener: ((value: boolean) => void) | undefined;
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const remove = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation((_event: string, cb: any) => {
      listener = cb;
      return { remove } as any;
    });

  const { unmount } = render(<Probe />);
  await waitFor(() =>
    expect(screen.getByTestId('probe')).toHaveTextContent('full'),
  );

  act(() => listener?.(true));
  expect(screen.getByTestId('probe')).toHaveTextContent('reduced');

  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
