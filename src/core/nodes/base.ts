// ============================================================================
// 节点基类
// ============================================================================

import type {
  NodeCategory,
  PortDefinition,
  NodeContext,
  NodeResult
} from '../types';

/**
 * 可执行节点接口
 * 扩展 INode 以添加执行能力
 */
export interface IExecutableNode {
  id: string;
  type: 'builtin' | 'custom';
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  category: NodeCategory;
  icon: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
  color?: string;
  accentColor?: string;
  execute(context: NodeContext): Promise<NodeResult>;
}

/**
 * 节点基类
 * 所有内置和自定义节点的基类
 */
export abstract class BaseNode implements IExecutableNode {
  /** 节点唯一标识 */
  id: string;

  /** 节点类型 */
  type: 'builtin' | 'custom' | 'composite';

  /** 节点名称（多语言） */
  name: { en: string; zh: string };

  /** 节点描述（多语言） */
  description: { en: string; zh: string };

  /** 所属分类 */
  category: NodeCategory;

  /** 图标（emoji 或 URL） */
  icon?: string;

  /** 输入端口定义 */
  inputs: PortDefinition[];

  /** 输出端口定义 */
  outputs: PortDefinition[];

  /** 配置 Schema */
  configSchema?: Record<string, any>;

  /** 视觉颜色 */
  color?: string;

  /** 强调色 */
  accentColor?: string;

  /** 默认配置 */
  defaultConfig?: Record<string, any>;

  constructor(definition: {
    id: string;
    type?: 'builtin' | 'custom' | 'composite';
    name: { en: string; zh: string };
    description: { en: string; zh: string };
    category: NodeCategory;
    icon?: string;
    inputs?: PortDefinition[];
    outputs?: PortDefinition[];
    configSchema?: Record<string, any>;
    color?: string;
    accentColor?: string;
    defaultConfig?: Record<string, any>;
  }) {
    this.id = definition.id;
    this.type = definition.type ?? 'builtin';
    this.name = definition.name;
    this.description = definition.description;
    this.category = definition.category;
    this.icon = definition.icon;
    this.inputs = definition.inputs ?? [];
    this.outputs = definition.outputs ?? [];
    this.configSchema = definition.configSchema;
    this.color = definition.color;
    this.accentColor = definition.accentColor;
    this.defaultConfig = definition.defaultConfig;
  }

  /**
   * 验证输入
   */
  protected validateInputs(inputs: Record<string, any>): void {
    for (const port of this.inputs) {
      if (port.required && !(port.name in inputs)) {
        throw new Error(`Missing required input: ${port.name}`);
      }
      // 类型验证（基础检查）
      if (port.name in inputs && inputs[port.name] !== null && inputs[port.name] !== undefined) {
        const value = inputs[port.name];
        const valueType = Array.isArray(value) ? 'array' : typeof value;
        // 如果有类型定义且不是 'any'，进行简单类型检查
        if (port.type !== 'any' && valueType !== port.type && port.type !== 'stream') {
          // 允许一定的类型灵活性
          const validTypeMapping: Record<string, string[]> = {
            'string': ['string'],
            'number': ['number'],
            'boolean': ['boolean'],
            'object': ['object'],
            'array': ['array'],
            'file': ['object'],
            'agent': ['object'],
            'task': ['object'],
            'message': ['object']
          };
          if (!validTypeMapping[port.type]?.includes(valueType)) {
            throw new Error(
              `Input type mismatch for "${port.name}": expected ${port.type}, got ${valueType}`
            );
          }
        }
      }
    }
  }

  /**
   * 执行节点 - 子类必须实现
   */
  abstract execute(context: NodeContext): Promise<NodeResult>;
}

/**
 * 创建节点工厂函数
 */
export function createNode<T extends BaseNode>(
  NodeClass: new (definition: any) => T,
  definition: ConstructorParameters<typeof NodeClass>[0]
): T {
  return new NodeClass(definition);
}
