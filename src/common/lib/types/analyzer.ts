/**
 * AgentGraph 工作流自动生成算法类型定义
 *
 * 定义了任务特征、规则、工作流等核心数据结构
 */

/**
 * 复杂度评分
 */
export interface ComplexityScore {
  /** 组件复杂度 (0-1): 衡量任务内部组件的数量和复杂程度 */
  component: number;
  /** 协调复杂度 (0-1): 衡量跨组件、跨文件协作的复杂程度 */
  coordinative: number;
  /** 动态复杂度 (0-1): 衡量任务执行过程中的动态变化和不确定性 */
  dynamic: number;
}

/**
 * 任务类型
 */
export type TaskType =
  | 'coding'        // 编码任务
  | 'analysis'      // 分析任务
  | 'documentation' // 文档任务
  | 'review'        // 审核任务
  | 'testing'       // 测试任务
  | 'debugging';    // 调试任务

/**
 * 质量要求级别
 */
export type QualityRequirement = 'low' | 'normal' | 'high' | 'critical';

/**
 * 任务特征
 */
export interface TaskFeatures {
  /** 复杂度评分 */
  complexity: ComplexityScore;

  /** 任务类型 */
  type: TaskType;

  /** 规模估算 */
  scale: {
    estimated_subtasks: number;   // 估算的子任务数量
    estimated_duration: number;   // 估算的执行时长（分钟）
    estimated_tokens: number;     // 估算的 token 消耗
    estimated_files: number;      // 估算的文件数量
  };

  /** 特征标记 */
  flags: {
    needs_tdd: boolean;           // 需要 TDD 模式
    needs_review: boolean;        // 需要审核
    needs_parallel: boolean;      // 需要并行执行
    needs_negotiation: boolean;   // 需要协商
    needs_design: boolean;        // 需要设计阶段
    needs_decompose: boolean;     // 需要任务分解
    needs_security: boolean;      // 需要安全审计
    needs_integration: boolean;   // 需要集成测试
    needs_doc: boolean;           // 需要生成文档
    needs_refactor: boolean;      // 需要重构
  };

  /** 质量要求 */
  quality_requirement: QualityRequirement;

  /** 技术栈信息 */
  tech_stack?: {
    languages: string[];          // 编程语言
    frameworks: string[];         // 框架
    libraries: string[];          // 库
  };

  /** 域特定特征 */
  domain_features?: Record<string, any>;
}

/**
 * 分析选项
 */
export interface AnalyzeOptions {
  /** 是否使用 LLM 辅助分析 */
  use_llm?: boolean;

  /** LLM 分析深度: 'quick' | 'standard' | 'deep' */
  llm_depth?: 'quick' | 'standard' | 'deep';

  /** 自定义规则 */
  custom_rules?: Rule[];

  /** 是否包含详细日志 */
  verbose?: boolean;
}

/**
 * 规则定义
 */
export interface Rule {
  /** 规则唯一标识符 */
  id: string;

  /** 规则名称 */
  name: string;

  /** 规则描述 */
  description?: string;

  /** 规则优先级 (数值越大优先级越高) */
  priority: number;

  /** 规则类别 */
  category: 'complexity' | 'type' | 'quality' | 'parallel' | 'custom';

  /** 触发条件 (表达式或函数) */
  condition: RuleCondition;

  /** 规则动作 */
  action: RuleAction;

  /** 是否启用 */
  enabled?: boolean;

  /** 规则标签 */
  tags?: string[];
}

/**
 * 规则条件
 */
export type RuleCondition =
  | { type: 'and'; conditions: RuleCondition[] }
  | { type: 'or'; conditions: RuleCondition[] }
  | { type: 'not'; condition: RuleCondition }
  | { type: 'compare'; field: string; operator: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains'; value: any }
  | { type: 'range'; field: string; min: number; max: number }
  | { type: 'in'; field: string; values: any[] }
  | { type: 'custom'; fn: (features: TaskFeatures) => boolean };

/**
 * 规则动作
 */
export type RuleAction =
  | { type: 'add_node'; node: NodeDefinition; position: 'before' | 'after' | 'replace'; target?: string }
  | { type: 'add_nodes'; nodes: NodeDefinition[] }
  | { type: 'remove_node'; node_id: string }
  | { type: 'modify_node'; node_id: string; modifications: Partial<NodeDefinition> }
  | { type: 'add_edge'; edge: EdgeDefinition }
  | { type: 'remove_edge'; edge_id: string }
  | { type: 'set_config'; node_id: string; config: Record<string, any> }
  | { type: 'custom'; fn: (workflow: GeneratedWorkflow, features: TaskFeatures) => void };

/**
 * 节点定义
 */
export interface NodeDefinition {
  /** 节点唯一标识符 */
  id: string;

  /** 节点类型 */
  type: string;

  /** 节点位置 */
  position: { x: number; y: number };

  /** 节点配置 */
  config?: Record<string, any>;

  /** 节点数据 */
  data?: Record<string, any>;

  /** 输入端口定义 */
  inputs?: PortDefinition[];

  /** 输出端口定义 */
  outputs?: PortDefinition[];
}

/**
 * 边定义
 */
export interface EdgeDefinition {
  /** 边唯一标识符 */
  id: string;

  /** 源节点 ID */
  source: string;

  /** 目标节点 ID */
  target: string;

  /** 源端口 */
  sourceHandle?: string;

  /** 目标端口 */
  targetHandle?: string;

  /** 边标签 */
  label?: string;

  /** 边样式 */
  style?: Record<string, any>;

  /** 边类型 */
  type?: 'default' | 'smoothstep' | 'step' | 'straight';
}

/**
 * 端口定义
 */
export interface PortDefinition {
  /** 端口名称 */
  name: string;

  /** 端口类型 */
  type: string;

  /** 是否必需 */
  required?: boolean;

  /** 默认值 */
  default_value?: any;

  /** 描述 */
  description?: string;
}

/**
 * 生成的工作流
 */
export interface GeneratedWorkflow {
  /** 节点列表 */
  nodes: NodeDefinition[];

  /** 边列表 */
  edges: EdgeDefinition[];

  /** 元数据 */
  metadata: {
    generated_at: Date;
    based_on_features: TaskFeatures;
    applied_rules: string[];
    confidence: number;
    version: string;
  };
}

/**
 * 规则引擎配置
 */
export interface RuleEngineConfig {
  /** 规则文件路径 */
  rule_files?: string[];

  /** 规则列表 */
  rules?: Rule[];

  /** 是否启用默认规则 */
  use_default_rules?: boolean;

  /** 规则冲突处理策略 */
  conflict_resolution?: 'first' | 'last' | 'highest_priority' | 'merge';

  /** 最大递归深度 */
  max_recursion_depth?: number;
}

/**
 * 规则执行结果
 */
export interface RuleExecutionResult {
  /** 规则 ID */
  rule_id: string;

  /** 是否匹配 */
  matched: boolean;

  /** 是否执行成功 */
  success: boolean;

  /** 修改的节点数量 */
  modified_nodes: number;

  /** 修改的边数量 */
  modified_edges: number;

  /** 错误信息 */
  error?: string;

  /** 执行耗时 (毫秒) */
  duration_ms: number;
}

/**
 * 规则引擎执行报告
 */
export interface RuleEngineReport {
  /** 执行时间 */
  executed_at: Date;

  /** 执行的规则数量 */
  total_rules: number;

  /** 匹配的规则数量 */
  matched_rules: number;

  /** 执行成功的规则数量 */
  successful_rules: number;

  /** 执行失败的规则数量 */
  failed_rules: number;

  /** 规则执行结果详情 */
  details: RuleExecutionResult[];

  /** 总执行耗时 (毫秒) */
  total_duration_ms: number;
}

/**
 * 工作流生成器配置
 */
export interface WorkflowGeneratorConfig {
  /** 规则引擎配置 */
  rule_engine?: RuleEngineConfig;

  /** 默认节点位置配置 */
  default_layout?: {
    start_x: number;
    start_y: number;
    node_spacing_x: number;
    node_spacing_y: number;
  };

  /** 是否启用自动布局 */
  auto_layout?: boolean;

  /** 置信度阈值 */
  confidence_threshold?: number;

  /** 是否启用验证 */
  validate?: boolean;
}

/**
 * 特征提取报告
 */
export interface AnalyzerReport {
  /** 输入任务描述 */
  input: string;

  /** 提取的特征 */
  features: TaskFeatures;

  /** 提取耗时 (毫秒) */
  duration_ms: number;

  /** 使用的分析方法 */
  methods: string[];

  /** LLM 调用次数 */
  llm_calls: number;

  /** 是否使用缓存 */
  cached: boolean;
}
