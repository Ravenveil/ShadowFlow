// ============================================================================
// 类型定义 - ShadowFlow 图形界面核心类型
// ============================================================================

// ----------------------------------------------------------------------------
// 节点分类
// ----------------------------------------------------------------------------
export type NodeCategory =
  | 'input'       // 输入节点
  | 'planning'    // 规划节点
  | 'execution'   // 执行节点
  | 'review'      // 审核节点
  | 'decision'    // 决策节点
  | 'coordinate'  // 协调节点
  | 'output';     // 输出节点

// ----------------------------------------------------------------------------
// 端口类型
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// 端口定义
// ----------------------------------------------------------------------------
export interface PortDefinition {
  name: string;
  type: PortType;
  required: boolean;
  description?: { en: string; zh: string };
  defaultValue?: any;
  schema?: JSONSchema;
}

// ----------------------------------------------------------------------------
// JSON Schema 简化定义
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// 节点定义
// ----------------------------------------------------------------------------
export interface INode {
  // 基础信息
  id: string;
  type: 'builtin' | 'custom';
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  category: NodeCategory;
  icon: string;

  // 输入输出
  inputs: PortDefinition[];
  outputs: PortDefinition[];

  // 配置
  configSchema?: JSONSchema;
  defaultConfig?: Record<string, any>;

  // 视觉属性
  color?: string;
  accentColor?: string;
}

// ----------------------------------------------------------------------------
// ReactFlow 节点数据
// ----------------------------------------------------------------------------
export interface NodeData {
  nodeId: string;
  nodeType: string;
  category: NodeCategory;
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  icon: string;
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  config: Record<string, any>;
  status?: 'idle' | 'running' | 'success' | 'error' | 'warning';
  selected?: boolean;
}

// ----------------------------------------------------------------------------
// 边数据
// ----------------------------------------------------------------------------
export interface EdgeData {
  label?: string;
  condition?: string;  // 条件路由
  dataFlow?: boolean;  // 数据流标记
}

// ----------------------------------------------------------------------------
// 工作流状态
// ----------------------------------------------------------------------------
export interface WorkflowState {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, any>;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: number;
  };
}

// ----------------------------------------------------------------------------
// 工作流节点
// ----------------------------------------------------------------------------
export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

// ----------------------------------------------------------------------------
// 工作流边
// ----------------------------------------------------------------------------
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  data?: EdgeData;
  label?: string;
}

// ----------------------------------------------------------------------------
// 节点执行上下文
// ----------------------------------------------------------------------------
export interface NodeContext {
  taskId: string;
  workflowId: string;
  nodeId: string;
  inputs: Record<string, any>;
  config: Record<string, any>;
  state: WorkflowState;
  logger: Logger;
  emitter?: EventEmitter;
}

// ----------------------------------------------------------------------------
// 节点执行结果
// ----------------------------------------------------------------------------
export interface NodeResult {
  success: boolean;
  outputs: Record<string, any>;
  error?: Error;
  metrics?: NodeMetrics;
  nextNodes?: string[];
}

// ----------------------------------------------------------------------------
// 节点指标
// ----------------------------------------------------------------------------
export interface NodeMetrics {
  executionTime: number;
  memoryUsage?: number;
  tokenUsage?: number;
  timestamp: Date;
}

// ----------------------------------------------------------------------------
// 日志接口
// ----------------------------------------------------------------------------
export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

// ----------------------------------------------------------------------------
// 事件发射器
// ----------------------------------------------------------------------------
export interface EventEmitter {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void);
  emit(event: string, ...args: any[]): void;
}

// ----------------------------------------------------------------------------
// 任务特征
// ----------------------------------------------------------------------------
export interface TaskFeatures {
  complexity: {
    component: number;
    coordinative: number;
    dynamic: number;
  };
  type: 'coding' | 'analysis' | 'documentation' | 'review' | 'testing';
  estimated_subtasks: number;
  estimated_duration: number;
  estimated_tokens: number;
  needs_tdd: boolean;
  needs_review: boolean;
  needs_parallel: boolean;
  needs_negotiation: boolean;
  needs_design: boolean;
  needs_decompose: boolean;
  quality_requirement: 'low' | 'normal' | 'high' | 'critical';
}

// ----------------------------------------------------------------------------
// 自动生成工作流
// ----------------------------------------------------------------------------
export interface GeneratedWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    generated_at: Date;
    based_on_features: TaskFeatures;
    confidence: number;
  };
}

// ----------------------------------------------------------------------------
// UI 状态
// ----------------------------------------------------------------------------
export interface UIState {
  language: 'en' | 'zh';
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  configPanelOpen: boolean;
  miniMapOpen: boolean;
  selectedNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
}

// ----------------------------------------------------------------------------
// 导出格式
// ----------------------------------------------------------------------------
export type ExportFormat = 'json' | 'yaml' | 'typescript';

// ----------------------------------------------------------------------------
// 撤销/重做历史
// ----------------------------------------------------------------------------
export interface HistoryEntry {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  timestamp: Date;
  description?: string;
}

// ----------------------------------------------------------------------------
// 自动布局算法
// ----------------------------------------------------------------------------
export type LayoutAlgorithm = 'hierarchical' | 'force' | 'circular' | 'grid';

// ----------------------------------------------------------------------------
// 配置面板编辑器类型
// ----------------------------------------------------------------------------
export type ConfigEditorType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'json'
  | 'code'
  | 'file'
  | 'color';

// ----------------------------------------------------------------------------
// 配置字段定义
// ----------------------------------------------------------------------------
export interface ConfigField {
  key: string;
  type: ConfigEditorType;
  label: { en: string; zh: string };
  description?: { en: string; zh: string };
  default?: any;
  options?: Array<{ value: any; label: { en: string; zh: string } }>;
  min?: number;
  max?: number;
  required?: boolean;
  placeholder?: string;
}

// ----------------------------------------------------------------------------
// 节点搜索过滤器
// ----------------------------------------------------------------------------
export interface NodeFilter {
  category?: NodeCategory[];
  search?: string;
  type?: 'builtin' | 'custom' | 'all';
}

// ============================================================================
// 导出核心节点类型
// ============================================================================
export * from './node-core';

// ============================================================================
// 导出角色和权限类型
// ============================================================================
export * from './role';

// ============================================================================
// 导出河网类型（避免与 memory 重复）
// ============================================================================
export type {
  Branch,
  BranchConfig,
  BranchMessage,
  BranchStatus,
  SyncPoint,
  SyncPointConfig,
  SyncPointStatus,
  Conflict,
  ConflictType,
  ConflictResolution,
  ConflictDetectionOptions,
  Decision,
  DecisionType,
  Dependency,
  Agreement,
  Message,
  MessageType,
  Subscription,
  RiverNetworkAccess
} from './river';

// ============================================================================
// 导出记忆类型
// ============================================================================
export * from './memory';

// ============================================================================
// 导出工作流类型
// ============================================================================
export * from './workflow';

// ============================================================================
// 导出节点特定类型
// ============================================================================
export * from './node';
export * from './node.types';
