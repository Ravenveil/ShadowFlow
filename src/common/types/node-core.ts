/**
 * 核心节点类型定义
 *
 * 定义节点的基础接口、端口、执行上下文和结果等核心类型
 * 参考 docs/Workflow-Nodes-Analysis.md 的节点设计
 */

// ============================================================================
// 基础枚举类型
// ============================================================================

/**
 * 节点分类
 *
 * 7 大类节点分类，用于节点面板分组
 */
export type NodeCategory =
  | 'input'       // 输入节点：接收、解析、理解
  | 'planning'    // 规划节点：分析、设计、分解
  | 'execution'   // 执行节点：编码、生成、处理
  | 'review'      // 审核节点：检查、验证、审计
  | 'decision'    // 决策节点：判断、分支、路由
  | 'coordinate'  // 协调节点：分配、汇总、同步
  | 'output';     // 输出节点：报告、存储、通知

/**
 * 节点类型
 *
 * 内置节点或自定义节点
 */
export type NodeType = 'builtin' | 'custom';

/**
 * 端口数据类型
 *
 * 定义节点输入输出的数据类型
 */
export type PortType =
  | 'string'      // 字符串
  | 'number'      // 数字
  | 'boolean'     // 布尔值
  | 'object'      // 对象
  | 'array'       // 数组
  | 'any'         // 任意类型
  | 'stream'      // 流
  | 'file'        // 文件
  | 'agent'       // Agent
  | 'task'        // 任务
  | 'message';    // 消息

/**
 * 节点状态
 *
 * 节点执行时的状态
 */
export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting';

// ============================================================================
// 多语言支持
// ============================================================================

/**
 * 多语言文本
 *
 * 支持中英文的文本定义
 */
export interface I18nText {
  en: string;
  zh: string;
}

/**
 * 支持的语言
 */
export type SupportedLanguage = 'en' | 'zh';

// ============================================================================
// 端口定义
// ============================================================================

/**
 * 端口定义
 *
 * 定义节点的输入或输出端口
 */
export interface PortDefinition {
  /** 端口名称 */
  name: string;

  /** 端口数据类型 */
  type: PortType;

  /** 是否必需 */
  required: boolean;

  /** 多语言描述 */
  description?: I18nText;

  /** 默认值 */
  defaultValue?: any;

  /** 验证规则 */
  validation?: PortValidation;

  /** 是否支持多个值 */
  isArray?: boolean;

  /** 端口 Schema（用于复杂对象） */
  schema?: JSONSchema;
}

/**
 * 端口验证规则
 */
export interface PortValidation {
  /** 最小值（数字类型） */
  min?: number;

  /** 最大值（数字类型） */
  max?: number;

  /** 正则表达式（字符串类型） */
  pattern?: string;

  /** 枚举值列表 */
  enum?: any[];

  /** 最小长度（字符串/数组） */
  minLength?: number;

  /** 最大长度（字符串/数组） */
  maxLength?: number;
}

/**
 * JSON Schema 简化定义
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: any[];
  default?: any;
  description?: string;
  [key: string]: any;
}

// ============================================================================
// 节点配置
// ============================================================================

/**
 * 配置字段定义
 *
 * 定义节点的可配置项
 */
export interface ConfigFieldDefinition {
  /** 字段名称 */
  name: string;

  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'code' | 'textarea';

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

  /** JSON Schema 形式（用于验证） */
  jsonSchema?: JSONSchema;
}

// ============================================================================
// 节点定义
// ============================================================================

/**
 * 节点定义
 *
 * 定义一个节点类型的基本信息和接口
 */
export interface INode {
  /** 节点唯一标识符 */
  id: string;

  /** 节点类型 */
  type: NodeType;

  /** 节点分类 */
  category: NodeCategory;

  /** 节点图标（emoji 或 URL） */
  icon: string;

  /** 多语言名称 */
  name: I18nText;

  /** 多语言描述 */
  description: I18nText;

  /** 输入端口定义 */
  inputs: PortDefinition[];

  /** 输出端口定义 */
  outputs: PortDefinition[];

  /** 配置 Schema */
  configSchema?: NodeConfigSchema;

  /** 默认配置值 */
  defaultConfig?: Record<string, any>;

  /** 标签（用于搜索和分类） */
  tags?: string[];

  /** 颜色（UI 显示用） */
  color?: string;

  /** 强调色（UI 显示用） */
  accentColor?: string;
}

/**
 * 节点注册表项
 *
 * 节点注册表中的一项，包含定义和执行器
 */
export interface NodeRegistryItem {
  /** 节点定义 */
  definition: INode;

  /** 节点执行器 */
  executor: INodeExecutor;
}

// ============================================================================
// 节点执行器
// ============================================================================

/**
 * 节点执行器接口
 *
 * 所有节点执行器必须实现此接口
 */
export interface INodeExecutor {
  /** 节点定义 */
  definition: INode;

  /**
   * 验证输入
   * @param inputs 输入数据
   * @throws 验证失败时抛出错误
   */
  validateInputs(inputs: Record<string, any>): void;

  /**
   * 验证配置
   * @param config 配置数据
   * @throws 验证失败时抛出错误
   */
  validateConfig(config: Record<string, any>): void;

  /**
   * 执行节点
   * @param context 执行上下文
   * @returns 执行结果
   */
  execute(context: NodeContext): Promise<NodeResult>;
}

// ============================================================================
// 节点执行上下文
// ============================================================================

/**
 * 日志接口
 */
export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
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
 * 河网访问接口（简化引用）
 *
 * 节点通过此接口访问河网系统
 */
export interface RiverNetworkAccess {
  getMainFlow(): any;
  broadcast(message: any): void;
  createBranch(config: any): any;
  getBranch(branchId: string): any | undefined;
  listBranches(): any[];
  switchToBranch(branchId: string): void;
  mergeBranch(branchId: string): any;
  abandonBranch(branchId: string, reason: string): void;
  createSyncPoint(config: any): any;
  getSyncPoint(syncPointId: string): any | undefined;
  joinSyncPoint(syncPointId: string, branchId: string): void;
  triggerSync(syncPointId: string): Promise<any>;
  getRelatedSyncPoints(branchId: string): any[];
  publishDecision(branchId: string, decision: any): any;
  declareDependency(branchId: string, dependency: any): any;
  checkDependencies(branchId: string): any[];
  detectConflicts(options?: any): any[];
  resolveConflict(conflictId: string, resolution: any): void;
  getUnresolvedConflicts(): any[];
  subscribe(subscription: any): void;
  unsubscribe(subscriber: string, publisher: string): void;
  sendMessage(message: any): void;
  onMessage(branchId: string, callback: (msg: any) => void): void;
  query(branchId: string, targetBranch: string, topic: string, query: any): Promise<any>;
}

/**
 * 节点执行上下文
 *
 * 节点执行时提供的上下文信息
 */
export interface NodeContext {
  /** 任务 ID */
  taskId: string;

  /** 工作流 ID */
  workflowId: string;

  /** 支流 ID（可选，在河网中使用） */
  branchId?: string;

  /** 节点实例 ID */
  nodeId: string;

  /** 输入数据 */
  inputs: Record<string, any>;

  /** 节点配置 */
  config: Record<string, any>;

  /** 工作流状态 */
  state: Record<string, any>;

  /** 河网访问接口（可选） */
  memory?: RiverNetworkAccess;

  /** 日志记录器 */
  logger: ILogger;

  /** 事件发射器（可选） */
  emitter?: IEventEmitter;
}

// ============================================================================
// 节点执行结果
// ============================================================================

/**
 * 节点执行指标
 */
export interface NodeMetrics {
  /** 执行持续时间（毫秒） */
  duration: number;

  /** 使用的 token 数量 */
  tokensUsed?: number;

  /** 内存使用（字节） */
  memoryUsage?: number;

  /** CPU 使用率（百分比） */
  cpuUsage?: number;
}

/**
 * 节点执行结果
 *
 * 节点执行后返回的结果
 */
export interface NodeResult {
  /** 是否成功 */
  success: boolean;

  /** 输出数据 */
  outputs: Record<string, any>;

  /** 错误信息（失败时） */
  error?: Error;

  /** 执行指标 */
  metrics?: NodeMetrics;

  /** 建议的下一个节点（动态路由） */
  nextNodes?: string[];
}

// ============================================================================
// 预定义节点类型列表
// ============================================================================

/**
 * 预定义节点 ID
 *
 * 所有内置节点的 ID 列表
 */
export type BuiltinNodeId =
  // 输入类节点
  | 'receive'
  | 'understand'
  | 'clarify'
  // 规划类节点
  | 'analyze'
  | 'design'
  | 'decompose'
  | 'spec'
  // 执行类节点
  | 'code'
  | 'test'
  | 'generate'
  | 'transform'
  // 审核类节点
  | 'review'
  | 'validate'
  | 'security'
  // 决策类节点
  | 'branch'
  | 'merge'
  | 'loop'
  // 协调类节点
  | 'parallel'
  | 'sequence'
  | 'assign'
  | 'aggregate'
  | 'barrier'
  | 'negotiate'
  // 输出类节点
  | 'report'
  | 'store'
  | 'notify';

/**
 * 节点分类映射
 */
export const NODE_CATEGORIES: Record<NodeCategory, { name: I18nText; icon: string }> = {
  input: {
    name: { en: 'Input', zh: '输入' },
    icon: '📥'
  },
  planning: {
    name: { en: 'Planning', zh: '规划' },
    icon: '📋'
  },
  execution: {
    name: { en: 'Execution', zh: '执行' },
    icon: '⚡'
  },
  review: {
    name: { en: 'Review', zh: '审核' },
    icon: '✅'
  },
  decision: {
    name: { en: 'Decision', zh: '决策' },
    icon: '🔀'
  },
  coordinate: {
    name: { en: 'Coordinate', zh: '协调' },
    icon: '🔗'
  },
  output: {
    name: { en: 'Output', zh: '输出' },
    icon: '📤'
  }
};

/**
 * 端口类型映射
 */
export const PORT_TYPES: Record<PortType, { name: I18nText; color: string }> = {
  string: { name: { en: 'String', zh: '字符串' }, color: '#3b82f6' },
  number: { name: { en: 'Number', zh: '数字' }, color: '#10b981' },
  boolean: { name: { en: 'Boolean', zh: '布尔值' }, color: '#f59e0b' },
  object: { name: { en: 'Object', zh: '对象' }, color: '#8b5cf6' },
  array: { name: { en: 'Array', zh: '数组' }, color: '#ec4899' },
  any: { name: { en: 'Any', zh: '任意' }, color: '#6b7280' },
  stream: { name: { en: 'Stream', zh: '流' }, color: '#06b6d4' },
  file: { name: { en: 'File', zh: '文件' }, color: '#f97316' },
  agent: { name: { en: 'Agent', zh: 'Agent' }, color: '#14b8a6' },
  task: { name: { en: 'Task', zh: '任务' }, color: '#a855f7' },
  message: { name: { en: 'Message', zh: '消息' }, color: '#0ea5e9' }
};
