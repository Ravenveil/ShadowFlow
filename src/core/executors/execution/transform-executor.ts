/**
 * Transform 节点执行器
 * 数据转换
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, TransformResult } from '../../types/node.types';

/**
 * 转换操作类型
 */
type TransformOperation =
  | 'map'
  | 'filter'
  | 'reduce'
  | 'sort'
  | 'group'
  | 'pivot'
  | 'flatten'
  | 'join'
  | 'split'
  | 'custom'
  | 'pipeline';

/**
 * Transform 节点配置
 */
interface TransformConfig {
  /** 转换操作 */
  operation?: TransformOperation;
  /** 源格式 */
  from_format?: 'json' | 'csv' | 'xml' | 'yaml' | 'text';
  /** 目标格式 */
  to_format?: 'json' | 'csv' | 'xml' | 'yaml' | 'text';
  /** 字段映射 */
  field_mapping?: Record<string, string>;
  /** 过滤条件 */
  filter_condition?: string;
  /** 排序字段 */
  sort_field?: string;
  /** 排序方向 */
  sort_order?: 'asc' | 'desc';
  /** 自定义转换函数 */
  custom_function?: string;
  /** 转换管道 */
  pipeline?: TransformOperation[];
}

/**
 * Transform 节点执行器
 */
export class TransformExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as TransformConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const data = context.inputs.data || context.inputs.input_data;
      const rawInput = context.inputs.raw_input;

      if (!data && !rawInput) {
        throw new Error('Data or raw_input is required');
      }

      const operation = config.operation || 'map';
      const fromFormat = config.from_format || 'json';
      const toFormat = config.to_format || 'json';

      // 解析输入数据
      const parsedData = await this.parseInput(data || rawInput, fromFormat);

      // 执行转换
      let transformedData = parsedData;

      if (operation === 'pipeline' && config.pipeline) {
        // 执行管道操作
        transformedData = await this.executePipeline(parsedData, config.pipeline, context);
      } else {
        // 执行单个操作
        transformedData = await this.executeOperation(parsedData, operation, config, context);
      }

      // 格式化输出
      const outputData = await this.formatOutput(transformedData, toFormat);

      // 生成转换统计
      const statistics = {
        input_size: JSON.stringify(parsedData).length,
        output_size: JSON.stringify(transformedData).length,
        transformed_count: Array.isArray(transformedData) ? transformedData.length : 1,
        skipped_count: 0
      };

      // 转换日志
      const logs = [
        `Input format: ${fromFormat}`,
        `Output format: ${toFormat}`,
        `Operation: ${operation}`,
        `Transformed ${statistics.transformed_count} items`
      ];

      const result: TransformResult = {
        data: outputData,
        statistics,
        logs
      };

      // 保存结果
      this.setVariable(context, 'transformed_data', outputData);
      this.setVariable(context, 'transform_stats', statistics);

      this.publishEvent(context, 'transform:completed', {
        from: fromFormat,
        to: toFormat,
        operation
      });

      this.addExecutionRecord(context, true);

      return this.success(result);

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 解析输入
   */
  private async parseInput(data: any, format: string): Promise<any> {
    if (format === 'json') {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }

    if (format === 'csv' && typeof data === 'string') {
      return this.parseCSV(data);
    }

    if (format === 'xml' && typeof data === 'string') {
      return this.parseXML(data);
    }

    if (format === 'yaml' && typeof data === 'string') {
      return this.parseYAML(data);
    }

    // text 或其他格式直接返回
    return data;
  }

  /**
   * 格式化输出
   */
  private async formatOutput(data: any, format: string): Promise<any> {
    switch (format) {
      case 'json':
        return data;
      case 'csv':
        return this.toCSV(Array.isArray(data) ? data : [data]);
      case 'xml':
        return this.toXML(data);
      case 'yaml':
        return this.toYAML(data);
      case 'text':
        return JSON.stringify(data, null, 2);
      default:
        return data;
    }
  }

  /**
   * 执行转换操作
   */
  private async executeOperation(
    data: any,
    operation: TransformOperation,
    config: TransformConfig,
    context: NodeContext
  ): Promise<any> {
    const dataArray = Array.isArray(data) ? data : [data];

    switch (operation) {
      case 'map':
        return this.mapData(dataArray, config);

      case 'filter':
        return this.filterData(dataArray, config);

      case 'sort':
        return this.sortData(dataArray, config);

      case 'reduce':
        return this.reduceData(dataArray, config);

      case 'group':
        return this.groupData(dataArray, config);

      case 'flatten':
        return this.flattenData(dataArray);

      case 'join':
        return dataArray.join(', ');

      case 'split':
        return typeof data === 'string' ? data.split(',') : dataArray;

      case 'custom':
        return this.executeCustom(data, config);

      default:
        return data;
    }
  }

  /**
   * 执行管道操作
   */
  private async executePipeline(
    data: any,
    pipeline: TransformOperation[],
    context: NodeContext
  ): Promise<any> {
    let result = data;

    for (const operation of pipeline) {
      result = await this.executeOperation(result, operation, {}, context);
    }

    return result;
  }

  /**
   * 映射数据
   */
  private mapData(data: any[], config: TransformConfig): any[] {
    const { field_mapping } = config;

    if (!field_mapping) {
      return data;
    }

    return data.map(item => {
      const mapped: Record<string, any> = {};

      for (const [sourceField, targetField] of Object.entries(field_mapping)) {
        mapped[targetField] = item[sourceField];
      }

      return mapped;
    });
  }

  /**
   * 过滤数据
   */
  private filterData(data: any[], config: TransformConfig): any[] {
    const { filter_condition } = config;

    if (!filter_condition) {
      return data;
    }

    // 简化版过滤 - 实际应该使用表达式解析器
    try {
      const filterFn = new Function('item', `return ${filter_condition}`);
      return data.filter(item => {
        try {
          return filterFn(item);
        } catch {
          return false;
        }
      });
    } catch {
      return data;
    }
  }

  /**
   * 排序数据
   */
  private sortData(data: any[], config: TransformConfig): any[] {
    const { sort_field, sort_order = 'asc' } = config;

    if (!sort_field) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aVal = a[sort_field];
      const bVal = b[sort_field];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort_order === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal || '');
      const bStr = String(bVal || '');

      return sort_order === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }

  /**
   * 归约数据
   */
  private reduceData(data: any[], config: TransformConfig): any {
    // 简化版归约 - 计数
    return {
      count: data.length,
      items: data
    };
  }

  /**
   * 分组数据
   */
  private groupData(data: any[], config: TransformConfig): Record<string, any[]> {
    const groupField = config.sort_field || 'id';

    return data.reduce((groups, item) => {
      const key = String(item[groupField] || 'default');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {} as Record<string, any[]>);
  }

  /**
   * 展平数据
   */
  private flattenData(data: any[]): any[] {
    const result: any[] = [];

    const flatten = (item: any): void => {
      if (Array.isArray(item)) {
        item.forEach(flatten);
      } else if (item && typeof item === 'object') {
        Object.values(item).forEach(flatten);
      } else {
        result.push(item);
      }
    };

    data.forEach(flatten);
    return result;
  }

  /**
   * 执行自定义函数
   */
  private executeCustom(data: any, config: TransformConfig): any {
    const { custom_function } = config;

    if (!custom_function) {
      return data;
    }

    try {
      // 注意：在生产环境中应该使用安全的函数执行方式
      const fn = new Function('data', `return ${custom_function}`);
      return fn(data);
    } catch {
      return data;
    }
  }

  /**
   * 解析 CSV
   */
  private parseCSV(csv: string): any[] {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj: Record<string, any> = {};

      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });

      return obj;
    });
  }

  /**
   * 解析 XML
   */
  private parseXML(xml: string): any {
    // 简化版 XML 解析
    const result: Record<string, any> = {};

    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
      result[match[1]] = match[2];
    }

    return result;
  }

  /**
   * 解析 YAML
   */
  private parseYAML(yaml: string): any {
    // 简化版 YAML 解析
    const result: Record<string, any> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.slice(0, colonIndex).trim();
          const value = trimmed.slice(colonIndex + 1).trim();
          result[key] = value || true;
        }
      }
    }

    return result;
  }

  /**
   * 转换为 CSV
   */
  private toCSV(data: any[]): string {
    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const headerRow = headers.join(',');

    const dataRows = data.map(item =>
      headers.map(h => item[h] || '').join(',')
    );

    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * 转换为 XML
   */
  private toXML(data: any): string {
    if (Array.isArray(data)) {
      return `<items>\n${data.map(item => this.toXML(item)).join('\n')}\n</items>`;
    }

    if (typeof data === 'object' && data !== null) {
      return Object.entries(data)
        .map(([key, value]) => `<${key}>${value}</${key}>`)
        .join('\n');
    }

    return String(data);
  }

  /**
   * 转换为 YAML
   */
  private toYAML(data: any): string {
    if (Array.isArray(data)) {
      return data.map(item => this.toYAML(item)).join('\n');
    }

    if (typeof data === 'object' && data !== null) {
      return Object.entries(data)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    }

    return String(data);
  }
}
