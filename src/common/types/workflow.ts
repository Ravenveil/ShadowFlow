/**
 * 工作流系统类型定义
 *
 * 定义工作流、工作流模式、任务特征和执行状态等核心类型
 * 参考 docs/Workflow-Nodes-Analysis.md 设计文档
 */

// ============================================================================
// 基础枚举类型
// ============================================================================

/**
 * 工作流状态
 */
export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * 节点分类（用于配置）
 */
export type NodeCategory = 'input' | 'planning' | 'execution' | 'review' | 'decision' | 'coordinate' | 'output';

/**
 * 任务项目类型
 */
export type ProjectType = 'greenfield' | 'brownfield';

/**
 * 任务类型
 */
export type TaskType = 'coding' | 'analysis' | 'documentation' | 'review' | 'testing' | 'debugging';

/**
 * 质量要求级别
 */
export type QualityRequirement = 'low' | 'normal' | 'high' | 'critical';

// ============================================================================
// 工作流定义
// ============================================================================

/**
 * 工作流定义
 *
 * 完整的工作流结构，包含节点、边、角色和权限配置
 */
export interface Workflow {
  /** 工作流唯一标识符 */
  id: string;

  /** 工作流名称 */
  name: string;

  /** 工作流描述 */
  description?: string;

  /** 节点定义列表 */
  nodes: NodeDefinition[];

  /** 边定义列表 */
  edges: EdgeDefinition[];

  /** 角色配置 */
  roles: RoleConfig;

  /** 权限配置 */
  permissions: PermissionConfig;

  /** 元数据 */
  metadata?: WorkflowMetadata;
}

/**
 * 工作流元数据
 */
export interface WorkflowMetadata {
  /** 创建时间 */
  createdAt?: Date;

  /** 更新时间 */
  updatedAt?: Date;

  /** 版本号 */
  version?: string;

  /** 作者 */
  author?: string;

  /** 标签 */
  tags?: string[];

  /** 工作流类型 */
  type?: 'custom' | 'generated' | 'preset';

  /** 预估执行时间（分钟） */
  estimatedDuration?: number;
}

/**
 * 节点定义（用于工作流配置）
 */
export interface NodeDefinition {
  /** 节点实例 ID */
  id: string;

  /** 节点类型（引用节点注册表中的节点类型） */
  type: string;

  /** 节点名称（可选，覆盖默认名称） */
  name?: string;

  /** 节点配置值 */
  config?: Record<string, any>;

  /** 节点在画布上的位置 */
  position?: { x: number; y: number };
}

/**
 * 边定义
 *
 * 定义节点之间的连接关系
 */
export interface EdgeDefinition {
  /** 边唯一标识符 */
  id: string;

  /** 源节点 ID */
  from: string;

  /** 目标节点 ID */
  to: string;

  /** 条件表达式（用于条件路由） */
  condition?: string;

  /** 边标签 */
  label?: string;

  /** 边类型 */
  edgeType?: 'default' | 'smoothstep' | 'bezier' | 'straight';

  /** 是否动画 */
  animated?: boolean;

  /** 源端口名称 */
  sourceHandle?: string;

  /** 目标端口名称 */
  targetHandle?: string;
}

/**
 * 角色配置（简化版，完整定义在 role.ts）
 */
export interface RoleConfig {
  /** 使用预定义角色 */
  use?: string[];

  /** 自定义角色 */
  custom?: any[];
}

/**
 * 权限配置（简化版，完整定义在 role.ts）
 */
export interface PermissionConfig {
  /** 权限模板名称 */
  template?: string;

  /** 覆盖特定权限 */
  overrides?: Record<string, any>;

  /** 自定义权限 */
  custom?: Record<string, any>;
}

// ============================================================================
// 工作流模式
// ============================================================================

/**
 * 工作流模式
 *
 * 预定义的工作流模板
 */
export interface WorkflowPattern {
  /** 模式唯一标识符 */
  id: string;

  /** 模式名称 */
  name: string;

  /** 模式描述 */
  description?: string;

  /** 节点定义 */
  nodes: NodeDefinition[];

  /** 边定义 */
  edges: EdgeDefinition[];

  /** 角色配置 */
  roles: RoleConfig;

  /** 权限配置 */
  permissions: PermissionConfig;

  /** 适用的任务类型 */
  applicableTo?: TaskType[];

  /** 模式元数据 */
  metadata?: {
    complexity?: 'simple' | 'medium' | 'complex';
    estimatedDuration?: number;
    requiresParallel?: boolean;
    requiresNegotiation?: boolean;
  };
}

/**
 * 预定义工作流模式类型
 */
export type PresetWorkflowPattern =
  | 'linear'           // 线性流程
  | 'tdd'             // TDD 流程
  | 'review'           // 审核流程
  | 'parallel'         // 并行流程
  | 'negotiate'        // 协商流程
  | 'full-spec';       // 规范驱动流程

// ============================================================================
// 任务特征
// ============================================================================

/**
 * 任务特征
 *
 * 描述任务的各种特征，用于自动生成合适的工作流
 */
export interface TaskFeatures {
  /** 项目类型 */
  projectType: ProjectType;

  /** 任务类型 */
  type: TaskType;

  /** 复杂度 (0-1) */
  complexity: number;

  /** 质量要求级别 */
  qualityRequirement: QualityRequirement;

  /** 是否需要 TDD */
  needsTdd: boolean;

  /** 是否需要代码审查 */
  needsReview: boolean;

  /** 是否需要并行执行 */
  needsParallel: boolean;

  /** 是否需要协商 */
  needsNegotiation: boolean;

  /** 是否需要设计阶段 */
  needsDesign: boolean;

  /** 是否可以分解任务 */
  canDecompose: boolean;

  /** 是否可以并行执行 */
  canParallel: boolean;

  /** 预估子任务数量 */
  estimatedSubtasks: number;

  /** 预估持续时间（分钟） */
  estimatedDuration: number;
}

/**
 * 任务特征分析结果
 */
export interface TaskFeatureAnalysis {
  /** 分析的任务特征 */
  features: TaskFeatures;

  /** 推荐的工作流模式 */
  recommendedPatterns: PresetWorkflowPattern[];

  /** 推荐的节点序列 */
  recommendedNodes: string[];

  /** 分析置信度 (0-1) */
  confidence: number;

  /** 分析耗时（毫秒） */
  analysisTime: number;
}

/**
 * 复杂度分解
 */
export interface ComplexityBreakdown {
  /** 组件复杂度 (0-1) */
  component: number;

  /** 协调复杂度 (0-1) */
  coordinative: number;

  /** 动态复杂度 (0-1) */
  dynamic: number;

  /** 总体复杂度 (0-1) */
  overall: number;
}

// ============================================================================
// 工作流执行状态
// ============================================================================

/**
 * 工作流状态
 *
 * 工作流执行时的状态信息
 */
export interface WorkflowExecutionState {
  /** 工作流 ID */
  workflowId: string;

  /** 执行 ID */
  executionId: string;

  /** 执行状态 */
  status: WorkflowStatus;

  /** 当前节点 ID */
  currentNodeId?: string;

  /** 已完成的节点 ID 列表 */
  completedNodes: string[];

  /** 失败的节点 ID 列表 */
  failedNodes: string[];

  /** 检查点列表 */
  checkpoints: Checkpoint[];

  /** 开始时间 */
  startedAt?: Date;

  /** 完成时间 */
  completedAt?: Date;

  /** 执行日志 */
  logs: ExecutionLog[];

  /** 节点执行结果 */
  nodeResults: Record<string, NodeExecutionResult>;
}

/**
 * 检查点
 *
 * 工作流执行过程中的状态快照
 */
export interface Checkpoint {
  /** 检查点 ID */
  id: string;

  /** 节点 ID */
  nodeId: string;

  /** 节点状态快照 */
  state: Record<string, any>;

  /** 创建时间 */
  timestamp: Date;

  /** 检查点描述 */
  description?: string;
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  /** 日志 ID */
  id: string;

  /** 时间戳 */
  timestamp: Date;

  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** 日志消息 */
  message: string;

  /** 相关节点 ID */
  nodeId?: string;

  /** 附加数据 */
  data?: any;
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
  /** 节点 ID */
  nodeId: string;

  /** 是否成功 */
  success: boolean;

  /** 输出数据 */
  outputs: Record<string, any>;

  /** 错误信息 */
  error?: Error;

  /** 执行指标 */
  metrics?: NodeExecutionMetrics;

  /** 开始时间 */
  startedAt: Date;

  /** 结束时间 */
  completedAt: Date;
}

/**
 * 节点执行指标
 */
export interface NodeExecutionMetrics {
  /** 执行持续时间（毫秒） */
  duration: number;

  /** 使用的 token 数量 */
  tokensUsed?: number;

  /** 内存使用（字节） */
  memoryUsage?: number;

  /** CPU 使用率（百分比） */
  cpuUsage?: number;
}

// ============================================================================
// 工作流生成
// ============================================================================

/**
 * 工作流生成选项
 */
export interface WorkflowGenerationOptions {
  /** 是否包含审核节点 */
  includeReview?: boolean;

  /** 是否包含测试节点 */
  includeTest?: boolean;

  /** 是否包含检查点 */
  includeCheckpoint?: boolean;

  /** 最大并行数 */
  maxConcurrency?: number;

  /** 优化目标 */
  optimization?: 'speed' | 'quality' | 'balance';
}

/**
 * 生成的工作流
 */
export interface GeneratedWorkflow {
  /** 工作流定义 */
  workflow: Workflow;

  /** 生成元数据 */
  metadata: GenerationMetadata;
}

/**
 * 生成元数据
 */
export interface GenerationMetadata {
  /** 生成时间 */
  generatedAt: Date;

  /** 基于的任务特征 */
  basedOnFeatures: TaskFeatures;

  /** 生成置信度 (0-1) */
  confidence: number;

  /** 生成耗时（毫秒） */
  generationTime: number;

  /** 使用的模式 */
  patternsUsed: PresetWorkflowPattern[];
}

// ============================================================================
// 工作流验证
// ============================================================================

/**
 * 工作流验证结果
 */
export interface WorkflowValidationResult {
  /** 是否有效 */
  valid: boolean;

  /** 错误列表 */
  errors: ValidationError[];

  /** 警告列表 */
  warnings: ValidationWarning[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误类型 */
  type: 'missing_node' | 'invalid_edge' | 'cycle_detected' | 'invalid_config';

  /** 错误消息 */
  message: string;

  /** 相关节点 ID */
  nodeId?: string;

  /** 相关边 ID */
  edgeId?: string;
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  /** 警告类型 */
  type: 'unused_node' | 'no_output' | 'potential_deadlock';

  /** 警告消息 */
  message: string;

  /** 相关节点 ID */
  nodeId?: string;
}

// ============================================================================
// 工作流导入/导出
// ============================================================================

/**
 * 工作流导出格式
 */
export type WorkflowExportFormat = 'json' | 'yaml' | 'typescript' | 'graphviz';

/**
 * 工作流导出选项
 */
export interface WorkflowExportOptions {
  /** 导出格式 */
  format: WorkflowExportFormat;

  /** 是否包含执行日志 */
  includeLogs?: boolean;

  /** 是否包含检查点 */
  includeCheckpoints?: boolean;

  /** 是否压缩输出 */
  compress?: boolean;
}

/**
 * 工作流导入选项
 */
export interface WorkflowImportOptions {
  /** 是否验证导入 */
  validate?: boolean;

  /** 是否覆盖同名工作流 */
  overwrite?: boolean;

  /** 是否自动修复警告 */
  autoFixWarnings?: boolean;
}
