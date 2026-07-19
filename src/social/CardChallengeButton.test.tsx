import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CardChallengeButton from './CardChallengeButton';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CardChallengeButton', () => {
  it('shares a challenge URL containing the cardId and score via navigator.share', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });

    render(<CardChallengeButton cardId="spot_it-1" points={420} />);
    fireEvent.click(screen.getByTestId('card-challenge'));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0][0] as { text: string; url: string };
    expect(arg.url).toContain('/c/spot_it-1');
    expect(arg.url).toContain('s=420');
    expect(arg.text).toMatch(/420/);
  });

  it('falls back to clipboard copy and shows "Link copied!" when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<CardChallengeButton cardId="spot_it-1" points={420} />);
    const btn = screen.getByTestId('card-challenge');
    fireEvent.click(btn);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('s=420');
    await waitFor(() => expect(btn).toHaveTextContent(/link copied/i));
  });
});
