/**
 * Tests for the renderer registry + the shipped `defaultRendererRegistry`
 * (Azure DevOps #64; Technical Design §4, §7).
 *
 * `resolveRenderer` is the fail-safe lookup the controller relies on; the
 * default registry is the concrete map the app ships with. `spot_it` (#64),
 * `what_changed` (#65), `rule_flip` (#66), and `tiny_logic` (#67) are all wired.
 */

import { describe, expect, it } from 'vitest';

import type {
  LiquidCard,
  RuleFlipCard,
  SpotItCard,
  TinyLogicCard,
  WhatChangedCard,
} from '../cards/types';
import RuleFlipCardRenderer from '../templates/ruleFlip/RuleFlipCard';
import SpotItCardRenderer from '../templates/spotIt/SpotItCard';
import TinyLogicCardRenderer from '../templates/tinyLogic/TinyLogicCard';
import WhatChangedCardRenderer from '../templates/whatChanged/WhatChangedCard';
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

function whatChangedCard(): WhatChangedCard {
  return {
    cardId: 'wc-1',
    creatorHandle: '@test',
    templateType: 'what_changed',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 8,
    prompt: 'What changed?',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      previewMs: 2_000,
      timeLimitMs: 8_000,
      beforePattern: ['A', 'B', 'C'],
      afterPattern: ['A', 'X', 'C'],
      options: [
        { id: 'opt-1', label: 'First' },
        { id: 'opt-2', label: 'Second' },
      ],
      correctOptionId: 'opt-2',
    },
  };
}

function ruleFlipCard(): RuleFlipCard {
  return {
    cardId: 'rf-1',
    creatorHandle: '@test',
    templateType: 'rule_flip',
    category: 'cognitive_flexibility',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Apply the rule — it will change',
    puzzleDna: { mechanic: 'm', inputMode: 'tap', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      timeLimitMs: 15_000,
      stimulusDurationMs: 1_000,
      interStimulusGapMs: 300,
      initialRuleLabel: 'Tap red',
      flippedRuleLabel: 'Tap blue',
      flipAtStimulusIndex: 2,
      stimuli: [
        { id: 's0', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
        { id: 's1', label: 'B', matchesInitialRule: false, matchesFlippedRule: true },
        { id: 's2', label: 'C', matchesInitialRule: true, matchesFlippedRule: false },
      ],
    },
  };
}

function tinyLogicCard(): TinyLogicCard {
  return {
    cardId: 'tl-1',
    creatorHandle: '@test',
    templateType: 'tiny_logic',
    category: 'logical_reasoning',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 10,
    prompt: 'Pick the correct answer',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      stem: 'If all A are B, and X is A, then X is…',
      options: [
        { id: 'opt-1', label: 'Not B' },
        { id: 'opt-2', label: 'B' },
      ],
      correctOptionId: 'opt-2',
      timeLimitMs: 12_000,
    },
  };
}

describe('defaultRendererRegistry', () => {
  it('wires the spot_it renderer', () => {
    expect(defaultRendererRegistry.spot_it).toBe(SpotItCardRenderer);
  });

  it('wires the what_changed renderer', () => {
    expect(defaultRendererRegistry.what_changed).toBe(WhatChangedCardRenderer);
  });

  it('wires the rule_flip renderer', () => {
    expect(defaultRendererRegistry.rule_flip).toBe(RuleFlipCardRenderer);
  });

  it('wires the tiny_logic renderer', () => {
    expect(defaultRendererRegistry.tiny_logic).toBe(TinyLogicCardRenderer);
  });

  it('resolves the spot_it card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, spotItCard())).toBe(
      SpotItCardRenderer,
    );
  });

  it('resolves the what_changed card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, whatChangedCard())).toBe(
      WhatChangedCardRenderer,
    );
  });

  it('resolves the rule_flip card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, ruleFlipCard())).toBe(
      RuleFlipCardRenderer,
    );
  });

  it('resolves the tiny_logic card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, tinyLogicCard())).toBe(
      TinyLogicCardRenderer,
    );
  });

  it('returns undefined (fail-safe) for a template with no shipped renderer', () => {
    // Fabricate a card whose `templateType` has no registered slot (every real
    // template is now wired) to exercise the controller's fail-safe lookup path.
    const unregistered = {
      ...spotItCard(),
      templateType: 'no_such_template',
    } as unknown as LiquidCard;
    expect(resolveRenderer(defaultRendererRegistry, unregistered)).toBeUndefined();
  });
});
