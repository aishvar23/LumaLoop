/**
 * Tests for the Rule Flip evaluator (Azure DevOps #66; Design §9.3; Tech §7).
 *
 * The evaluator is the renderer's single source of truth for scoring, so these
 * tests pin every §9.3 measure independently: per-stimulus correctness across
 * the flip boundary, pre/post-flip accuracy (with omissions as errors), switch
 * latency, and perseveration (the player keeping the OLD rule after the flip).
 */

import type { RuleFlipCard } from '../../cards/types';
import {
  RULE_FLIP_PASS_ACCURACY,
  evaluateRuleFlip,
  type RuleFlipResponse,
  type RuleFlipRules,
} from './ruleFlipEvaluator';

type Stimulus = RuleFlipCard['config']['stimuli'][number];

/**
 * Build a rules slice. Stimuli alternate so the initial and flipped rules
 * disagree on every item (`matchesInitialRule !== matchesFlippedRule`), which
 * makes perseveration vs. plain error distinguishable. The flip lands at index
 * `flipAt` (default 2): indices 0-1 are pre-flip, 2+ are post-flip.
 */
function rules(
  overrides: { flipAt?: number; stimuli?: Stimulus[] } = {},
): RuleFlipRules {
  const stimuli: Stimulus[] = overrides.stimuli ?? [
    { id: 's0', label: 'A', matchesInitialRule: true, matchesFlippedRule: false },
    { id: 's1', label: 'B', matchesInitialRule: false, matchesFlippedRule: true },
    { id: 's2', label: 'C', matchesInitialRule: true, matchesFlippedRule: false },
    { id: 's3', label: 'D', matchesInitialRule: false, matchesFlippedRule: true },
  ];
  return { flipAtStimulusIndex: overrides.flipAt ?? 2, stimuli };
}

/** Expected response under the INITIAL rule for the default stimuli above. */
const initialExpected: RuleFlipResponse['response'][] = [
  'match', // s0 matchesInitialRule
  'no_match', // s1
  'match', // s2
  'no_match', // s3
];

/** Expected response under the FLIPPED rule for the default stimuli above. */
const flippedExpected: RuleFlipResponse['response'][] = [
  'no_match', // s0 matchesFlippedRule false
  'match', // s1
  'no_match', // s2
  'match', // s3
];

function respond(
  index: number,
  response: RuleFlipResponse['response'],
  responseTimeMs = 400,
): RuleFlipResponse {
  return { stimulusIndex: index, response, responseTimeMs };
}

// ---------------------------------------------------------------------------
// Per-stimulus correctness across the flip boundary.
// ---------------------------------------------------------------------------

describe('per-stimulus correctness across the flip boundary', () => {
  it('scores pre-flip stimuli under the INITIAL rule and post-flip under the FLIPPED rule', () => {
    const { outcomes } = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, 'match'), // pre-flip, correct under initial
      respond(1, 'no_match'), // pre-flip, correct under initial
      respond(2, 'no_match'), // post-flip, correct under flipped
      respond(3, 'match'), // post-flip, correct under flipped
    ]);

    expect(outcomes.map((o) => o.phase)).toEqual([
      'pre_flip',
      'pre_flip',
      'post_flip',
      'post_flip',
    ]);
    expect(outcomes.map((o) => o.activeRule)).toEqual([
      'initial',
      'initial',
      'flipped',
      'flipped',
    ]);
    expect(outcomes.every((o) => o.isCorrect)).toBe(true);
  });

  it('treats the flip index itself as the FIRST post-flip stimulus (>= boundary)', () => {
    const { outcomes } = evaluateRuleFlip(rules({ flipAt: 2 }), []);
    expect(outcomes[1].phase).toBe('pre_flip'); // index 1 < 2
    expect(outcomes[2].phase).toBe('post_flip'); // index 2 == flipAt
    expect(outcomes[2].expectedResponse).toBe(flippedExpected[2]);
    expect(outcomes[1].expectedResponse).toBe(initialExpected[1]);
  });
});

// ---------------------------------------------------------------------------
// Pre/post accuracy — omissions count as incorrect.
// ---------------------------------------------------------------------------

describe('pre-flip and post-flip accuracy', () => {
  it('computes both phase accuracies over every stimulus in the phase', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, 'match'), // pre correct
      respond(1, 'match'), // pre WRONG (expected no_match)
      respond(2, 'no_match'), // post correct
      respond(3, 'no_match'), // post WRONG (expected match)
    ]);

    expect(result.preFlipTotal).toBe(2);
    expect(result.preFlipCorrect).toBe(1);
    expect(result.preFlipAccuracy).toBe(0.5);
    expect(result.postFlipTotal).toBe(2);
    expect(result.postFlipCorrect).toBe(1);
    expect(result.postFlipAccuracy).toBe(0.5);
  });

  it('counts a non-response (omission) as incorrect in the accuracy denominator', () => {
    // Only respond to one pre-flip stimulus correctly; everything else omitted.
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [respond(0, 'match')]);

    expect(result.preFlipCorrect).toBe(1);
    expect(result.preFlipAccuracy).toBe(0.5); // 1 of 2 pre-flip, omission = wrong
    expect(result.postFlipCorrect).toBe(0);
    expect(result.postFlipAccuracy).toBe(0); // both post-flip omitted
    expect(result.outcomes[1].responded).toBe(false);
    expect(result.outcomes[1].isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Switch latency.
// ---------------------------------------------------------------------------

describe('switch latency', () => {
  it('reports the RT of the first responded post-flip stimulus', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, 'match', 200),
      respond(2, 'no_match', 850), // first post-flip response
      respond(3, 'match', 300),
    ]);
    expect(result.switchLatencyMs).toBe(850);
  });

  it('skips post-flip omissions and uses the first index actually responded to', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      // index 2 omitted entirely; first post-flip RESPONSE is index 3.
      respond(3, 'match', 640),
    ]);
    expect(result.switchLatencyMs).toBe(640);
  });

  it('is null when there is no post-flip response', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [respond(0, 'match', 200)]);
    expect(result.switchLatencyMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Perseveration — kept the OLD rule after the flip.
// ---------------------------------------------------------------------------

describe('perseveration', () => {
  it('counts post-flip responses that are correct under the OLD rule but wrong under the new one', () => {
    // After the flip (index >= 2) the player keeps answering by the INITIAL rule.
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, initialExpected[0]), // pre, correct
      respond(1, initialExpected[1]), // pre, correct
      respond(2, initialExpected[2]), // post, OLD-rule answer -> perseveration
      respond(3, initialExpected[3]), // post, OLD-rule answer -> perseveration
    ]);

    expect(result.perseverationCount).toBe(2);
    expect(result.outcomes[2].isPerseveration).toBe(true);
    expect(result.outcomes[2].isCorrect).toBe(false);
    // Pre-flip old-rule answers are simply correct, never perseveration.
    expect(result.outcomes[0].isPerseveration).toBe(false);
    expect(result.postFlipCorrect).toBe(0);
  });

  it('does not count a post-flip error that matches NEITHER rule as perseveration', () => {
    // Build a stimulus where initial and flipped agree (both expect no_match),
    // so any wrong answer is a plain error, never perseveration.
    const agreeing: Stimulus[] = [
      { id: 'p0', label: 'A', matchesInitialRule: true, matchesFlippedRule: true },
      { id: 'p1', label: 'B', matchesInitialRule: false, matchesFlippedRule: false },
    ];
    const result = evaluateRuleFlip({ flipAtStimulusIndex: 1, stimuli: agreeing }, [
      respond(1, 'match'), // expected no_match under BOTH rules -> just wrong
    ]);
    expect(result.outcomes[1].isCorrect).toBe(false);
    expect(result.outcomes[1].isPerseveration).toBe(false);
    expect(result.perseverationCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Overall correctness + all-correct / all-wrong / edge cases.
// ---------------------------------------------------------------------------

describe('overall correctness and aggregates', () => {
  it('resolves CORRECT for an all-correct run', () => {
    const responses = [
      respond(0, initialExpected[0]),
      respond(1, initialExpected[1]),
      respond(2, flippedExpected[2]),
      respond(3, flippedExpected[3]),
    ];
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), responses);
    expect(result.totalCorrect).toBe(4);
    expect(result.overallAccuracy).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  it('resolves INCORRECT for an all-wrong run', () => {
    const responses = [
      respond(0, flippedExpected[0]), // wrong pre-flip
      respond(1, flippedExpected[1]),
      respond(2, initialExpected[2]), // wrong post-flip (perseveration)
      respond(3, initialExpected[3]),
    ];
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), responses);
    expect(result.totalCorrect).toBe(0);
    expect(result.overallAccuracy).toBe(0);
    expect(result.isCorrect).toBe(false);
    expect(result.perseverationCount).toBe(2);
  });

  it('requires every Rule Flip step to be correct', () => {
    // One missed step should fail the card even when most responses are right.
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, initialExpected[0]), // correct
      respond(1, initialExpected[1]), // correct
      respond(2, flippedExpected[2]), // correct
      respond(3, initialExpected[3]), // wrong
    ]);
    expect(result.overallAccuracy).toBe(0.75);
    expect(RULE_FLIP_PASS_ACCURACY).toBe(1);
    expect(result.isCorrect).toBe(false);
  });

  it('handles an empty stimulus list without NaN and resolves incorrect', () => {
    const result = evaluateRuleFlip({ flipAtStimulusIndex: 0, stimuli: [] }, []);
    expect(result.totalStimuli).toBe(0);
    expect(result.preFlipAccuracy).toBe(0);
    expect(result.postFlipAccuracy).toBe(0);
    expect(result.overallAccuracy).toBe(0);
    expect(result.switchLatencyMs).toBeNull();
    expect(result.isCorrect).toBe(false);
  });

  it('treats a flip index past the end as an all-pre-flip card (no post-flip phase)', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 99 }), [
      respond(0, initialExpected[0]),
      respond(1, initialExpected[1]),
      respond(2, initialExpected[2]),
      respond(3, initialExpected[3]),
    ]);
    expect(result.preFlipTotal).toBe(4);
    expect(result.postFlipTotal).toBe(0);
    expect(result.postFlipAccuracy).toBe(0);
    expect(result.switchLatencyMs).toBeNull();
    expect(result.perseverationCount).toBe(0);
    expect(result.isCorrect).toBe(true); // all four correct under the initial rule
  });

  it('ignores duplicate responses for the same index (first wins)', () => {
    const result = evaluateRuleFlip(rules({ flipAt: 2 }), [
      respond(0, initialExpected[0], 100), // first wins
      respond(0, flippedExpected[0], 999), // ignored
    ]);
    expect(result.outcomes[0].response).toBe(initialExpected[0]);
    expect(result.outcomes[0].responseTimeMs).toBe(100);
    expect(result.outcomes[0].isCorrect).toBe(true);
  });
});
