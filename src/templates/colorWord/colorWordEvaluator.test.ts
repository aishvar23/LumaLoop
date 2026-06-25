import { describe, expect, it } from 'vitest';

import {
  COLOR_WORD_PASS_ACCURACY,
  evaluateColorWord,
  type ColorWordResponse,
  type ColorWordRules,
} from './colorWordEvaluator';

const rules: ColorWordRules = {
  trials: [
    // Congruent: the word RED printed in red ink.
    { id: 't0', word: 'RED', inkColorId: 'red', congruent: true },
    // Incongruent: the word RED printed in blue ink — respond BLUE.
    { id: 't1', word: 'RED', inkColorId: 'blue', congruent: false },
    // Incongruent: the word BLUE printed in green ink — respond GREEN.
    { id: 't2', word: 'BLUE', inkColorId: 'green', congruent: false },
    // Congruent: GREEN in green.
    { id: 't3', word: 'GREEN', inkColorId: 'green', congruent: true },
  ],
};

function respond(
  trialIndex: number,
  pickedColorId: string,
  responseTimeMs = 500,
): ColorWordResponse {
  return { trialIndex, pickedColorId, responseTimeMs };
}

describe('evaluateColorWord', () => {
  it('scores a perfect run as correct with full accuracy', () => {
    const result = evaluateColorWord(rules, [
      respond(0, 'red', 400),
      respond(1, 'blue', 600),
      respond(2, 'green', 700),
      respond(3, 'green', 300),
    ]);
    expect(result.isCorrect).toBe(true);
    expect(result.overallAccuracy).toBe(1);
    expect(result.totalCorrect).toBe(4);
    expect(result.falseTaps).toBe(0);
    expect(result.omissions).toBe(0);
  });

  it('splits accuracy by congruency (the interference effect)', () => {
    // All congruent correct, all incongruent wrong (responded to the WORD).
    const result = evaluateColorWord(rules, [
      respond(0, 'red'), // congruent, correct
      respond(1, 'red'), // incongruent, picked word -> wrong
      respond(2, 'blue'), // incongruent, picked word -> wrong
      respond(3, 'green'), // congruent, correct
    ]);
    expect(result.congruentTotal).toBe(2);
    expect(result.congruentAccuracy).toBe(1);
    expect(result.incongruentTotal).toBe(2);
    expect(result.incongruentAccuracy).toBe(0);
    expect(result.falseTaps).toBe(2);
    expect(result.isCorrect).toBe(false);
  });

  it('counts a wrong swatch pick as a false tap, not an omission', () => {
    const result = evaluateColorWord(rules, [respond(1, 'green')]);
    expect(result.falseTaps).toBe(1);
    expect(result.omissions).toBe(3);
    expect(result.outcomes[1].isFalseTap).toBe(true);
    expect(result.outcomes[1].isCorrect).toBe(false);
  });

  it('treats a non-response as an omission (incorrect), not a false tap', () => {
    const result = evaluateColorWord(rules, [
      respond(0, 'red'),
      respond(3, 'green'),
    ]);
    expect(result.omissions).toBe(2);
    expect(result.falseTaps).toBe(0);
    expect(result.totalCorrect).toBe(2);
    expect(result.overallAccuracy).toBe(0.5);
    expect(result.isCorrect).toBe(false);
  });

  it('keeps the FIRST response per trial when duplicates are supplied', () => {
    const result = evaluateColorWord(rules, [
      respond(0, 'red', 100), // first: correct
      respond(0, 'blue', 999), // later: ignored
    ]);
    expect(result.outcomes[0].pickedColorId).toBe('red');
    expect(result.outcomes[0].responseTimeMs).toBe(100);
    expect(result.outcomes[0].isCorrect).toBe(true);
  });

  it('ignores responses for out-of-range trial indices', () => {
    const result = evaluateColorWord(rules, [
      respond(0, 'red'),
      respond(99, 'red'),
    ]);
    expect(result.totalCorrect).toBe(1);
    expect(result.totalTrials).toBe(4);
  });

  it('computes mean response time over responded trials only', () => {
    const result = evaluateColorWord(rules, [
      respond(0, 'red', 200),
      respond(1, 'blue', 400),
    ]);
    expect(result.meanResponseTimeMs).toBe(300);
  });

  it('reports null mean response time when nothing was responded', () => {
    const result = evaluateColorWord(rules, []);
    expect(result.meanResponseTimeMs).toBeNull();
    expect(result.omissions).toBe(4);
  });

  it('reports accuracy 0 (no NaN) and not-correct for an empty trial set', () => {
    const result = evaluateColorWord({ trials: [] }, []);
    expect(result.overallAccuracy).toBe(0);
    expect(result.congruentAccuracy).toBe(0);
    expect(result.incongruentAccuracy).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('requires full accuracy to pass', () => {
    expect(COLOR_WORD_PASS_ACCURACY).toBe(1);
    const result = evaluateColorWord(rules, [
      respond(0, 'red'),
      respond(1, 'blue'),
      respond(2, 'green'),
      // trial 3 omitted -> not perfect
    ]);
    expect(result.isCorrect).toBe(false);
  });
});
