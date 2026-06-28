// Ported from web `src/templates/matrixReasoning/matrixReasoningEvaluator.test.ts`;
// source of truth is the web app — keep in sync.
import { evaluateMatrixReasoningSelection } from './matrixReasoningEvaluator';

describe('evaluateMatrixReasoningSelection', () => {
  const answer = { correctOptionId: 'opt-correct' };

  it('marks the correct option correct with no distractor', () => {
    expect(evaluateMatrixReasoningSelection(answer, 'opt-correct')).toEqual({
      isCorrect: true,
      selectedOptionId: 'opt-correct',
      distractorOptionId: null,
    });
  });

  it('marks a wrong option incorrect and records it as the distractor', () => {
    expect(evaluateMatrixReasoningSelection(answer, 'opt-b')).toEqual({
      isCorrect: false,
      selectedOptionId: 'opt-b',
      distractorOptionId: 'opt-b',
    });
  });

  it('treats an unknown option id as simply incorrect', () => {
    const result = evaluateMatrixReasoningSelection(answer, 'nope');
    expect(result.isCorrect).toBe(false);
    expect(result.distractorOptionId).toBe('nope');
  });
});
