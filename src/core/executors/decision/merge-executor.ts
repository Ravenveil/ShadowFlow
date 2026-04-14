/**
 * Merge 节点执行器
 * 合并多个输入结果
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 合并策略
 */
type MergeStrategy =
  | 'concatenate'
  | 'merge'
  | 'overwrite'
  | 'union'
  | 'intersection'
  | 'first'
  | 'last'
  | 'custom';

/**
 * Merge 节点配置
 */
interface MergeConfig {
  /** 合并策略 */
  strategy?: MergeStrategy;
  /** 是否深度合并 */
  deep_merge?: boolean;
  /** 合并键名（用于合并对象数组） */
  merge_key?: string;
  /** 冲突解决策略 */
  conflict_resolution?: 'first' | 'last' | 'error';
  /** 自定义合并函数 */
  custom_function?: string;
}

/**
 * Merge 节点执行器
 */
export class MergeExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as MergeConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 收集所有输入
      const inputs = this.collectInputs(context.inputs);

      if (inputs.length === 0) {
        return this.success({ merged: {} });
      }

      // 执行合并
      const merged = await this.performMerge(inputs, config, context);

      // 保存合并结果
      this.setVariable(context, 'merged_data', merged);
      this.setVariable(context, 'merge_strategy', config.strategy);

      this.publishEvent(context, 'merge:completed', {
        strategy: config.strategy,
        inputCount: inputs.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        merged,
        merge_strategy: config.strategy,
        input_count: inputs.length
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 收集输入
   */
  private collectInputs(inputs: Record<string, any>): any[] {
    const result: any[] = [];

    for (const key in inputs) {
      if (key.startsWith('input_') || key.startsWith('branch_') || key === 'data' || key === 'result') {
        const value = inputs[key];
        if (Array.isArray(value)) {
          result.push(...value);
        } else {
          result.push(value);
        }
      }
    }

    // 如果没有找到明确的输入，使用所有值
    if (result.length === 0) {
      Object.values(inputs).forEach(value => {
        if (value !== undefined) {
          result.push(value);
        }
      });
    }

    return result;
  }

  /**
   * 执行合并
   */
  private async performMerge(
    inputs: any[],
    config: MergeConfig,
    context: NodeContext
  ): Promise<any> {
    const strategy = config.strategy || 'merge';

    switch (strategy) {
      case 'concatenate':
        return this.concatenate(inputs);

      case 'merge':
        return this.mergeObjects(inputs, config);

      case 'overwrite':
        return this.overwrite(inputs);

      case 'union':
        return this.union(inputs);

      case 'intersection':
        return this.intersection(inputs);

      case 'first':
        return inputs[0];

      case 'last':
        return inputs[inputs.length - 1];

      case 'custom':
        return this.customMerge(inputs, config, context);

      default:
        return this.mergeObjects(inputs, config);
    }
  }

  /**
   * 连接
   */
  private concatenate(inputs: any[]): any[] {
    return inputs.flat();
  }

  /**
   * 合并对象
   */
  private mergeObjects(inputs: any[], config: MergeConfig): any {
    if (!config.deep_merge) {
      return Object.assign({}, ...inputs);
    }

    const result: Record<string, any> = {};

    for (const input of inputs) {
      if (typeof input === 'object' && input !== null) {
        this.deepMerge(result, input);
      }
    }

    return result;
  }

  /**
   * 深度合并
   */
  private deepMerge(target: Record<string, any>, source: Record<string, any>): void {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (typeof sourceValue === 'object' && sourceValue !== null &&
            typeof targetValue === 'object' && targetValue !== null &&
            !Array.isArray(sourceValue) && !Array.isArray(targetValue)) {
          target[key] = target[key] || {};
          this.deepMerge(target[key], sourceValue);
        } else {
          target[key] = sourceValue;
        }
      }
    }
  }

  /**
   * 覆盖
   */
  private overwrite(inputs: any[]): any {
    return { ...inputs[0], ...inputs[inputs.length - 1] };
  }

  /**
   * 并集
   */
  private union(inputs: any[]): any[] {
    const result: any[] = [];

    for (const input of inputs) {
      const items = Array.isArray(input) ? input : [input];
      for (const item of items) {
        const serialized = JSON.stringify(item);
        if (!result.some(r => JSON.stringify(r) === serialized)) {
          result.push(item);
        }
      }
    }

    return result;
  }

  /**
   * 交集
   */
  private intersection(inputs: any[]): any[] {
    if (inputs.length === 0) {
      return [];
    }

    const firstArray = Array.isArray(inputs[0]) ? inputs[0] : [inputs[0]];
    const result: any[] = [];

    for (const item of firstArray) {
      const serialized = JSON.stringify(item);
      const allContains = inputs.every(input => {
        const items = Array.isArray(input) ? input : [input];
        return items.some(i => JSON.stringify(i) === serialized);
      });

      if (allContains) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * 自定义合并
   */
  private async customMerge(
    inputs: any[],
    config: MergeConfig,
    context: NodeContext
  ): Promise<any> {
    const { custom_function } = config;

    if (!custom_function) {
      return this.mergeObjects(inputs, config);
    }

    try {
      // 使用 LLM 执行自定义合并
      const llmClient = this.getLLMClient(context);

      const prompt = `
Merge these inputs using this function: ${custom_function}

Inputs:
${inputs.map((inp, i) => `Input ${i + 1}: ${JSON.stringify(inp)}`).join('\n\n')}

Return only the merged result.
`;

      const response = await llmClient.chat([
        { role: 'system', content: 'You are a data merge expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return this.mergeObjects(inputs, config);
    }
  }
}
