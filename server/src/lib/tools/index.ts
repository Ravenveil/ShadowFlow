/**
 * tools/index.ts — S4 module barrel.
 *
 * Re-exports the SkillAnchor tool family so callers (S5 ConversationRuntime,
 * S6 runSkillAssembler) can pull both the ToolSpec catalog and the executor
 * dispatch table from one import path.
 */

export {
  skillAnchorTools,
  skillAnchorExecutors,
  type ToolExecutionResult,
  type ToolExecutor,
} from './skill-anchors';
