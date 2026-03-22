/**
 * Sequence 节点执行器
 * 顺序执行多个任务
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * Sequence 节点配置
 */
interface SequenceConfig {
  /** 是否在错误时停止 */
  stop_on_error?: boolean;
  /** 是否收集所有结果 */
  collect_results?: boolean;
  /** 最大执行时间（毫秒） */
  max_duration?: number;
  /** 是否使用上一个任务的输出作为下一个任务的输入 */
  chain_results?: boolean;
}

/**
 * Sequence 节点执行器
 */
export class SequenceExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as SequenceConfig;

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

      const stopOnError = config.stop_on_error !== false;
      const maxDuration = config.max_duration;
      const startTime = Date.now();

      // 顺序执行任务
      const results = await this.executeSequence(
        tasks,
        stopOnError,
        maxDuration,
        startTime,
        config.chain_results || false,
        context
      );

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      // 保存结果
      this.setVariable(context, 'sequence_results', results);
      this.setVariable(context, 'last_result', results[results.length - 1]);

      this.publishEvent(context, 'sequence:completed', {
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

    if (inputs.steps && Array.isArray(inputs.steps)) {
      return inputs.steps;
    }

    // 收集所有以 step_ 开头的输入
    const tasks: any[] = [];
    for (const key in inputs) {
      if (key.startsWith('step_')) {
        tasks.push(inputs[key]);
      }
    }

    return tasks.length > 0 ? tasks : [inputs];
  }

  /**
   * 顺序执行
   */
  private async executeSequence(
    tasks: any[],
    stopOnError: boolean,
    maxDuration: number | undefined,
    startTime: number,
    chainResults: boolean,
    context: NodeContext
  ): Promise<any[]> {
    const results: any[] = [];
    let previousResult: any = null;

    for (let i = 0; i < tasks.length; i++) {
      // 检查超时
      if (maxDuration && Date.now() - startTime > maxDuration) {
        results.push({
          success: false,
          error: new Error('Sequence execution timeout'),
          index: i
        });
        break;
      }

      // 执行任务
      const taskInput = chainResults && previousResult !== null
        ? { ...tasks[i], input: previousResult }
        : tasks[i];

      const result = await this.executeTask(taskInput, context, i);
      results.push(result);

      // 如果任务失败且配置了停止
      if (!result.success && stopOnError) {
        break;
      }

      previousResult = result;
    }

    return results;
  }

  /**
   * 执行单个任务
   */
  private async executeTask(
    task: any,
    context: NodeContext,
    index: number
  ): Promise<any> {
    try {
      // 如果是函数，执行它
      if (typeof task === 'function') {
        const result = await task(context);
        return { success: true, result, index };
      }

      // 如果是字符串，视为 LLM 任务
      if (typeof task === 'string') {
        const llmClient = this.getLLMClient(context);
        const response = await llmClient.chat([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: task }
        ]);
        return { success: true, result: response, index };
      }

      // 如果是对象，检查是否有 execute 方法
      if (typeof task === 'object' && task !== null) {
        if (typeof task.execute === 'function') {
          const result = await task.execute(context);
          return { success: true, result, index };
        }

        // 尝试使用 input 字段
        if (task.input && context.inputs.input) {
          return { success: true, result: task, index };
        }

        return { success: true, result: task, index };
      }

      // 默认情况
      return { success: true, result: task, index };

    } catch (error) {
      return {
        success: false,
        error: error as Error,
        index
      };
    }
  }
}
