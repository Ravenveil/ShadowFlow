/**
 * 角色和权限系统类型定义
 *
 * 定义多 Agent 协作中的角色、权限和能力分配
 * 参考 docs/Workflow-Nodes-Analysis.md 的角色设计
 */

// ============================================================================
// 基础枚举类型
// ============================================================================

/**
 * 记忆访问权限类型
 */
export type MemoryType = 'context' | 'execution' | 'working' | 'knowledge' | 'all';

/**
 * 决策类型 - Agent 可以做出的决策类型
 */
export type DecisionType =
  | 'plan'        // 规划决策
  | 'assign'      // 任务分配决策
  | 'approve'     // 审批决策
  | 'reject'      // 驳回决策
  | 'dispatch'    // 调度决策
  | 'aggregate'   // 汇总决策
  | 'vote'        // 投票决策
  | 'override'    // 覆盖决策
  | 'all';        // 所有类型

/**
 * 节点分类 - 用于角色可访问的节点类型
 */
export type NodeCategory = 'input' | 'planning' | 'execution' | 'review' | 'decision' | 'coordinate' | 'output';

// ============================================================================
// 角色定义
// ============================================================================

/**
 * 角色定义
 *
 * 定义一个 Agent 角色的基本属性和能力范围
 */
export interface Role {
  /** 角色唯一标识符 */
  id: string;

  /** 角色名称 */
  name: string;

  /** 角色描述 */
  description: string;

  /** 允许访问的节点分类 */
  allowedNodes: NodeCategory[];

  /** 角色能力列表 */
  capabilities: string[];

  /** 优先级（数值越大优先级越高） */
  priority: number;

  /** 角色元数据 */
  metadata?: {
    createdAt?: Date;
    createdBy?: string;
    tags?: string[];
  };
}

/**
 * 预定义角色类型
 */
export type PredefinedRole =
  | 'leader'       // 领导者：可做所有决策，管理所有节点
  | 'planner'      // 规划者：规划节点权限
  | 'executor'     // 执行者：执行节点权限
  | 'reviewer'     // 审核者：审核节点权限
  | 'coordinator'  // 协调者：协调节点权限
  | 'observer';    // 观察者：只读权限

/**
 * 预定义角色映射
 */
export const PREDEFINED_ROLES: Record<PredefinedRole, Role> = {
  leader: {
    id: 'role-leader',
    name: 'Leader',
    description: '团队领导者，拥有完整的决策和管理权限',
    allowedNodes: ['input', 'planning', 'execution', 'review', 'decision', 'coordinate', 'output'],
    capabilities: ['plan', 'assign', 'approve', 'reject', 'dispatch', 'aggregate', 'vote', 'override'],
    priority: 100
  },
  planner: {
    id: 'role-planner',
    name: 'Planner',
    description: '任务规划者，负责分析和分解任务',
    allowedNodes: ['input', 'planning', 'decision', 'coordinate'],
    capabilities: ['plan', 'assign', 'aggregate'],
    priority: 80
  },
  executor: {
    id: 'role-executor',
    name: 'Executor',
    description: '任务执行者，负责执行具体任务',
    allowedNodes: ['input', 'execution', 'coordinate'],
    capabilities: ['dispatch'],
    priority: 60
  },
  reviewer: {
    id: 'role-reviewer',
    name: 'Reviewer',
    description: '审核者，负责检查工作成果',
    allowedNodes: ['review', 'decision'],
    capabilities: ['approve', 'reject', 'vote'],
    priority: 70
  },
  coordinator: {
    id: 'role-coordinator',
    name: 'Coordinator',
    description: '协调者，负责调度和汇总工作',
    allowedNodes: ['coordinate', 'decision'],
    capabilities: ['dispatch', 'aggregate', 'vote'],
    priority: 75
  },
  observer: {
    id: 'role-observer',
    name: 'Observer',
    description: '观察者，只有只读权限',
    allowedNodes: ['input'],
    capabilities: [],
    priority: 10
  }
};

// ============================================================================
// 权限定义
// ============================================================================

/**
 * 权限定义
 *
 * 定义一个角色对资源和操作的访问权限
 */
export interface Permission {
  /** 可以发送消息的目标角色 */
  canSendTo: string[];

  /** 可以接收消息的来源角色 */
  canReceiveFrom: string[];

  /** 可以访问的记忆类型 */
  canAccessMemory: MemoryType[];

  /** 可以做出的决策类型 */
  canDecide: DecisionType[];

  /** 是否可以管理其他 Agent */
  canManageAgents: boolean;

  /** 是否可以修改工作流 */
  canModifyWorkflow: boolean;

  /** 是否可以创建检查点 */
  canCreateCheckpoint?: boolean;

  /** 是否可以执行代码 */
  canExecuteCode?: boolean;

  /** 是否可以访问文件系统 */
  canAccessFilesystem?: boolean;

  /** 允许访问的路径（文件系统） */
  allowedPaths?: string[];
}

/**
 * 预定义权限模板
 */
export type PermissionTemplate =
  | 'full'         // 完全权限
  | 'read-write'   // 读写权限
  | 'read-only'    // 只读权限
  | 'execute'      // 执行权限
  | 'review'       // 审核权限;

/**
 * 预定义权限模板映射
 */
export const PERMISSION_TEMPLATES: Record<PermissionTemplate, Permission> = {
  full: {
    canSendTo: ['*'],
    canReceiveFrom: ['*'],
    canAccessMemory: ['all'],
    canDecide: ['all'],
    canManageAgents: true,
    canModifyWorkflow: true,
    canCreateCheckpoint: true,
    canExecuteCode: true,
    canAccessFilesystem: true,
    allowedPaths: ['*']
  },
  'read-write': {
    canSendTo: ['*'],
    canReceiveFrom: ['*'],
    canAccessMemory: ['context', 'execution', 'working'],
    canDecide: ['plan', 'assign', 'dispatch'],
    canManageAgents: false,
    canModifyWorkflow: false
  },
  'read-only': {
    canSendTo: [],
    canReceiveFrom: ['*'],
    canAccessMemory: ['context'],
    canDecide: [],
    canManageAgents: false,
    canModifyWorkflow: false
  },
  execute: {
    canSendTo: ['leader', 'planner', 'coordinator'],
    canReceiveFrom: ['leader', 'planner'],
    canAccessMemory: ['execution', 'working'],
    canDecide: ['dispatch'],
    canManageAgents: false,
    canModifyWorkflow: false,
    canExecuteCode: true
  },
  review: {
    canSendTo: ['leader', 'executor', 'coordinator'],
    canReceiveFrom: ['leader', 'executor'],
    canAccessMemory: ['context', 'execution'],
    canDecide: ['approve', 'reject', 'vote'],
    canManageAgents: false,
    canModifyWorkflow: false
  }
};

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 角色配置
 *
 * 用于配置工作流中的角色系统
 */
export interface RoleConfig {
  /** 使用预定义角色（角色 ID 列表） */
  use?: PredefinedRole[] | string[];

  /** 自定义角色列表 */
  custom?: Role[];

  /** 角色映射表（Agent ID -> 角色 ID） */
  agentRoles?: Record<string, string>;
}

/**
 * 权限配置
 *
 * 用于配置工作流中的权限系统
 */
export interface PermissionConfig {
  /** 使用的权限模板名称 */
  template?: PermissionTemplate;

  /** 覆盖特定角色的权限（角色 ID -> 权限覆盖） */
  overrides?: Record<string, Partial<Permission>>;

  /** 完全自定义权限（角色 ID -> 权限） */
  custom?: Record<string, Permission>;
}

// ============================================================================
// 角色绑定
// ============================================================================

/**
 * 角色绑定
 *
 * 将 Agent 绑定到特定角色
 */
export interface RoleBinding {
  /** Agent ID */
  agentId: string;

  /** 角色 ID */
  roleId: string;

  /** 绑定时间 */
  boundAt: Date;

  /** 绑定元数据 */
  metadata?: {
    assignedBy?: string;
    reason?: string;
    expiresAt?: Date;
  };
}

/**
 * 角色绑定列表
 */
export interface RoleBindings {
  /** 所有绑定 */
  bindings: RoleBinding[];

  /** 添加绑定 */
  add(binding: RoleBinding): void;

  /** 移除绑定 */
  remove(agentId: string): void;

  /** 获取 Agent 的角色 */
  getRole(agentId: string): string | null;

  /** 获取拥有指定角色的所有 Agent */
  getAgentsByRole(roleId: string): string[];
}

// ============================================================================
// 权限验证
// ============================================================================

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否通过 */
  allowed: boolean;

  /** 失败原因 */
  reason?: string;

  /** 所需权限 */
  required?: {
    memory?: MemoryType[];
    decision?: DecisionType[];
    action?: string;
  };
}

/**
 * 权限验证上下文
 */
export interface PermissionContext {
  /** Agent ID */
  agentId: string;

  /** 角色 ID */
  roleId: string;

  /** 权限对象 */
  permission: Permission;

  /** 请求的操作 */
  action: string;

  /** 目标资源（可选） */
  resource?: string;

  /** 记忆类型（访问记忆时） */
  memoryType?: MemoryType;

  /** 决策类型（做决策时） */
  decisionType?: DecisionType;
}

/**
 * 权限验证器接口
 */
export interface IPermissionValidator {
  /**
   * 检查权限
   * @param context 权限验证上下文
   * @returns 验证结果
   */
  check(context: PermissionContext): PermissionCheckResult;

  /**
   * 检查是否可以访问指定记忆类型
   */
  canAccessMemory(agentId: string, memoryType: MemoryType): boolean;

  /**
   * 检查是否可以做出指定类型的决策
   */
  canMakeDecision(agentId: string, decisionType: DecisionType): boolean;

  /**
   * 检查是否可以向目标发送消息
   */
  canSendTo(agentId: string, targetAgentId: string): boolean;

  /**
   * 检查是否可以从来源接收消息
   */
  canReceiveFrom(agentId: string, sourceAgentId: string): boolean;

  /**
   * 检查是否可以修改工作流
   */
  canModifyWorkflow(agentId: string): boolean;

  /**
   * 检查是否可以管理 Agent
   */
  canManageAgents(agentId: string): boolean;
}

// ============================================================================
// 能力注册
// ============================================================================

/**
 * 能力定义
 */
export interface Capability {
  /** 能力唯一标识符 */
  id: string;

  /** 能力名称 */
  name: string;

  /** 能力描述 */
  description: string;

  /** 关联的节点分类 */
  relatedNodes: NodeCategory[];

  /** 能量消耗（用于资源调度） */
  cost?: number;

  /** 所需的其他能力 */
  prerequisites?: string[];
}

/**
 * 能力注册表
 */
export interface ICapabilityRegistry {
  /** 注册能力 */
  register(capability: Capability): void;

  /** 获取能力 */
  get(id: string): Capability | undefined;

  /** 检查角色是否拥有所需能力 */
  hasCapability(roleId: string, capabilityId: string): boolean;

  /** 获取角色的所有能力 */
  getRoleCapabilities(roleId: string): Capability[];
}
