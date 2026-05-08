/**
 * Safe expression evaluator — replaces all new Function() calls.
 *
 * Uses expr-eval which supports arithmetic, comparisons, logical operators,
 * and property access, but NO function calls, assignment, or DOM access.
 */

import { Parser } from 'expr-eval';

const parser = new Parser({
  operators: {
    logical: true,
    comparison: true,
    'in': true,
    'not in': true,
  },
});

// Reject expressions that reference dangerous globals even before parsing.
const BLOCKED_PATTERNS = [
  /\bfetch\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\beval\b/,
  /\bFunction\b/,
  /\bimport\b/,
  /\brequire\b/,
  /\bprocess\b/,
  /\bglobalThis\b/,
  /\bself\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\b__proto__\b/,
  /\bprototype\b/,
  /\bconstructor\b/,
];

export class SafeExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeExpressionError';
  }
}

function guardExpression(expression: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(expression)) {
      throw new SafeExpressionError(
        `Expression contains blocked pattern: ${pattern.source}`
      );
    }
  }
}

/**
 * Evaluate a boolean condition expression.
 * @param expression  e.g. "count > 5 and status == 'active'"
 * @param variables   key-value scope
 */
export function evaluateBooleanExpression(
  expression: string,
  variables: Record<string, unknown>
): boolean {
  guardExpression(expression);
  try {
    const expr = parser.parse(expression);
    return Boolean(expr.evaluate(variables));
  } catch (err) {
    throw new SafeExpressionError(
      `Failed to evaluate expression "${expression}": ${(err as Error).message}`
    );
  }
}

/**
 * Evaluate a filter predicate expression against a single item.
 * @param expression  e.g. "item.price > 100"
 * @param item        the object being tested
 */
export function evaluateFilterExpression(
  expression: string,
  item: Record<string, unknown>
): boolean {
  guardExpression(expression); // throws SafeExpressionError on blocked patterns
  try {
    const expr = parser.parse(expression);
    return Boolean(expr.evaluate({ item }));
  } catch (err) {
    // Re-throw security errors so callers can distinguish policy violations from
    // benign evaluation failures (e.g. undefined property access on a single item).
    if (err instanceof SafeExpressionError) throw err;
    // Runtime evaluation errors (e.g. missing property) silently exclude the item.
    return false;
  }
}

/**
 * Evaluate a transform/custom expression that returns an arbitrary value.
 * @param expression  e.g. "data.value * 2"
 * @param scope       variables available to the expression
 */
export function evaluateValueExpression(
  expression: string,
  scope: Record<string, unknown>
): unknown {
  guardExpression(expression);
  try {
    const expr = parser.parse(expression);
    return expr.evaluate(scope);
  } catch (err) {
    throw new SafeExpressionError(
      `Failed to evaluate expression "${expression}": ${(err as Error).message}`
    );
  }
}
