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
  CodeBreakCard,
  LiquidCard,
  MemorySequenceCard,
  PatternChainCard,
  PrismPathCard,
  RuleFlipCard,
  SpotItCard,
  StepLogicCard,
  TinyLogicCard,
  WhatChangedCard,
} from '../cards/types';
import CodeBreakCardRenderer from '../templates/codeBreak/CodeBreakCard';
import CircuitFlowCardRenderer from '../templates/circuitFlow/CircuitFlowCard';
import MemorySequenceCardRenderer from '../templates/memorySequence/MemorySequenceCard';
import PatternChainCardRenderer from '../templates/patternChain/PatternChainCard';
import PrismPathCardRenderer from '../templates/prismPath/PrismPathCard';
import RuleFlipCardRenderer from '../templates/ruleFlip/RuleFlipCard';
import SignalSetCardRenderer from '../templates/signalSet/SignalSetCard';
import SpotItCardRenderer from '../templates/spotIt/SpotItCard';
import StepLogicCardRenderer from '../templates/stepLogic/StepLogicCard';
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

function memorySequenceCard(): MemorySequenceCard {
  return {
    cardId: 'ms-1',
    creatorHandle: '@test',
    templateType: 'memory_sequence',
    category: 'working_memory',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 12,
    prompt: 'Reproduce the flashed order',
    puzzleDna: { mechanic: 'm', inputMode: 'sequence', measuredSignals: ['recall'] },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 3,
      columns: 3,
      sequence: [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 2 },
      ],
      flashMs: 500,
      gapMs: 250,
      timeLimitMs: 12_000,
    },
  };
}

function patternChainCard(): PatternChainCard {
  return {
    cardId: 'pc-1',
    creatorHandle: '@test',
    templateType: 'pattern_chain',
    category: 'pattern_recognition',
    difficulty: 'easy',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 14,
    prompt: 'Continue the sequence',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      sequence: ['2', '4', '6'],
      steps: [
        {
          options: [
            { id: 'a', label: '7' },
            { id: 'b', label: '8' },
          ],
          correctOptionId: 'b',
        },
        {
          options: [
            { id: 'a', label: '9' },
            { id: 'b', label: '10' },
          ],
          correctOptionId: 'b',
        },
      ],
      timeLimitMs: 14_000,
    },
  };
}

function stepLogicCard(): StepLogicCard {
  return {
    cardId: 'sl-1',
    creatorHandle: '@test',
    templateType: 'step_logic',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 18,
    prompt: 'Work through the linked clues',
    puzzleDna: { mechanic: 'm', inputMode: 'choice', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      premise: 'Mia is taller than Jo. Jo is taller than Sam.',
      steps: [
        {
          stem: 'Who is the tallest?',
          options: [
            { id: 'a', label: 'Mia' },
            { id: 'b', label: 'Jo' },
          ],
          correctOptionId: 'a',
        },
        {
          stem: 'Who is the shortest?',
          options: [
            { id: 'a', label: 'Mia' },
            { id: 'b', label: 'Sam' },
          ],
          correctOptionId: 'b',
        },
      ],
      timeLimitMs: 18_000,
    },
  };
}

function codeBreakCard(): CodeBreakCard {
  return {
    cardId: 'cb-1',
    creatorHandle: '@test',
    templateType: 'code_break',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 25,
    prompt: 'Crack the hidden code',
    puzzleDna: { mechanic: 'm', inputMode: 'tap', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      palette: ['A', 'B', 'C'],
      codeLength: 3,
      secret: ['A', 'B', 'C'],
      maxGuesses: 8,
      timeLimitMs: 20_000,
    },
  };
}

function prismPathCard(): PrismPathCard {
  return {
    cardId: 'pp-1',
    creatorHandle: '@test',
    templateType: 'prism_path',
    category: 'logical_reasoning',
    difficulty: 'medium',
    evidenceTier: 'mechanic_mapped',
    reviewStatus: 'manual_reviewed',
    estimatedSeconds: 20,
    prompt: 'Route the beam',
    puzzleDna: { mechanic: 'm', inputMode: 'tap', measuredSignals: ['correct'] },
    explanation: { title: 't', body: 'b' },
    config: {
      rows: 4,
      columns: 4,
      entry: { row: 3, column: 0 },
      entryDirection: 'right',
      target: { row: 0, column: 3 },
      mirrors: [
        { id: 'm1', row: 3, column: 2, initialOrientation: 'slash' },
        { id: 'm2', row: 0, column: 2, initialOrientation: 'slash' },
      ],
      blockers: [],
      solution: [
        { mirrorId: 'm1', orientation: 'slash' },
        { mirrorId: 'm2', orientation: 'slash' },
      ],
      timeLimitMs: 20_000,
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

  it('wires the memory_sequence renderer', () => {
    expect(defaultRendererRegistry.memory_sequence).toBe(
      MemorySequenceCardRenderer,
    );
  });

  it('wires the pattern_chain renderer', () => {
    expect(defaultRendererRegistry.pattern_chain).toBe(
      PatternChainCardRenderer,
    );
  });

  it('wires the step_logic renderer', () => {
    expect(defaultRendererRegistry.step_logic).toBe(StepLogicCardRenderer);
  });

  it('wires the code_break renderer', () => {
    expect(defaultRendererRegistry.code_break).toBe(CodeBreakCardRenderer);
  });

  it('wires the prism_path renderer', () => {
    expect(defaultRendererRegistry.prism_path).toBe(PrismPathCardRenderer);
  });

  it('wires the signal_set and circuit_flow renderers', () => {
    expect(defaultRendererRegistry.signal_set).toBe(SignalSetCardRenderer);
    expect(defaultRendererRegistry.circuit_flow).toBe(CircuitFlowCardRenderer);
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

  it('resolves the memory_sequence card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, memorySequenceCard())).toBe(
      MemorySequenceCardRenderer,
    );
  });

  it('resolves the pattern_chain card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, patternChainCard())).toBe(
      PatternChainCardRenderer,
    );
  });

  it('resolves the step_logic card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, stepLogicCard())).toBe(
      StepLogicCardRenderer,
    );
  });

  it('resolves the code_break card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, codeBreakCard())).toBe(
      CodeBreakCardRenderer,
    );
  });

  it('resolves the prism_path card to its renderer', () => {
    expect(resolveRenderer(defaultRendererRegistry, prismPathCard())).toBe(
      PrismPathCardRenderer,
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
