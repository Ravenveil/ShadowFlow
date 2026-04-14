/**
 * AgentGraph 节点类型定义
 */

// ==================== 基础类型 ====================

/**
 * 节点分类
 */
export type NodeCategory =
  | 'input'       // 输入类
  | 'planning'    // 规划类
  | 'execution'   // 执行类
  | 'review'      // 审核类
  | 'decision'    // 决策类
  | 'coordinate'  // 协调类
  | 'output';     // 输出类

/**
 * 节点类型
 */
export type NodeType = 'builtin' | 'custom' | 'composite';

/**
 * 端口数据类型
 */
export type PortType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'any'
  | 'stream'
  | 'file'
  | 'agent'
  | 'task'
  | 'message';

// ==================== 多语言支持 ====================

/**
 * 多语言文本
 */
export interface I18nText {
  en: string;
  zh: string;
}

// ==================== 端口定义 ====================

/**
 * 端口定义
 */
export interface PortDefinition {
  /** 端口名称 */
  name: string;
  /** 数据类型 */
  type: PortType;
  /** 是否必填 */
  required: boolean;
  /** 多语言描述 */
  description?: I18nText;
  /** 默认值 */
  defaultValue?: any;
  /** 验证规则 */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

// ==================== 节点配置 ====================

/**
 * 配置字段定义
 */
export interface ConfigFieldDefinition {
  /** 字段名称 */
  name: string;
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'code';
  /** 多语言标签 */
  label: I18nText;
  /** 多语言描述 */
  description?: I18nText;
  /** 默认值 */
  defaultValue?: any;
  /** 是否必填 */
  required?: boolean;
  /** 枚举值（type 为 enum 时） */
  enum?: { value: string; label: I18nText }[];
  /** 最小值（type 为 number 时） */
  min?: number;
  /** 最大值（type 为 number 时） */
  max?: number;
  /** 代码语言（type 为 code 时） */
  language?: string;
}

/**
 * 节点配置 Schema
 */
export interface NodeConfigSchema {
  /** 配置字段列表 */
  fields: ConfigFieldDefinition[];
}

// ==================== 节点定义 ====================

/**
 * 节点定义
 */
export interface INodeDefinition {
  /** 节点唯一 ID */
  id: string;
  /** 节点类型 */
  type: NodeType;
  /** 所属分类 */
  category: NodeCategory;
  /** 图标（emoji 或 URL） */
  icon: string;
  /** 多语言名称 */
  name: I18nText;
  /** 多语言描述 */
  description: I18nText;
  /** 输入端口 */
  inputs: PortDefinition[];
  /** 输出端口 */
  outputs: PortDefinition[];
  /** 配置 Schema */
  configSchema?: NodeConfigSchema;
  /** 依赖 */
  dependencies?: {
    npm?: string[];
    mcp?: string[];
  };
  /** 权限要求 */
  permissions?: {
    filesystem?: {
      read?: string[];
      write?: string[];
    };
    network?: {
      allowed_hosts?: string[];
    };
  };
  /** 标签 */
  tags?: string[];
}

// ==================== 节点实例 ====================

/**
 * 节点实例（画布上的节点）
 */
export interface INodeInstance {
  /** 实例唯一 ID */
  id: string;
  /** 引用的节点定义 ID */
  nodeId: string;
  /** 位置 */
  position: { x: number; y: number };
  /** 配置值 */
  config: Record<string, any>;
  /** 输入值（运行时） */
  inputs?: Record<string, any>;
  /** 输出值（运行时） */
  outputs?: Record<string, any>;
  /** 状态 */
  status?: 'idle' | 'running' | 'success' | 'error';
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  executionTime?: number;
}

// ==================== 边定义 ====================

/**
 * 边定义
 */
export interface IEdge {
  /** 边唯一 ID */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 源端口 */
  sourceHandle?: string;
  /** 目标节点 ID */
  target: string;
  /** 目标端口 */
  targetHandle?: string;
  /** 边标签 */
  label?: string;
  /** 边类型 */
  type?: 'default' | 'smoothstep' | 'bezier' | 'straight';
  /** 是否动画 */
  animated?: boolean;
  /** 条件（条件边） */
  condition?: string;
}

// ==================== 工作流定义 ====================

/**
 * 工作流定义
 */
export interface IWorkflow {
  /** 工作流 ID */
  id: string;
  /** 工作流名称 */
  name: string;
  /** 多语言名称 */
  nameI18n?: I18nText;
  /** 描述 */
  description?: string;
  /** 多语言描述 */
  descriptionI18n?: I18nText;
  /** 版本 */
  version: string;
  /** 节点实例列表 */
  nodes: INodeInstance[];
  /** 边列表 */
  edges: IEdge[];
  /** 全局配置 */
  config?: {
    /** 最大并行数 */
    maxConcurrency?: number;
    /** 超时时间（毫秒） */
    timeout?: number;
    /** 重试次数 */
    retryCount?: number;
    /** 是否启用检查点 */
    enableCheckpoint?: boolean;
  };
  /** 元数据 */
  metadata?: {
    createdAt?: Date;
    updatedAt?: Date;
    author?: string;
    tags?: string[];
  };
}

// ==================== 执行上下文和结果 ====================

/**
 * 工作流状态
 */
export interface IWorkflowState {
  /** 工作流 ID */
  workflowId: string;
  /** 执行 ID */
  executionId: string;
  /** 全局状态存储 */
  store: Record<string, any>;
  /** 节点执行结果 */
  nodeResults: Map<string, INodeResult>;
  /** 当前执行节点 */
  currentNodeId?: string;
  /** 执行日志 */
  logs: IExecutionLog[];
}

/**
 * 节点执行结果
 */
export interface INodeResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  outputs: Record<string, any>;
  /** 错误信息 */
  error?: Error;
  /** 执行指标 */
  metrics?: {
    executionTime: number;
    tokenUsage?: number;
    memoryUsage?: number;
  };
  /** 建议的下一个节点（动态路由） */
  nextNodes?: string[];
}

/**
 * 执行日志
 */
export interface IExecutionLog {
  /** 时间戳 */
  timestamp: Date;
  /** 节点 ID */
  nodeId: string;
  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** 消息 */
  message: string;
  /** 附加数据 */
  data?: any;
}

/**
 * 节点执行上下文
 */
export interface INodeContext {
  /** 任务 ID */
  taskId: string;
  /** 工作流 ID */
  workflowId: string;
  /** 执行 ID */
  executionId: string;
  /** 节点实例 */
  node: INodeInstance;
  /** 节点定义 */
  definition: INodeDefinition;
  /** 输入数据 */
  inputs: Record<string, any>;
  /** 配置 */
  config: Record<string, any>;
  /** 工作流状态 */
  state: IWorkflowState;
  /** 日志记录器 */
  logger: ILogger;
  /** 事件发射器 */
  emitter?: IEventEmitter;
  /** LLM 客户端 */
  llmClient?: ILLMClient;
  /** MCP 工具 */
  mcpTools?: Map<string, any>;
}

// ==================== 接口定义 ====================

/**
 * 日志记录器接口
 */
export interface ILogger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}

/**
 * 事件发射器接口
 */
export interface IEventEmitter {
  emit(event: string, data: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

/**
 * LLM 客户端接口
 */
export interface ILLMClient {
  chat(messages: Array<{ role: string; content: string }>, options?: any): Promise<string>;
  chatStream(messages: Array<{ role: string; content: string }>, options?: any): AsyncIterable<string>;
}

// ==================== 节点执行器接口 ====================

/**
 * 节点执行器接口
 */
export interface INodeExecutor {
  /** 节点定义 */
  definition: INodeDefinition;
  /** 验证输入 */
  validateInputs(inputs: Record<string, any>): void;
  /** 执行节点 */
  execute(context: INodeContext): Promise<INodeResult>;
}

// ==================== 节点注册表 ====================

/**
 * 节点注册表接口
 */
export interface INodeRegistry {
  /** 注册节点 */
  register(definition: INodeDefinition, executor: INodeExecutor): void;
  /** 获取节点定义 */
  getDefinition(nodeId: string): INodeDefinition | undefined;
  /** 获取执行器 */
  getExecutor(nodeId: string): INodeExecutor | undefined;
  /** 获取分类下的所有节点 */
  getByCategory(category: NodeCategory): INodeDefinition[];
  /** 搜索节点 */
  search(query: string): INodeDefinition[];
  /** 加载自定义节点 */
  loadFromDirectory(path: string): Promise<void>;
}
