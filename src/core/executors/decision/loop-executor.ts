/**
 * Loop 节点执行器
 * 循环执行
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 循环类型
 */
type LoopType = 'for' | 'while' | 'until' | 'for_each' | 'custom';

/**
 * Loop 节点配置
 */
interface LoopConfig {
  /** 循环类型 */
  loop_type?: LoopType;
  /** 最大迭代次数 */
  max_iterations?: number;
  /** 循环条件 */
  condition?: string;
  /** 迭代变量名 */
  iteration_variable?: string;
  /** 集合（用于 for_each） */
  collection?: string;
  /** 是否收集每次迭代的结果 */
  collect_results?: boolean;
  /** 提前终止条件 */
  break_condition?: string;
}

/**
 * Loop 节点执行器
 */
export class LoopExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as LoopConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const loopType = config.loop_type || 'for';
      const maxIterations = config.max_iterations || 10;

      // 执行循环
      const loopResult = await this.executeLoop(context, loopType, maxIterations, config);

      // 保存循环结果
      this.setVariable(context, 'loop_result', loopResult);
      this.setVariable(context, 'loop_iterations', loopResult.iterations);

      this.publishEvent(context, 'loop:completed', {
        type: loopType,
        iterations: loopResult.iterations,
        completed: loopResult.completed
      });

      this.addExecutionRecord(context, true);

      return this.success({
        loop_result: loopResult,
        iterations: loopResult.iterations,
        completed: loopResult.completed,
        results: loopResult.results
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 执行循环
   */
  private async executeLoop(
    context: NodeContext,
    loopType: LoopType,
    maxIterations: number,
    config: LoopConfig
  ): Promise<{
    iterations: number;
    completed: boolean;
    results: any[];
  }> {
    const results: any[] = [];
    let iteration = 0;
    let completed = false;

    switch (loopType) {
      case 'for':
        completed = await this.executeForLoop(context, maxIterations, config, results);
        break;

      case 'while':
        completed = await this.executeWhileLoop(context, maxIterations, config, results);
        break;

      case 'until':
        completed = await this.executeUntilLoop(context, maxIterations, config, results);
        break;

      case 'for_each':
        completed = await this.executeForEachLoop(context, maxIterations, config, results);
        break;

      case 'custom':
        completed = await this.executeCustomLoop(context, maxIterations, config, results);
        break;
    }

    iteration = results.length;

    return { iterations: iteration, completed, results };
  }

  /**
   * 执行 for 循环
   */
  private async executeForLoop(
    context: NodeContext,
    maxIterations: number,
    config: LoopConfig,
    results: any[]
  ): Promise<boolean> {
    const iterationVariable = config.iteration_variable || 'i';

    for (let i = 0; i < maxIterations; i++) {
      // 检查终止条件
      if (config.break_condition && await this.checkBreakCondition(context, config.break_condition)) {
        return false;
      }

      // 设置迭代变量
      this.setVariable(context, iterationVariable, i);

      // 模拟循环体执行（实际应该调用子节点）
      const iterationResult = { iteration: i, value: `iteration_${i}` };

      if (config.collect_results) {
        results.push(iterationResult);
      }

      // 发布迭代事件
      this.publishEvent(context, 'loop:iteration', { iteration: i });
    }

    return true;
  }

  /**
   * 执行 while 循环
   */
  private async executeWhileLoop(
    context: NodeContext,
    maxIterations: number,
    config: LoopConfig,
    results: any[]
  ): Promise<boolean> {
    let iteration = 0;

    while (iteration < maxIterations) {
      // 检查条件
      if (!config.condition || !await this.evaluateCondition(context, config.condition)) {
        break;
      }

      // 检查终止条件
      if (config.break_condition && await this.checkBreakCondition(context, config.break_condition)) {
        return false;
      }

      // 设置迭代变量
      this.setVariable(context, config.iteration_variable || 'i', iteration);

      // 模拟循环体执行
      const iterationResult = { iteration, value: `while_iteration_${iteration}` };

      if (config.collect_results) {
        results.push(iterationResult);
      }

      iteration++;

      // 发布迭代事件
      this.publishEvent(context, 'loop:iteration', { iteration });
    }

    return true;
  }

  /**
   * 执行 until 循环
   */
  private async executeUntilLoop(
    context: NodeContext,
    maxIterations: number,
    config: LoopConfig,
    results: any[]
  ): Promise<boolean> {
    let iteration = 0;

    while (iteration < maxIterations) {
      // 检查终止条件
      if (config.condition && await this.evaluateCondition(context, config.condition)) {
        return true;
      }

      // 检查提前终止
      if (config.break_condition && await this.checkBreakCondition(context, config.break_condition)) {
        return false;
      }

      // 设置迭代变量
      this.setVariable(context, config.iteration_variable || 'i', iteration);

      // 模拟循环体执行
      const iterationResult = { iteration, value: `until_iteration_${iteration}` };

      if (config.collect_results) {
        results.push(iterationResult);
      }

      iteration++;

      // 发布迭代事件
      this.publishEvent(context, 'loop:iteration', { iteration });
    }

    return false;
  }

  /**
   * 执行 for_each 循环
   */
  private async executeForEachLoop(
    context: NodeContext,
    maxIterations: number,
    config: LoopConfig,
    results: any[]
  ): Promise<boolean> {
    const collection = this.getCollection(context, config.collection);

    if (!collection || collection.length === 0) {
      return true;
    }

    const itemCount = Math.min(collection.length, maxIterations);
    const iterationVariable = config.iteration_variable || 'item';

    for (let i = 0; i < itemCount; i++) {
      // 检查终止条件
      if (config.break_condition && await this.checkBreakCondition(context, config.break_condition)) {
        return false;
      }

      // 设置迭代变量
      this.setVariable(context, iterationVariable, collection[i]);
      this.setVariable(context, 'index', i);

      // 模拟循环体执行
      const iterationResult = { index: i, item: collection[i] };

      if (config.collect_results) {
        results.push(iterationResult);
      }

      // 发布迭代事件
      this.publishEvent(context, 'loop:iteration', { index: i, item: collection[i] });
    }

    return true;
  }

  /**
   * 执行自定义循环
   */
  private async executeCustomLoop(
    context: NodeContext,
    maxIterations: number,
    config: LoopConfig,
    results: any[]
  ): Promise<boolean> {
    const { condition } = config;

    if (!condition) {
      return false;
    }

    // 使用 LLM 评估循环逻辑
    const llmClient = this.getLLMClient(context);

    let iteration = 0;
    while (iteration < maxIterations) {
      // 评估是否继续循环
      const prompt = `
Evaluate this loop condition:

Condition: ${condition}

Iteration: ${iteration}

Available variables:
${JSON.stringify(context.state.variables, null, 2)}

Return only "continue" or "break".
`;

      try {
        const response = await llmClient.chat([
          { role: 'system', content: 'You are a loop evaluation expert.' },
          { role: 'user', content: prompt }
        ]);

        if (response.toLowerCase().includes('break')) {
          return false;
        }

        // 模拟循环体执行
        if (config.collect_results) {
          results.push({ iteration });
        }

        iteration++;

        this.publishEvent(context, 'loop:iteration', { iteration });
      } catch {
        break;
      }
    }

    return true;
  }

  /**
   * 获取集合
   */
  private getCollection(context: NodeContext, collectionPath?: string): any[] {
    if (!collectionPath) {
      return [];
    }

    const collection = this.getNestedValue(context.inputs, collectionPath);

    return Array.isArray(collection) ? collection : [collection];
  }

  /**
   * 评估条件
   */
  private async evaluateCondition(context: NodeContext, condition: string): Promise<boolean> {
    try {
      const fn = new Function('variables', `return ${condition}`);
      return Boolean(fn(context.state.variables));
    } catch {
      return false;
    }
  }

  /**
   * 检查终止条件
   */
  private async checkBreakCondition(context: NodeContext, breakCondition: string): Promise<boolean> {
    try {
      const fn = new Function('variables', `return ${breakCondition}`);
      return Boolean(fn(context.state.variables));
    } catch {
      return false;
    }
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
