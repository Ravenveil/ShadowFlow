// ============================================================================
// 角色和权限类型定义
// ============================================================================

import type { NodeCategory } from '../types';

// ----------------------------------------------------------------------------
// 记忆类型
// ----------------------------------------------------------------------------
export type MemoryType = 'context' | 'knowledge' | 'execution' | 'working' | 'all';

// ----------------------------------------------------------------------------
// 决策类型
// ----------------------------------------------------------------------------
export type DecisionType = string;

// ----------------------------------------------------------------------------
// 角色定义
// ----------------------------------------------------------------------------
export interface Role {
  id: string;
  name: string;
  description: string;

  /**
   * 该角色可以执行的节点类型
   */
  allowedNodes: NodeCategory[];

  /**
   * 该角色的能力标签
   */
  capabilities: string[];

  /**
   * 角色优先级（用于冲突解决）
   */
  priority: number;
}

// ----------------------------------------------------------------------------
// 权限定义
// ----------------------------------------------------------------------------
export interface Permission {
  /**
   * 可以向谁发送消息/任务
   */
  canSendTo: string[];

  /**
   * 可以从谁接收消息/任务
   */
  canReceiveFrom: string[];

  /**
   * 可以访问的记忆类型
   */
  canAccessMemory: MemoryType[];

  /**
   * 可以执行的决策
   */
  canDecide: DecisionType[];

  /**
   * 是否可以创建/销毁 Agent
   */
  canManageAgents: boolean;

  /**
   * 是否可以修改工作流
   */
  canModifyWorkflow: boolean;
}

// ----------------------------------------------------------------------------
// 角色配置
// ----------------------------------------------------------------------------
export interface RoleConfig {
  /**
   * 使用预定义角色
   */
  use?: string[];

  /**
   * 自定义角色
   */
  custom?: Role[];
}

// ----------------------------------------------------------------------------
// 权限配置
// ----------------------------------------------------------------------------
export interface PermissionConfig {
  /**
   * 使用权限模板名称
   */
  template?: string;

  /**
   * 覆盖现有权限
   */
  overrides?: Record<string, Partial<Permission>>;

  /**
   * 自定义权限
   */
  custom?: Record<string, Permission>;
}

// ----------------------------------------------------------------------------
// 工作流模式配置（包含角色和权限）
// ----------------------------------------------------------------------------
export interface WorkflowPatternConfig {
  id: string;
  name: string;

  /**
   * 该模式使用的角色配置
   */
  roles: RoleConfig;

  /**
   * 该模式使用的权限配置
   */
  permissions: PermissionConfig;
}

// ----------------------------------------------------------------------------
// 角色注册项
// ----------------------------------------------------------------------------
export interface RoleRegistration {
  role: Role;
  builtin: boolean;
  registeredAt: Date;
}

// ----------------------------------------------------------------------------
// 权限模板项
// ----------------------------------------------------------------------------
export interface PermissionTemplate {
  name: string;
  description: string;
  permissions: Record<string, Permission>;
  compatibleRoles: string[];
}

// ----------------------------------------------------------------------------
// 节点到角色的映射
// ----------------------------------------------------------------------------
export interface NodeToRoleMapping {
  nodeType: string;
  nodeCategory: NodeCategory;
  allowedRoles: string[];
  defaultRole?: string;
}

// ----------------------------------------------------------------------------
// 通信规则定义
// ----------------------------------------------------------------------------
export interface CommunicationRule {
  from: string;
  to: string;
  type: string;  // request-review, feedback, notify, etc.
  bidirectional?: boolean;
  condition?: string;
}
