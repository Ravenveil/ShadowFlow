/**
 * AgentGraph 自动生成算法主入口
 *
 * 本模块提供基于任务特征自动生成工作流的能力
 *
 * @example
 * ```typescript
 * import { TaskAnalyzer, WorkflowGenerator } from '@agentgraph/generator';
 *
 * // 1. 分析任务
 * const analyzer = new TaskAnalyzer();
 * const features = await analyzer.analyze('实现一个用户认证模块');
 *
 * // 2. 生成工作流
 * const generator = new WorkflowGenerator();
 * const workflow = await generator.generate(features);
 *
 * console.log(workflow.nodes, workflow.edges);
 * ```
 */

export * from './types/analyzer.js';
export * from './analyzer/task-analyzer.js';
export * from './generator/rule-engine.js';
export * from './generator/workflow-generator.js';

// 便捷函数
export { createTaskAnalyzer } from './analyzer/task-analyzer.js';
export { createRuleEngine } from './generator/rule-engine.js';
export { createWorkflowGenerator, generateWorkflow } from './generator/workflow-generator.js';
