/**
 * Parallel 节点执行器
 * 并行执行多个任务
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 并行执行模式
 */
type ParallelMode = 'concurrent' | 'parallel' | 'distributed';

/**
 * Parallel 节点配置
 */
interface ParallelConfig {
  /** 最大并发数 */
  max_concurrent?: number;
  /** 执行模式 */
  mode?: ParallelMode;
  /** 是否收集所有结果 */
  collect_results?: boolean;
  /** 是否在第一个错误时停止 */
  fail_fast?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * Parallel 节点执行器
 */
export class ParallelExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as ParallelConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 获取任务列表
      const tasks = this.getTasks(context.inputs);

      if (tasks.length === 0) {
        return this.success({
          results: [],
          success_count: 0,
          failure_count: 0
        });
      }

      const maxConcurrent = config.max_concurrent || 5;
      const failFast = config.fail_fast || false;
      const timeout = config.timeout || 30000;

      // 并行执行任务
      const results = await this.executeInParallel(
        tasks,
        maxConcurrent,
        failFast,
        timeout,
        context
      );

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      // 保存结果
      this.setVariable(context, 'parallel_results', results);
      this.setVariable(context, 'parallel_success_count', successCount);
      this.setVariable(context, 'parallel_failure_count', failureCount);

      this.publishEvent(context, 'parallel:completed', {
        taskCount: tasks.length,
        successCount,
        failureCount
      });

      this.addExecutionRecord(context, true);

      return this.success({
        results,
        success_count: successCount,
        failure_count: failureCount,
        all_success: failureCount === 0
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 获取任务列表
   */
  private getTasks(inputs: Record<string, any>): any[] {
    // 查找任务数组
    if (inputs.tasks && Array.isArray(inputs.tasks)) {
      return inputs.tasks;
    }

    if (inputs.subtasks && Array.isArray(inputs.subtasks)) {
      return inputs.subtasks;
    }

    // 收集所有以 task_ 开头的输入
    const tasks: any[] = [];
    for (const key in inputs) {
      if (key.startsWith('task_')) {
        tasks.push(inputs[key]);
      }
    }

    return tasks.length > 0 ? tasks : [inputs];
  }

  /**
   * 并行执行
   */
  private async executeInParallel(
    tasks: any[],
    maxConcurrent: number,
    failFast: boolean,
    timeout: number,
    context: NodeContext
  ): Promise<any[]> {
    const results: any[] = [];
    let hasFailed = false;

    // 分批执行
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      if (hasFailed && failFast) {
        break;
      }

      const batch = tasks.slice(i, i + maxConcurrent);

      const batchResults = await Promise.allSettled(
        batch.map(task => this.withTimeout(
          this.executeTask(task, context),
          timeout
        ))
      );

      // 处理批量结果
      for (const settledResult of batchResults) {
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          results.push({
            success: false,
            error: settledResult.reason
          });

          if (failFast) {
            hasFailed = true;
          }
        }
      }
    }

    return results;
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: any, context: NodeContext): Promise<any> {
    // 这里应该调用子节点或执行器
    // 简化实现：直接返回任务
    if (typeof task === 'function') {
      return await task(context);
    }

    // 如果是字符串，视为 LLM 任务
    if (typeof task === 'string') {
      const llmClient = this.getLLMClient(context);
      return await llmClient.chat([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: task }
      ]);
    }

    // 如果是对象，尝试执行
    if (typeof task === 'object' && task.execute) {
      return await task.execute(context);
    }

    // 默认返回任务本身
    return { success: true, result: task };
  }
}
