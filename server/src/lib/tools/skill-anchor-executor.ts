/**
 * skill-anchor-executor.ts — wraps the S4 skill-anchor executor map into the
 * ToolExecutor interface that ConversationRuntime (S5) consumes.
 *
 * S6 (skill-team-conversion-design-v1.md §5 line 806-815). The S4 module ships
 * a `Record<string, ToolExecutor>` keyed by tool name, where each executor is
 * `(input: unknown) => Promise<ToolExecutionResult>` — pure data in, pure data
 * out. The runtime needs a ToolExecutor object with `.toolSpecs()` and
 * `.execute(name, input)`. This adapter just bridges the two without changing
 * any executor behavior.
 *
 * SSE side-effect names (S6 contract):
 *   register_agent → `event: 'node'`   (NOT 'sf-node')
 *   register_edge  → `event: 'edge'`   (NOT 'sf-edge')
 * Matches parser.ts <sf:node>→'node' / <sf:edge>→'edge' mapping + frontend
 * NodeEvent / EdgeEvent listeners in src/api/runSessions.ts.
 *
 * Context note (skill_id / sessionId):
 *   S4 executors are pure — they read `skill_id` / `agent_id` / `slot` straight
 *   from the LLM-supplied `input` JSON (e.g. `list_team_agents({skill_id})`).
 *   No constructor-level context injection is needed; the LLM is expected to
 *   pass the active skill id in every call (which is what the SKILL.md body
 *   prompt steers it to do). We keep the constructor available with optional
 *   `context` for future tools that need session-scoped state (e.g. a
 *   conditional tool that records artifacts under a session-specific dir).
 *
 * The unknown-tool fallback (a tool name the runtime sees but we don't have
 * an executor for) returns `isError: true` with a structured error in
 * `output` so the LLM can see what it asked for that doesn't exist. We do
 * NOT throw — that would propagate up to runtime's catch and pack as a
 * generic "tool threw" error, losing the specific "unknown tool" signal.
 */

import type { ToolSpec } from '../tool-spec';
import type {
  ToolExecutor as RuntimeToolExecutor,
  ToolExecutionResult,
} from '../conversation-runtime';
import { skillAnchorTools, skillAnchorExecutors } from './skill-anchors';

/**
 * Optional context that future skill-aware tools may need at execution time.
 * Today's 4 anchor tools don't read these — they get `skill_id` / `agent_id`
 * straight from the LLM input. We define the shape now so conditional tools
 * landing in later stories don't churn the constructor signature.
 */
export interface SkillAnchorContext {
  /** Active skill id (matches a directory under .shadowflow/skills/). */
  skill_id: string;
  /** SessionRecord.id from session-store; useful for per-session artifact dirs. */
  sessionId: string;
}

export class SkillAnchorToolExecutor implements RuntimeToolExecutor {
  constructor(private readonly context: SkillAnchorContext) {}

  /**
   * Same array returned every turn — the anchor tools are 'base' and never
   * toggle conditionally. Returning a fresh array (slice) defends against a
   * caller mutating the registry; today's runtime doesn't mutate but other
   * future ToolExecutors might.
   */
  toolSpecs(): ToolSpec[] {
    return skillAnchorTools.slice();
  }

  async execute(name: string, input: unknown): Promise<ToolExecutionResult> {
    const exec = skillAnchorExecutors[name];
    if (!exec) {
      return {
        output: { error: `unknown tool: ${name}` },
        isError: true,
      };
    }
    // S4 ToolExecutionResult shape is structurally identical to the runtime's
    // ToolExecutionResult — same fields, same semantics — so we can pass
    // through without translation. (They are declared in separate files to
    // avoid a cross-import cycle, not because they diverge.)
    const r = await exec(input);
    return {
      output: r.output,
      sseEvents: r.sseEvents,
      isError: r.isError,
    };
  }

  /** Accessor for tests / introspection. Read-only — context is constructor-bound. */
  get skillId(): string {
    return this.context.skill_id;
  }
  get sessionId(): string {
    return this.context.sessionId;
  }
}
