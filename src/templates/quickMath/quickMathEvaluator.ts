/**
 * Quick Math answer evaluator (Design §9; Technical Design §7).
 *
 * The Quick Math mechanic shows a short arithmetic problem and asks the player
 * to pick the correct value from numeric options. Crucially, the answer is NOT
 * trusted from an authored number: the `expression` is stored structurally
 * (operands + operators) and this pure evaluator COMPUTES the canonical value
 * with standard operator precedence (`*`/`/` before `+`/`-`, left-to-right
 * within a precedence band). Correctness is then "the chosen option's numeric
 * value equals the computed result", which the renderer routes through here.
 *
 * This function is PURE and React-free, so it is trivially unit-testable and is
 * the single source of truth for both the computed answer and the selection
 * decision. Catalog validation also uses {@link computeQuickMath} to verify that
 * the authored `correctOptionId` really is the option whose value equals the
 * computed result.
 */

import type {
  QuickMathExpression,
  QuickMathOperator,
  QuickMathCard,
} from '../../cards/types';

/** A numeric option as authored on a quick_math card. */
type QuickMathOption = QuickMathCard['config']['options'][number];

/**
 * The slice of a {@link QuickMathCard} config the selection evaluator needs: the
 * structured expression, the options (to resolve a picked id to its value), and
 * the authored correct option id.
 */
export type QuickMathAnswerKey = Pick<
  QuickMathCard['config'],
  'expression' | 'options' | 'correctOptionId'
>;

/**
 * The result of evaluating a single committed selection.
 *
 * `computedResult` is the value the evaluator derived from the expression (the
 * single source of truth for "the right answer"). `distractorOptionId` is the
 * chosen wrong option id when incorrect, else `null`.
 */
export type QuickMathSelectionResult = {
  isCorrect: boolean;
  selectedOptionId: string;
  computedResult: number;
  distractorOptionId: string | null;
};

function applyOperator(
  left: number,
  operator: QuickMathOperator,
  right: number,
): number {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    default: {
      // Exhaustive: an unhandled operator makes this fail to compile.
      const exhaustive: never = operator;
      return exhaustive;
    }
  }
}

/**
 * Compute the canonical value of a structured arithmetic expression using
 * standard precedence: a first pass folds every `*`/`/` into its left neighbour,
 * then a second pass folds the remaining `+`/`-` left-to-right. Throws on a
 * malformed expression (operands/operators length mismatch or empty operands) so
 * a mis-authored card is caught loudly by validation rather than scored wrong.
 */
export function computeQuickMath(expression: QuickMathExpression): number {
  const { operands, operators } = expression;
  if (operands.length === 0) {
    throw new Error('quick_math expression has no operands');
  }
  if (operators.length !== operands.length - 1) {
    throw new Error(
      `quick_math expression operator/operand mismatch: ${operators.length} operators for ${operands.length} operands`,
    );
  }

  // First pass: collapse high-precedence */ into a flat list of +/- terms.
  const terms: number[] = [operands[0]];
  const lowOps: QuickMathOperator[] = [];
  for (let i = 0; i < operators.length; i += 1) {
    const operator = operators[i];
    const next = operands[i + 1];
    if (operator === '*' || operator === '/') {
      const left = terms[terms.length - 1];
      terms[terms.length - 1] = applyOperator(left, operator, next);
    } else {
      lowOps.push(operator);
      terms.push(next);
    }
  }

  // Second pass: fold the remaining +/- left-to-right.
  let result = terms[0];
  for (let i = 0; i < lowOps.length; i += 1) {
    result = applyOperator(result, lowOps[i], terms[i + 1]);
  }
  return result;
}

/**
 * Evaluate a committed option selection. Computes the canonical result from the
 * expression, then resolves the picked option id to its numeric value and
 * decides correctness as "chosen value equals computed result". The renderer
 * routes every selection through here rather than comparing numbers itself.
 *
 * An unknown option id resolves to no value and is therefore incorrect (and
 * reported as the chosen distractor), without special-casing.
 */
export function evaluateQuickMathSelection(
  answer: QuickMathAnswerKey,
  selectedOptionId: string,
): QuickMathSelectionResult {
  const computedResult = computeQuickMath(answer.expression);
  const selected: QuickMathOption | undefined = answer.options.find(
    (option) => option.id === selectedOptionId,
  );
  const isCorrect =
    selected !== undefined && selected.value === computedResult;
  return {
    isCorrect,
    selectedOptionId,
    computedResult,
    distractorOptionId: isCorrect ? null : selectedOptionId,
  };
}
