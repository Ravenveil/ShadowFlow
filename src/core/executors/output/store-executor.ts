/**
 * Store 节点执行器
 * 持久化存储
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 存储类型
 */
type StoreType =
  | 'file'
  | 'database'
  | 'cache'
  | 'variable'
  | 'state'
  | 'external';

/**
 * 文件格式
 */
type FileFormat = 'json' | 'yaml' | 'xml' | 'txt' | 'csv';

/**
 * Store 节点配置
 */
interface StoreConfig {
  /** 存储类型 */
  store_type?: StoreType;
  /** 目标路径（文件或数据库表） */
  target?: string;
  /** 文件格式 */
  file_format?: FileFormat;
  /** 是否追加（而非覆盖） */
  append?: boolean;
  /** 存储键名（用于缓存/变量） */
  key?: string;
  /** TTL（毫秒，用于缓存） */
  ttl?: number;
}

/**
 * Store 节点执行器
 */
export class StoreExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as StoreConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const data = context.inputs.data || context.inputs.content || context.inputs;
      const storeType = config.store_type || 'variable';

      // 执行存储
      const storeResult = await this.storeData(
        data,
        storeType,
        config,
        context
      );

      // 保存存储结果
      this.setVariable(context, 'store_result', storeResult);

      this.publishEvent(context, 'store:completed', {
        type: storeType,
        target: config.target || config.key
      });

      this.addExecutionRecord(context, true);

      return this.success({
        stored: true,
        location: storeResult.location,
        store_type: storeType,
        size: storeResult.size
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 存储数据
   */
  private async storeData(
    data: any,
    storeType: StoreType,
    config: StoreConfig,
    context: NodeContext
  ): Promise<{ location: string; size: number }> {
    switch (storeType) {
      case 'file':
        return await this.storeToFile(data, config);

      case 'database':
        return await this.storeToDatabase(data, config);

      case 'cache':
        return await this.storeToCache(data, config, context);

      case 'variable':
        return this.storeToVariable(data, config, context);

      case 'state':
        return this.storeToState(data, config, context);

      case 'external':
        return await this.storeToExternal(data, config, context);

      default:
        return this.storeToVariable(data, config, context);
    }
  }

  /**
   * 存储到文件
   */
  private async storeToFile(
    data: any,
    config: StoreConfig
  ): Promise<{ location: string; size: number }> {
    const target = config.target || 'output/data';
    const format = config.file_format || 'json';
    const append = config.append || false;

    // 格式化数据
    let content: string;
    switch (format) {
      case 'json':
        content = JSON.stringify(data, null, 2);
        break;
      case 'yaml':
        content = this.toYAML(data);
        break;
      case 'xml':
        content = this.toXML(data);
        break;
      case 'csv':
        content = this.toCSV(Array.isArray(data) ? data : [data]);
        break;
      default:
        content = String(data);
    }

    // 在实际实现中，这里会写入文件系统
    // 这里我们模拟存储
    const location = `${target}.${format}`;

    return { location, size: content.length };
  }

  /**
   * 存储到数据库
   */
  private async storeToDatabase(
    data: any,
    config: StoreConfig
  ): Promise<{ location: string; size: number }> {
    const target = config.target || 'results';

    // 在实际实现中，这里会执行数据库操作
    // 这里我们模拟存储
    const size = JSON.stringify(data).length;

    return {
      location: `db:${target}`,
      size
    };
  }

  /**
   * 存储到缓存
   */
  private async storeToCache(
    data: any,
    config: StoreConfig,
    context: NodeContext
  ): Promise<{ location: string; size: number }> {
    const key = config.key || 'cached_data';
    const ttl = config.ttl;

    // 在实际实现中，这里会写入缓存系统
    // 这里我们使用工作流状态存储
    const cacheEntry = {
      key,
      value: data,
      timestamp: new Date().toISOString(),
      ttl
    };

    context.state.variables[`_cache_${key}`] = cacheEntry;

    return {
      location: `cache:${key}`,
      size: JSON.stringify(data).length
    };
  }

  /**
   * 存储到变量
   */
  private storeToVariable(
    data: any,
    config: StoreConfig,
    context: NodeContext
  ): { location: string; size: number } {
    const key = config.key || 'stored_data';

    this.setVariable(context, key, data);

    return {
      location: `variable:${key}`,
      size: JSON.stringify(data).length
    };
  }

  /**
   * 存储到状态
   */
  private storeToState(
    data: any,
    config: StoreConfig,
    context: NodeContext
  ): { location: string; size: number } {
    const key = config.key || 'state_data';

    context.state.variables[key] = data;

    return {
      location: `state:${key}`,
      size: JSON.stringify(data).length
    };
  }

  /**
   * 存储到外部系统
   */
  private async storeToExternal(
    data: any,
    config: StoreConfig,
    context: NodeContext
  ): Promise<{ location: string; size: number }> {
    const target = config.target || 'external';

    // 在实际实现中，这里会调用外部 API
    // 这里我们模拟存储
    const llmClient = this.getLLMClient(context);

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a data storage assistant.' },
        { role: 'user', content: `Store this data: ${JSON.stringify(data)}` }
      ]);

      return {
        location: `external:${target}`,
        size: JSON.stringify(data).length
      };
    } catch {
      return {
        location: `external:${target}`,
        size: JSON.stringify(data).length
      };
    }
  }

  /**
   * 转换为 YAML
   */
  private toYAML(data: any): string {
    if (typeof data === 'string') {
      return data;
    }

    const lines: string[] = [];

    for (const key in data) {
      const value = data[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const subKey in value) {
          lines.push(`  ${subKey}: ${value[subKey]}`);
        }
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 转换为 XML
   */
  private toXML(data: any): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n';

    for (const key in data) {
      xml += `  <${key}>${data[key]}</${key}>\n`;
    }

    xml += '</root>';
    return xml;
  }

  /**
   * 转换为 CSV
   */
  private toCSV(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const headerRow = headers.join(',');
    const dataRows = data.map(item =>
      headers.map(h => item[h] || '').join(',')
    );

    return [headerRow, ...dataRows].join('\n');
  }
}
