/**
 * Barrier 节点执行器
 * 屏障同步
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * Barrier 节点配置
 */
interface BarrierConfig {
  /** 等待的任务数 */
  task_count?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否在部分完成时继续 */
  allow_partial?: boolean;
  /** 最小完成数 */
  min_completion?: number;
}

/**
 * Barrier 节点执行器
 */
export class BarrierExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as BarrierConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const taskCount = config.task_count || 3;
      const timeout = config.timeout || 60000;
      const allowPartial = config.allow_partial || false;
      const minCompletion = config.min_completion || taskCount;

      // 等待所有任务完成
      const result = await this.waitForBarrier(
        context,
        taskCount,
        timeout,
        allowPartial,
        minCompletion
      );

      // 保存结果
      this.setVariable(context, 'barrier_result', result);

      this.publishEvent(context, 'barrier:completed', {
        completed: result.completed,
        taskCount: taskCount
      });

      this.addExecutionRecord(context, true);

      return this.success({
        completed: result.completed,
        partial: result.partial,
        completed_count: result.completedCount,
        total_count: result.totalCount
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 等待屏障
   */
  private async waitForBarrier(
    context: NodeContext,
    taskCount: number,
    timeout: number,
    allowPartial: boolean,
    minCompletion: number
  ): Promise<{
    completed: boolean;
    partial: boolean;
    completedCount: number;
    totalCount: number;
  }> {
    const startTime = Date.now();
    let completedCount = 0;

    // 等待任务完成
    while (Date.now() - startTime < timeout) {
      // 检查已完成的任务数
      completedCount = this.countCompletedTasks(context);

      // 检查是否全部完成
      if (completedCount >= taskCount) {
        return {
          completed: true,
          partial: false,
          completedCount,
          totalCount: taskCount
        };
      }

      // 检查是否可以部分完成
      if (allowPartial && completedCount >= minCompletion) {
        return {
          completed: false,
          partial: true,
          completedCount,
          totalCount: taskCount
        };
      }

      // 等待一段时间再检查
      await this.sleep(100);
    }

    // 超时
    return {
      completed: false,
      partial: allowPartial && completedCount >= minCompletion,
      completedCount,
      totalCount: taskCount
    };
  }

  /**
   * 计算已完成的任务数
   */
  private countCompletedTasks(context: NodeContext): number {
    let count = 0;

    // 检查执行历史
    count += context.state.executionHistory.filter(e => e.success).length;

    // 检查输入中的完成标记
    for (const key in context.inputs) {
      if (key.includes('completed') || key.includes('result')) {
        const value = context.inputs[key];
        if (value === true || (value && value.success)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
