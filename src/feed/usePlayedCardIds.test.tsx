import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import { usePlayedCardIds } from './usePlayedCardIds';

/**
 * A from() that resolves a `user_game_scores` select/eq to scripted rows.
 * Chainable (each `.eq()` returns the builder) and thenable (awaiting resolves
 * to `result`), so the chained `.eq('user_id').eq('ever_correct', true)` query works.
 */
function clientReturning(result: { data: unknown; error: unknown }): AuthClient {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (r: unknown) => unknown) => resolve(result),
  });
  return { from: () => builder } as unknown as AuthClient;
}

function Harness({
  client,
  userId,
}: {
  client: AuthClient;
  userId: string | null;
}) {
  const { cardIds, ready } = usePlayedCardIds(client, userId);
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="ids">{[...cardIds].sort().join(',')}</span>
    </div>
  );
}

const ready = () => screen.getByTestId('ready').textContent;
const ids = () => screen.getByTestId('ids').textContent;

describe('usePlayedCardIds', () => {
  it('is ready immediately with an empty set when signed out', () => {
    render(
      <Harness client={clientReturning({ data: [], error: null })} userId={null} />,
    );
    expect(ready()).toBe('true');
    expect(ids()).toBe('');
  });

  it('resolves the played set for a signed-in user', async () => {
    render(
      <Harness
        client={clientReturning({
          data: [{ card_id: 'a' }, { card_id: 'b' }],
          error: null,
        })}
        userId="user-1"
      />,
    );
    await waitFor(() => expect(ready()).toBe('true'));
    expect(ids()).toBe('a,b');
  });

  it('still becomes ready (empty) when the query errors — never blocks the feed', async () => {
    render(
      <Harness
        client={clientReturning({ data: null, error: { message: 'rls' } })}
        userId="user-1"
      />,
    );
    await waitFor(() => expect(ready()).toBe('true'));
    expect(ids()).toBe('');
  });
});
