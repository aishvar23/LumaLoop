/**
 * Tests for the renderer registry + the shipped `defaultRendererRegistry`
 * (Azure DevOps #64; Technical Design §4, §7).
 *
 * `resolveRenderer` is the fail-safe lookup the controller relies on; the
 * default registry is the concrete map the app ships with. Only `spot_it` is
 * wired so far — the remaining templates (#65-67) register their own slots.
 */

import { describe, expect, it } from 'vitest';

import type { LiquidCard, SpotItCard } from '../cards/types';
import SpotItCardRenderer from '../templates/spotIt/SpotItCard';
import { defaultRendererRegistry, resolveRenderer } from './rendererRegistry';

function spotItCard(): SpotItCard {
  return {
    cardId: 'spot-1',
    creatorHandle: '@test',
    templateType: 'spot_it',
    category: 'visual_attention',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 8,
    prompt: 'Tap the one that is different',
    puzzleDna: { mechanic: 'm', inputMode: 'tap', measuredSignals: ['correct_tap'] },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 2,
      columns: 2,
      baseElement: 'A',
      anomalyElement: 'B',
      anomalyRow: 0,
      anomalyColumn: 1,
      timeLimitMs: 10_000,
    },
  };
}

describe('defaultRendererRegistry', () => {
  it('wires the spot_it renderer', () => {
    expect(defaultRendererRegistry.spot_it).toBe(SpotItCardRenderer);
  });

  it('resolves the spot_it card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, spotItCard())).toBe(
      SpotItCardRenderer,
    );
  });

  it('returns undefined (fail-safe) for a template with no shipped renderer', () => {
    const tinyLogic = {
      ...spotItCard(),
      templateType: 'tiny_logic',
    } as unknown as LiquidCard;
    expect(resolveRenderer(defaultRendererRegistry, tinyLogic)).toBeUndefined();
  });
});
