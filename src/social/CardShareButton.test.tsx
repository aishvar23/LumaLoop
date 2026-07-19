import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import CardShareButton from './CardShareButton';
import { SocialConfigProvider } from './SocialContext';

/** Fake client capturing game_shares inserts. */
function fakeClient() {
  const inserts: unknown[] = [];
  const client = {
    from() {
      return {
        insert: (row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as AuthClient;
  return { client, inserts };
}

describe('CardShareButton', () => {
  it('renders nothing without a social provider (engine stays auth-free)', () => {
    const { container } = render(
      <CardShareButton cardId="spot_it-1" outcome="correct" points={120} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when signed out (no userId)', () => {
    const { client } = fakeClient();
    const { container } = render(
      <SocialConfigProvider value={{ client, userId: null }}>
        <CardShareButton cardId="spot_it-1" outcome="correct" points={120} />
      </SocialConfigProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shares the game with its outcome + points, then shows a shared state', async () => {
    const { client, inserts } = fakeClient();
    render(
      <SocialConfigProvider value={{ client, userId: 'u1' }}>
        <CardShareButton cardId="spot_it-1" outcome="correct" points={120} />
      </SocialConfigProvider>,
    );
    const btn = screen.getByTestId('card-share');
    expect(btn).toHaveTextContent(/share to your status/i);
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'shared'));
    expect(btn).toHaveTextContent(/shared/i);
    expect(btn).toBeDisabled();
    expect(inserts[0]).toEqual({
      user_id: 'u1',
      card_id: 'spot_it-1',
      outcome: 'correct',
      points: 120,
    });
  });
});
