/**
 * Tests for the mobile `game_plays` recorder (accounts pivot — mirrors web
 * `src/feed/useRecordGamePlay.test.tsx`). The Supabase client is a hand-written
 * fake (no real backend); the insert is best-effort/fire-and-forget so each case
 * flushes the microtask queue before asserting.
 */
import { renderHook } from '@testing-library/react-native';

import { createFakeAuthClient } from '../auth/testFakes';
import { catalog } from '../core/cards/catalog';
import type { LiquidCard } from '../core/cards/types';
import type { CardResolution } from '../core/templates/contract';
import type { CardScore } from '../core/feed/scoring';
import { useRecordGamePlay } from './useRecordGamePlay';

const card: LiquidCard = catalog[0];
const getCardById = (id: string): LiquidCard | undefined =>
  id === card.cardId ? card : undefined;

function resolution(overrides: Partial<CardResolution> = {}): CardResolution {
  return {
    cardId: card.cardId,
    resolutionType: 'correct',
    isCorrect: true,
    elapsedMs: 2000,
    interactionElapsedMs: 1500,
    attemptCount: 1,
    signals: {},
    ...overrides,
  };
}

const score: CardScore = { points: 120, correct: true, streak: 3, combo: 1.2 };

describe('useRecordGamePlay', () => {
  it('inserts a game_plays row for the signed-in user with the score points', async () => {
    const auth = createFakeAuthClient();
    const { result } = renderHook(() =>
      useRecordGamePlay({ userId: 'user-9', getCardById, client: auth.client }),
    );
    result.current(0, resolution(), score);
    await Promise.resolve();
    expect(auth.gamePlayInserts).toHaveLength(1);
    expect(auth.gamePlayInserts[0]).toMatchObject({
      user_id: 'user-9',
      card_id: card.cardId,
      template_type: card.templateType,
      category: card.category,
      is_correct: true,
      points: 120,
      elapsed_ms: 1500,
    });
  });

  it('records NOTHING when signed out (userId null)', async () => {
    const auth = createFakeAuthClient();
    const { result } = renderHook(() =>
      useRecordGamePlay({ userId: null, getCardById, client: auth.client }),
    );
    result.current(0, resolution(), score);
    await Promise.resolve();
    expect(auth.gamePlayInserts).toHaveLength(0);
  });

  it('records NOTHING for an unknown card', async () => {
    const auth = createFakeAuthClient();
    const { result } = renderHook(() =>
      useRecordGamePlay({ userId: 'u', getCardById, client: auth.client }),
    );
    result.current(0, resolution({ cardId: 'does-not-exist' }), score);
    await Promise.resolve();
    expect(auth.gamePlayInserts).toHaveLength(0);
  });
});
