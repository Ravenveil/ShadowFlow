/**
 * Receive 节点执行器
 * 接收并解析输入数据
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, NodeTypeId } from '../../types/node.types';

/**
 * 输入解析器类型
 */
type ParserType = 'json' | 'yaml' | 'text' | 'auto' | 'xml';

/**
 * Receive 节点配置
 */
interface ReceiveConfig {
  /** 解析器类型 */
  parser?: ParserType;
  /** 是否提取实体 */
  extract_entities?: boolean;
  /** 最大输入大小 */
  max_input_size?: number;
}

/**
 * 解析后的任务数据
 */
interface ParsedTask {
  /** 原始类型 */
  type: 'json' | 'yaml' | 'text' | 'xml' | 'object';
  /** 解析后的数据 */
  data: any;
  /** 描述 */
  description?: string;
  /** 提取的实体 */
  entities?: Record<string, any>[];
  /** 元数据 */
  metadata?: {
    parsed_at: string;
    parser_used: ParserType;
    size: number;
  };
}

/**
 * Receive 节点执行器
 */
export class ReceiveExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const startTime = Date.now();
    const config = context.config as ReceiveConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);
      this.validateConfig(context.config);

      const raw_input = context.inputs.raw_input;

      // 检查输入大小
      const inputSize = JSON.stringify(raw_input).length;
      const maxSize = config.max_input_size || 1024 * 1024; // 默认 1MB
      if (inputSize > maxSize) {
        throw new Error(`Input size ${inputSize} exceeds maximum ${maxSize}`);
      }

      // 解析输入
      const parsed_task = await this.parseInput(raw_input, config);

      // 提取实体（可选）
      if (config.extract_entities) {
        parsed_task.entities = await this.extractEntities(parsed_task, context);
      }

      this.publishEvent(context, 'receive:completed', {
        inputSize,
        parsedType: parsed_task.type
      });

      this.addExecutionRecord(context, true);

      return this.success({
        raw_input,
        parsed_task,
        input_size: inputSize
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 解析输入
   */
  private async parseInput(raw_input: any, config: ReceiveConfig): Promise<ParsedTask> {
    const parser = config.parser || 'auto';

    let parsed: ParsedTask;

    switch (parser) {
      case 'json':
        parsed = this.parseJSON(raw_input);
        break;
      case 'yaml':
        parsed = this.parseYAML(raw_input);
        break;
      case 'xml':
        parsed = this.parseXML(raw_input);
        break;
      case 'text':
        parsed = this.parseText(raw_input);
        break;
      case 'auto':
        parsed = this.autoDetect(raw_input);
        break;
      default:
        throw new Error(`Unknown parser type: ${parser}`);
    }

    // 添加元数据
    parsed.metadata = {
      parsed_at: new Date().toISOString(),
      parser_used: parser,
      size: JSON.stringify(parsed.data).length
    };

    return parsed;
  }

  /**
   * 解析 JSON
   */
  private parseJSON(input: any): ParsedTask {
    let data: any;

    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch (e) {
        throw new Error(`Failed to parse JSON: ${(e as Error).message}`);
      }
    } else {
      data = input;
    }

    return { type: 'json', data };
  }

  /**
   * 解析 YAML
   */
  private parseYAML(input: any): ParsedTask {
    // 简化版 YAML 解析，实际应使用 js-yaml 库
    let yamlString = typeof input === 'string' ? input : JSON.stringify(input);

    // 基本 YAML 到 JSON 转换
    const lines = yamlString.split('\n');
    const data: Record<string, any> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        data[key] = value || true;
      }
    }

    return { type: 'yaml', data };
  }

  /**
   * 解析 XML
   */
  private parseXML(input: any): ParsedTask {
    // 简化版 XML 解析，实际应使用 xml2js 库
    if (typeof input !== 'string') {
      throw new Error('XML input must be a string');
    }

    const data: Record<string, any> = {};
    const tagRegex = /<([^>]+)>([^<]*)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(input)) !== null) {
      data[match[1]] = match[2];
    }

    return { type: 'xml', data };
  }

  /**
   * 解析文本
   */
  private parseText(input: any): ParsedTask {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    return {
      type: 'text',
      data: { description: text },
      description: text
    };
  }

  /**
   * 自动检测输入类型
   */
  private autoDetect(input: any): ParsedTask {
    // 如果是字符串，尝试检测格式
    if (typeof input === 'string') {
      const trimmed = input.trim();

      // 检测 JSON
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const data = JSON.parse(trimmed);
          return { type: 'json', data };
        } catch {
          // 不是有效的 JSON，继续检测
        }
      }

      // 检测 XML
      if (trimmed.startsWith('<') && trimmed.includes('>')) {
        return this.parseXML(input);
      }

      // 检测 YAML（简单启发式）
      if (trimmed.includes(':\n') || trimmed.includes(': ')) {
        try {
          return this.parseYAML(input);
        } catch {
          // 不是有效的 YAML，降级为文本
        }
      }

      // 默认为文本
      return this.parseText(input);
    }

    // 如果是对象
    if (typeof input === 'object' && input !== null) {
      return { type: 'object', data: input };
    }

    // 其他情况转换为文本
    return this.parseText(input);
  }

  /**
   * 提取实体（使用 LLM）
   */
  private async extractEntities(parsed_task: ParsedTask, context: NodeContext): Promise<Record<string, any>[]> {
    const llmClient = this.getLLMClient(context);

    const extractPrompt = `
Extract named entities from the following text/data.
Return as JSON array of objects with "text", "type", and "confidence" fields.

Data: ${JSON.stringify(parsed_task.data)}

Entity types to look for:
- Person names
- Organizations
- Locations
- Dates
- Email addresses
- URLs
- Technical terms

Respond with only the JSON array.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are an entity extraction expert.' },
        { role: 'user', content: extractPrompt }
      ]);

      const entities = JSON.parse(response);
      return Array.isArray(entities) ? entities : [];
    } catch {
      return [];
    }
  }
}
