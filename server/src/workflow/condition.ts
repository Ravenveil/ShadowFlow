/**
 * workflow/condition.ts — Conditional edge evaluator (Phase 2 decision A4b)
 *
 * Position in the Orchestration ⊥ Transport architecture:
 *   - Orchestration-internal: the scheduler calls `evaluate()` to decide
 *     whether a downstream node on a `kind: 'conditional'` edge gets
 *     activated; Transport never sees this code.
 *   - The DSL is expr-eval (https://github.com/silentmatt/expr-eval), the
 *     same family used by GitHub Actions / n8n / LangGraph conditional gates.
 *
 * SECURITY NOTE
 * -------------
 * The `condition` field is **owner-authored** in `team.yaml` (the same person
 * who owns the agent personas). It MUST NEVER receive runtime user input.
 * The yaml loader (`lib/team-yaml.ts`) only reads `team_id`s that match
 * `/^[a-z0-9][a-z0-9_-]{0,63}$/i` from the disk-resident library, so the
 * supply chain for `condition` strings is the same as for code in the repo.
 *
 * expr-eval is restricted further in this module:
 *   - `operators.assignment = false` → no `=` mutations of context
 *   - `operators.fndef = false`      → no inline function definitions
 *   - `allowMemberAccess = true`     → required so `prev.analyst.artifacts` works
 *
 * expr-eval has no `Function` / `eval` / `import` literals, no access to
 * `global` / `process` / `require`, and refuses to traverse prototypes —
 * see the upstream README "What's supported" table for the full surface.
 */

import { Parser } from 'expr-eval';
import type { NodeContext } from './types';

// ─── Parser singleton (constructed once; thread-safe for read-only use) ──────

const PARSER = new Parser({
  allowMemberAccess: true,
  operators: {
    add: true,
    comparison: true,
    concatenate: true,
    conditional: true,
    divide: true,
    factorial: false,
    logical: true,
    multiply: true,
    power: true,
    remainder: true,
    subtract: true,
    in: true,
    length: true,
    assignment: false, // hard-disable context mutation
    fndef: false,      // hard-disable inline function definitions
  },
});

// ─── Variable surface ────────────────────────────────────────────────────────

/**
 * Shape exposed to the expression. Conditions are written against:
 *   - `prev.<node_id>.status`     → 'pending' | 'running' | 'done' | 'failed' | 'skipped'
 *   - `prev.<node_id>.artifacts`  → space-joined string of artifact paths (expr-eval
 *                                   has no native array support, so we expose the
 *                                   `length` operator on the joined string instead)
 *   - `prev.<node_id>.duration`   → number, ms
 *   - `prev.<node_id>.error`      → '' if no error, otherwise the error kind
 *   - `node.id`                   → current node id (the *downstream* node being gated)
 *   - `node.team`                 → current team id
 *
 * Arrays are flattened to strings because expr-eval treats arrays as opaque
 * objects with no comparison ops. If `condition: prev.analyst.artifacts contains
 * "approved"` is desired, the team owner writes `"approved" in prev.analyst.artifacts`
 * which works because expr-eval's `in` operator does substring search on strings.
 */
interface PriorView {
  [nodeId: string]: {
    status: string;
    artifacts: string;
    duration: number;
    error: string;
  };
}

function buildVariables(ctx: NodeContext): Record<string, unknown> {
  const prev: PriorView = {};
  for (const [id, r] of ctx.priorResults.entries()) {
    prev[id] = {
      status: r.status,
      artifacts: r.artifacts.join(' '),
      duration: r.durationMs,
      error: r.error?.kind ?? '',
    };
  }
  return {
    prev,
    node: {
      id: ctx.node_id,
      team: ctx.team.team_id,
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate a `team.yaml` edge `condition` expression against the current run
 * context.
 *
 * Returns `false` on:
 *   - empty / whitespace-only condition (no gate → activate by default? NO —
 *     a `kind: 'conditional'` edge with no `condition` is malformed; we err
 *     on the side of "do not activate" so the team owner notices)
 *   - parse error in the expression
 *   - throw during evaluation (e.g. accessing a `prev.<id>` that does not
 *     exist yet)
 *   - non-truthy expression result
 *
 * Returns `true` only when the expression evaluates to a JS-truthy value.
 *
 * Errors are swallowed deliberately: scheduling decisions must not fail the
 * whole DAG run. Failures are surfaced via the observer / log channel by the
 * scheduler, not by throwing here.
 */
export function evaluate(condition: string, ctx: NodeContext): boolean {
  const expr = condition?.trim();
  if (!expr) return false;

  try {
    const ast = PARSER.parse(expr);
    const vars = buildVariables(ctx);
    // expr-eval's .d.ts `Value` type doesn't formally permit nested objects,
    // but the runtime resolves member access (`prev.analyst.status`) just fine
    // when given a plain Record. Cast to bypass the over-narrow typing.
    const result = ast.evaluate(vars as never);
    return Boolean(result);
  } catch {
    // Parse error or runtime error in the user-authored expression.
    // Returning false means the downstream node will be `skipped`.
    return false;
  }
}

/**
 * Diagnostic helper: parse-only check. Useful for `team.yaml` validators that
 * want to fail-fast at load time on syntactically invalid conditions.
 *
 * Returns `null` on success, error message on failure.
 */
export function validateExpression(condition: string): string | null {
  const expr = condition?.trim();
  if (!expr) return 'empty condition';
  try {
    PARSER.parse(expr);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
