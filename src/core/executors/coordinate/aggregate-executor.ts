/**
 * Aggregate 节点执行器
 * 结果汇总
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 聚合类型
 */
type AggregateType =
  | 'sum'
  | 'average'
  | 'count'
  | 'min'
  | 'max'
  | 'median'
  | 'mode'
  | 'concatenate'
  | 'merge'
  | 'group'
  | 'custom';

/**
 * Aggregate 节点配置
 */
interface AggregateConfig {
  /** 聚合类型 */
  aggregate_type?: AggregateType;
  /** 聚合字段路径 */
  field?: string;
  /** 分组字段（用于 group 聚合） */
  group_by?: string;
  /** 自定义聚合函数 */
  custom_function?: string;
  /** 是否包含统计数据 */
  include_statistics?: boolean;
}

/**
 * Aggregate 节点执行器
 */
export class AggregateExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as AggregateConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 获取数据
      const data = this.getData(context.inputs);

      if (data.length === 0) {
        return this.success({
          result: null,
          count: 0
        });
      }

      const aggregateType = config.aggregate_type || 'merge';
      const field = config.field;
      const includeStatistics = config.include_statistics || false;

      // 执行聚合
      const aggregated = await this.performAggregate(
        data,
        aggregateType,
        field,
        config.group_by,
        context
      );

      // 生成统计数据（如果配置）
      const statistics = includeStatistics
        ? this.calculateStatistics(data, field)
        : null;

      // 保存结果
      this.setVariable(context, 'aggregated_result', aggregated);
      if (statistics) {
        this.setVariable(context, 'statistics', statistics);
      }

      this.publishEvent(context, 'aggregate:completed', {
        type: aggregateType,
        itemCount: data.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        result: aggregated,
        count: data.length,
        aggregate_type: aggregateType,
        statistics
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 获取数据
   */
  private getData(inputs: Record<string, any>): any[] {
    // 查找数据数组
    if (inputs.results && Array.isArray(inputs.results)) {
      return inputs.results;
    }

    if (inputs.data && Array.isArray(inputs.data)) {
      return inputs.data;
    }

    // 收集所有值
    const data: any[] = [];
    for (const key in inputs) {
      const value = inputs[key];
      if (Array.isArray(value)) {
        data.push(...value);
      } else if (value !== undefined) {
        data.push(value);
      }
    }

    return data;
  }

  /**
   * 执行聚合
   */
  private async performAggregate(
    data: any[],
    aggregateType: AggregateType,
    field: string | undefined,
    groupBy: string | undefined,
    context: NodeContext
  ): Promise<any> {
    // 提取字段值
    const values = field
      ? data.map(item => this.getNestedValue(item, field))
      : data;

    switch (aggregateType) {
      case 'sum':
        return this.sum(values);

      case 'average':
        return this.average(values);

      case 'count':
        return values.length;

      case 'min':
        return this.min(values);

      case 'max':
        return this.max(values);

      case 'median':
        return this.median(values);

      case 'mode':
        return this.mode(values);

      case 'concatenate':
        return this.concatenate(data);

      case 'merge':
        return this.merge(data);

      case 'group':
        return this.group(data, groupBy);

      case 'custom':
        return await this.customAggregate(data, context);

      default:
        return this.merge(data);
    }
  }

  /**
   * 求和
   */
  private sum(values: any[]): number {
    return values.reduce((sum, val) => sum + (Number(val) || 0), 0);
  }

  /**
   * 平均值
   */
  private average(values: any[]): number {
    const nums = values.map(v => Number(v)).filter(v => !isNaN(v));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }

  /**
   * 最小值
   */
  private min(values: any[]): any {
    return Math.min(...values.map(v => Number(v)).filter(v => !isNaN(v)));
  }

  /**
   * 最大值
   */
  private max(values: any[]): any {
    return Math.max(...values.map(v => Number(v)).filter(v => !isNaN(v)));
  }

  /**
   * 中位数
   */
  private median(values: any[]): number {
    const nums = values.map(v => Number(v)).filter(v => !isNaN(v)).sort((a, b) => a - b);
    const mid = Math.floor(nums.length / 2);

    return nums.length % 2 !== 0
      ? nums[mid]
      : (nums[mid - 1] + nums[mid]) / 2;
  }

  /**
   * 众数
   */
  private mode(values: any[]): any {
    const frequency: Record<string, number> = {};
    let maxFreq = 0;
    let mode: any = values[0];

    for (const val of values) {
      const strVal = String(val);
      frequency[strVal] = (frequency[strVal] || 0) + 1;

      if (frequency[strVal] > maxFreq) {
        maxFreq = frequency[strVal];
        mode = val;
      }
    }

    return mode;
  }

  /**
   * 连接
   */
  private concatenate(data: any[]): string {
    return data.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
  }

  /**
   * 合并
   */
  private merge(data: any[]): any {
    const result: Record<string, any> = {};

    for (const item of data) {
      if (typeof item === 'object' && item !== null) {
        Object.assign(result, item);
      }
    }

    return result;
  }

  /**
   * 分组
   */
  private group(data: any[], groupBy: string | undefined): Record<string, any[]> {
    const result: Record<string, any[]> = {};

    if (!groupBy) {
      result['all'] = data;
      return result;
    }

    for (const item of data) {
      const key = String(this.getNestedValue(item, groupBy) || 'undefined');

      if (!result[key]) {
        result[key] = [];
      }

      result[key].push(item);
    }

    return result;
  }

  /**
   * 自定义聚合
   */
  private async customAggregate(data: any[], context: NodeContext): Promise<any> {
    const llmClient = this.getLLMClient(context);

    const prompt = `
Aggregate this data:
${JSON.stringify(data, null, 2)}

Provide a meaningful summary or aggregation.
Return JSON.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a data aggregation expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return { count: data.length };
    }
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(data: any[], field?: string): any {
    const values = field
      ? data.map(item => Number(this.getNestedValue(item, field))).filter(v => !isNaN(v))
      : data.map(v => Number(v)).filter(v => !isNaN(v));

    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: values.length,
      sum,
      average: avg,
      min: Math.min(...values),
      max: Math.max(...values),
      variance,
      standard_deviation: stdDev
    };
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
