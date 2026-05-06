/**
 * 节点执行器索引
 * 导出所有节点执行器
 */

// 基类
export { BaseNodeExecutor, ExecutionError, ValidationError, TimeoutError } from './base-node-executor';

// 输入类节点
export { ReceiveExecutor } from './input/receive-executor';
export { UnderstandExecutor } from './input/understand-executor';
export { ClarifyExecutor } from './input/clarify-executor';

// 规划类节点
export { AnalyzeExecutor } from './planning/analyze-executor';
export { DesignExecutor } from './planning/design-executor';
export { DecomposeExecutor } from './planning/decompose-executor';
export { SpecExecutor } from './planning/spec-executor';

// 执行类节点
export { CodeExecutor } from './execution/code-executor';
export { TestExecutor } from './execution/test-executor';
export { GenerateExecutor } from './execution/generate-executor';
export { TransformExecutor } from './execution/transform-executor';

// 审核类节点
export { ReviewExecutor } from './review/review-executor';
export { ValidateExecutor } from './review/validate-executor';
export { SecurityExecutor } from './review/security-executor';

// 决策类节点
export { BranchExecutor } from './decision/branch-executor';
export { MergeExecutor } from './decision/merge-executor';
export { LoopExecutor } from './decision/loop-executor';

// 协调类节点
export { ParallelExecutor } from './coordinate/parallel-executor';
export { SequenceExecutor } from './coordinate/sequence-executor';
export { AssignExecutor } from './coordinate/assign-executor';
export { AggregateExecutor } from './coordinate/aggregate-executor';
export { BarrierExecutor } from './coordinate/barrier-executor';
export { NegotiateExecutor } from './coordinate/negotiate-executor';

// 输出类节点
export { ReportExecutor } from './output/report-executor';
export { StoreExecutor } from './output/store-executor';
export { NotifyExecutor } from './output/notify-executor';

// 注册中心
export {
  NodeExecutorRegistry,
  globalNodeExecutorRegistry,
  registerCustomExecutor,
  createAndExecute
} from './node-executor-registry';

// 节点定义
export {
  ALL_NODES,
  INPUT_NODES,
  PLANNING_NODES,
  EXECUTION_NODES,
  REVIEW_NODES,
  DECISION_NODES,
  COORDINATE_NODES,
  OUTPUT_NODES,
  getNodesByCategory,
  getNodeById
} from './node-definitions';
