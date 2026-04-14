/**
 * ShadowFlow 节点类型定义
 * 定义节点、端口、执行上下文和结果等核心类型
 */

// ========== 节点端口定义 ==========

/**
 * 端口类型
 */
export type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any' | 'file' | 'json';

/**
 * 端口定义
 */
export interface PortDefinition {
  /** 端口名称 */
  name: string;
  /** 端口类型 */
  type: PortType;
  /** 是否必需 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: any;
  /** 描述（支持多语言） */
  description?: {
    en: string;
    zh: string;
  };
  /** 是否支持数组 */
  isMultiple?: boolean;
}

// ========== 节点分类 ==========

/**
 * 节点分类枚举
 */
export enum NodeCategory {
  INPUT = 'input',
  PLANNING = 'planning',
  EXECUTION = 'execution',
  REVIEW = 'review',
  DECISION = 'decision',
  COORDINATE = 'coordinate',
  OUTPUT = 'output'
}

// ========== 节点定义 ==========

/**
 * 节点类型标识
 */
export type NodeTypeId =
  // 输入类
  | 'receive'
  | 'understand'
  | 'clarify'
  // 规划类
  | 'analyze'
  | 'design'
  | 'decompose'
  | 'spec'
  // 执行类
  | 'code'
  | 'test'
  | 'generate'
  | 'transform'
  // 审核类
  | 'review'
  | 'validate'
  | 'security'
  // 决策类
  | 'branch'
  | 'merge'
  | 'loop'
  // 协调类
  | 'parallel'
  | 'sequence'
  | 'assign'
  | 'aggregate'
  | 'barrier'
  | 'negotiate'
  // 输出类
  | 'report'
  | 'store'
  | 'notify';

/**
 * 节点配置 Schema
 */
export interface NodeConfigSchema {
  type: 'object';
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * 节点定义接口
 */
export interface INode {
  /** 节点唯一标识符 */
  id: NodeTypeId;
  /** 节点分类 */
  category: NodeCategory;
  /** 节点名称（多语言） */
  name: {
    en: string;
    zh: string;
  };
  /** 节点描述（多语言） */
  description: {
    en: string;
    zh: string;
  };
  /** 节点图标 */
  icon: string;
  /** 输入端口定义 */
  inputs: PortDefinition[];
  /** 输出端口定义 */
  outputs: PortDefinition[];
  /** 配置 Schema */
  configSchema?: NodeConfigSchema;
  /** 默认配置 */
  defaultConfig?: Record<string, any>;
}

// ========== 执行上下文 ==========

/**
 * Agent 池信息
 */
export interface AgentPool {
  /** 获取可用 Agent */
  getAvailable(capabilities: string[]): AgentInfo | null;
  /** 预订 Agent */
  reserve(agentId: string): Promise<boolean>;
  /** 释放 Agent */
  release(agentId: string): void;
}

/**
 * Agent 信息
 */
export interface AgentInfo {
  id: string;
  name: string;
  capabilities: string[];
  status: 'idle' | 'busy';
}

/**
 * MCP 工具注册表
 */
export interface MCPRegistry {
  /** 获取工具 */
  getTool(toolId: string): MCPTool | null;
  /** 执行工具 */
  executeTool(toolId: string, params: any): Promise<any>;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/**
 * 事件总线
 */
export interface EventBus {
  /** 发布事件 */
  publish(event: string, data: any): void;
  /** 订阅事件 */
  subscribe(event: string, handler: (data: any) => void): () => void;
}

/**
 * 工作流全局状态
 */
export interface WorkflowState {
  /** 工作流 ID */
  workflowId: string;
  /** 工作流变量 */
  variables: Record<string, any>;
  /** 当前执行的节点 ID */
  currentNodeId?: string;
  /** 执行历史 */
  executionHistory: NodeExecution[];
  /** LLM 客户端 */
  llmClient?: LLMClient;
  /** Agent 池 */
  agentPool?: AgentPool;
  /** MCP 注册表 */
  mcpRegistry?: MCPRegistry;
  /** 事件总线 */
  eventBus?: EventBus;
}

/**
 * 节点执行历史记录
 */
export interface NodeExecution {
  nodeId: string;
  timestamp: Date;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * LLM 客户端接口
 */
export interface LLMClient {
  /** 聊天对话 */
  chat(messages: ChatMessage[]): Promise<string>;
  /** 流式对话 */
  chatStream(messages: ChatMessage[]): AsyncGenerator<string>;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ========== 执行上下文 ==========

/**
 * 节点执行上下文
 */
export interface NodeContext {
  /** 工作流状态 */
  state: WorkflowState;
  /** 输入数据 */
  inputs: Record<string, any>;
  /** 节点配置 */
  config: Record<string, any>;
  /** 节点元数据 */
  metadata: {
    nodeId: string;
    nodeType: NodeTypeId;
    executionId: string;
    startTime: Date;
  };
  /** 🌊 河流记忆访问接口 */
  memory?: IRiverMemoryAccess;
}

// ========== 河流记忆访问接口 ==========

/**
 * 河流记忆访问接口
 *
 * 节点通过此接口与河流式记忆系统交互
 * - drink(): 取水（读取记忆）
 * - pour(): 注水（写入记忆）
 * - dredge(): 疏浚（读取沉淀层）
 * - settle(): 沉淀（写入沉淀层）
 * - buildDam(): 建闸（创建检查点）
 * - openDam(): 开闸（恢复检查点）
 */
export interface IRiverMemoryAccess {
  // ===== 取水（读取）=====

  /**
   * 从主流取水 - 自由读取指定类型的记忆
   * @param type 记忆类型，不指定则读取所有
   */
  drink(type?: MemoryType): IMemoryChunk[];

  /**
   * 用过滤网取水 - 条件查询
   * @param filter 过滤条件
   */
  scoop(filter: IMemoryFilter): IMemoryChunk[];

  /**
   * 从沉淀层取水 - 读取学习到的模式
   * @param filter 可选的过滤条件
   */
  dredge(filter?: IPatternFilter): IPattern[];

  // ===== 注水（写入）=====

  /**
   * 向主流注水 - 自由写入
   * @param chunk 记忆块
   */
  pour(chunk: IMemoryChunk): void;

  /**
   * 向沉淀层注水 - 记录学习
   * @param pattern 模式
   */
  settle(pattern: IPattern): void;

  // ===== 水闸操作 =====

  /**
   * 建闸 - 创建检查点
   * @returns 检查点ID
   */
  buildDam(): string;

  /**
   * 开闸 - 恢复到检查点
   * @param checkpointId 检查点ID
   */
  openDam(checkpointId: string): void;

  /**
   * 查看所有水闸
   */
  listDams(): ICheckpointSummary[];
}

// ========== 记忆相关类型 ==========

/**
 * 记忆类型
 */
export type MemoryType = 'context' | 'execution' | 'working' | 'knowledge';

/**
 * 记忆块
 */
export interface IMemoryChunk {
  /** 唯一ID */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 来源节点 */
  sourceNode?: string;
  /** 内容 */
  content: any;
  /** 元数据 */
  metadata: {
    createdAt: Date;
    importance: number;
    [key: string]: any;
  };
}

/**
 * 记忆过滤器
 */
export interface IMemoryFilter {
  type?: MemoryType;
  sourceNode?: string;
  timeRange?: { from: Date; to: Date };
  minImportance?: number;
}

/**
 * 模式（沉淀物）
 */
export interface IPattern {
  id: string;
  type: 'user_correction' | 'success_pattern' | 'solution';
  content: any;
  importance: number;
  reason?: string;
  associatedNodes?: string[];
}

/**
 * 模式过滤器
 */
export interface IPatternFilter {
  type?: IPattern['type'];
  minImportance?: number;
}

/**
 * 检查点摘要
 */
export interface ICheckpointSummary {
  id: string;
  createdAt: Date;
  trigger: string;
}

// ========== 执行结果 ==========

/**
 * 节点执行结果
 */
export interface NodeResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  outputs: Record<string, any>;
  /** 错误信息 */
  error?: Error;
  /** 执行元数据 */
  metadata?: {
    duration: number;
    warnings?: string[];
  };
}

// ========== 审核结果 ==========

/**
 * 审核结果
 */
export interface ReviewResult {
  /** 审核得分 (0-1) */
  score: number;
  /** 是否通过 */
  approved: boolean;
  /** 发现的问题 */
  issues: ReviewIssue[];
  /** 建议改进 */
  suggestions: string[];
  /** 修改建议内容 */
  revisedContent?: any;
}

/**
 * 审核问题
 */
export interface ReviewIssue {
  /** 问题类型 */
  type: 'error' | 'warning' | 'info';
  /** 问题描述 */
  message: string;
  /** 位置信息 */
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ========== 任务分析结果 ==========

/**
 * 任务理解结果
 */
export interface TaskUnderstanding {
  /** 任务描述 */
  description: string;
  /** 任务复杂度 (0-1) */
  complexity: number;
  /** 所需能力 */
  requiredCapabilities: string[];
  /** 模糊点 */
  ambiguities: string[];
  /** 澄清问题 */
  clarifyingQuestions?: string[];
  /** 预估子任务数 */
  estimatedSubtasks: number;
  /** 预估时长（分钟） */
  estimatedDuration: number;
}

// ========== 设计方案 ==========

/**
 * 技术方案
 */
export interface TechnicalDesign {
  /** 架构设计 */
  architecture: string;
  /** 数据模型 */
  dataModels: DataModel[];
  /** 接口定义 */
  interfaces: InterfaceDefinition[];
  /** 技术选型 */
  techStack: {
    framework?: string;
    language?: string;
    database?: string;
    libraries?: string[];
  };
  /** 实现步骤 */
  implementationSteps: string[];
}

/**
 * 数据模型
 */
export interface DataModel {
  name: string;
  fields: Record<string, string>;
  relationships?: string[];
}

/**
 * 接口定义
 */
export interface InterfaceDefinition {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  parameters: Record<string, string>;
  response: Record<string, string>;
}

// ========== 测试结果 ==========

/**
 * 测试结果
 */
export interface TestResult {
  /** 测试名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** 错误信息 */
  error?: string;
  /** 耗时 */
  duration: number;
  /** 输出 */
  output?: string;
}

/**
 * 测试套件结果
 */
export interface TestSuiteResult {
  /** 总测试数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 跳过数 */
  skipped: number;
  /** 测试结果列表 */
  results: TestResult[];
  /** 覆盖率 */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

// ========== 代码生成结果 ==========

/**
 * 代码生成结果
 */
export interface CodeGenerationResult {
  /** 生成的代码 */
  code: string;
  /** 文件路径 */
  filePath: string;
  /** 语言 */
  language: string;
  /** 依赖 */
  dependencies?: string[];
}

// ========== 数据转换结果 ==========

/**
 * 数据转换结果
 */
export interface TransformResult {
  /** 转换后的数据 */
  data: any;
  /** 转换统计 */
  statistics: {
    inputSize: number;
    outputSize: number;
    transformedCount: number;
    skippedCount: number;
  };
  /** 转换日志 */
  logs: string[];
}

// ========== 协商结果 ==========

/**
 * 协商结果
 */
export interface NegotiationResult {
  /** 是否达成一致 */
  agreed: boolean;
  /** 最终方案 */
  finalProposal?: any;
  /** 参与者意见 */
  opinions: Opinion[];
  /** 冲突点 */
  conflicts: Conflict[];
}

/**
 * 参与者意见
 */
export interface Opinion {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
}

/**
 * 冲突点
 */
export interface Conflict {
  description: string;
  participants: string[];
  resolved: boolean;
  resolution?: string;
}
