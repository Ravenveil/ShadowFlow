// ============================================================================
// 权限检查器 - 提供权限验证和检查功能
// ============================================================================

import type { PermissionConfig } from '../types';
import type { Permission, MemoryType, DecisionType } from '../role/types';
import { globalPermissionMatrix } from './matrix';

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  details?: Record<string, any>;
}

/**
 * 权限检查器
 */
export class PermissionChecker {
  private permissions: Map<string, Permission> = new Map();

  constructor(permissions?: Map<string, Permission> | Record<string, Permission>) {
    if (permissions) {
      if (permissions instanceof Map) {
        this.permissions = new Map(permissions);
      } else {
        for (const [roleId, permission] of Object.entries(permissions)) {
          this.permissions.set(roleId, permission);
        }
      }
    }
  }

  /**
   * 设置权限
   */
  setPermission(roleId: string, permission: Permission): void {
    this.permissions.set(roleId, permission);
  }

  /**
   * 批量设置权限
   */
  setPermissions(permissions: Record<string, Permission> | Map<string, Permission>): void {
    if (permissions instanceof Map) {
      for (const [roleId, permission] of permissions) {
        this.permissions.set(roleId, permission);
      }
    } else {
      for (const [roleId, permission] of Object.entries(permissions)) {
        this.permissions.set(roleId, permission);
      }
    }
  }

  /**
   * 加载权限配置
   */
  loadFromTemplate(templateName: string): void {
    const matrix = globalPermissionMatrix.getTemplate(templateName);
    if (!matrix) {
      throw new Error(`Permission template not found: ${templateName}`);
    }

    this.permissions = new Map();
    for (const [roleId, permission] of Object.entries(matrix.permissions)) {
      this.permissions.set(roleId, permission);
    }
  }

  /**
   * 获取角色权限
   */
  getPermission(roleId: string): Permission | undefined {
    return this.permissions.get(roleId);
  }

  /**
   * 检查是否可以发送消息
   */
  canSendTo(fromRole: string, toRole: string): PermissionCheckResult {
    const permission = this.permissions.get(fromRole);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${fromRole} not found in permission matrix`
      };
    }

    const allowed = permission.canSendTo.includes('*') ||
                   permission.canSendTo.includes(toRole);

    return {
      allowed,
      reason: allowed ? undefined : `Role ${fromRole} cannot send messages to ${toRole}`,
      details: {
        fromRole,
        toRole,
        allowedTargets: permission.canSendTo
      }
    };
  }

  /**
   * 检查是否可以接收消息
   */
  canReceiveFrom(toRole: string, fromRole: string): PermissionCheckResult {
    const permission = this.permissions.get(toRole);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${toRole} not found in permission matrix`
      };
    }

    const allowed = permission.canReceiveFrom.includes('*') ||
                   permission.canReceiveFrom.includes(fromRole);

    return {
      allowed,
      reason: allowed ? undefined : `Role ${toRole} cannot receive messages from ${fromRole}`,
      details: {
        toRole,
        fromRole,
        allowedSources: permission.canReceiveFrom
      }
    };
  }

  /**
   * 检查双向通信是否允许
   */
  canCommunicate(roleA: string, roleB: string, bidirectional: boolean = true): PermissionCheckResult {
    const checkAtoB = this.canSendTo(roleA, roleB);
    const checkBtoA = bidirectional ? this.canSendTo(roleB, roleA) : { allowed: true };

    if (!checkAtoB.allowed) {
      return {
        allowed: false,
        reason: checkAtoB.reason,
        details: { ...checkAtoB.details, check: 'A to B' }
      };
    }

    if (bidirectional && !checkBtoA.allowed) {
      return {
        allowed: false,
        reason: checkBtoA.reason,
        details: { ...checkBtoA.details, check: 'B to A' }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查是否可以访问指定类型的记忆
   */
  canAccessMemory(roleId: string, memoryType: MemoryType): PermissionCheckResult {
    const permission = this.permissions.get(roleId);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${roleId} not found in permission matrix`
      };
    }

    const allowed = permission.canAccessMemory.includes('all' as any) ||
                   permission.canAccessMemory.includes(memoryType);

    return {
      allowed,
      reason: allowed ? undefined : `Role ${roleId} cannot access ${memoryType} memory`,
      details: {
        roleId,
        memoryType,
        allowedMemories: permission.canAccessMemory
      }
    };
  }

  /**
   * 检查是否可以进行指定决策
   */
  canDecide(roleId: string, decisionType: DecisionType): PermissionCheckResult {
    const permission = this.permissions.get(roleId);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${roleId} not found in permission matrix`
      };
    }

    const allowed = permission.canDecide.includes('all') ||
                   permission.canDecide.includes(decisionType);

    return {
      allowed,
      reason: allowed ? undefined : `Role ${roleId} cannot make decision: ${decisionType}`,
      details: {
        roleId,
        decisionType,
        allowedDecisions: permission.canDecide
      }
    };
  }

  /**
   * 检查是否可以管理 Agent
   */
  canManageAgents(roleId: string): PermissionCheckResult {
    const permission = this.permissions.get(roleId);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${roleId} not found in permission matrix`
      };
    }

    return {
      allowed: permission.canManageAgents,
      reason: permission.canManageAgents
        ? undefined
        : `Role ${roleId} does not have permission to manage agents`
    };
  }

  /**
   * 检查是否可以修改工作流
   */
  canModifyWorkflow(roleId: string): PermissionCheckResult {
    const permission = this.permissions.get(roleId);

    if (!permission) {
      return {
        allowed: false,
        reason: `Role ${roleId} not found in permission matrix`
      };
    }

    return {
      allowed: permission.canModifyWorkflow,
      reason: permission.canModifyWorkflow
        ? undefined
        : `Role ${roleId} does not have permission to modify workflow`
    };
  }

  /**
   * 获取角色可以发送给的所有目标角色
   */
  getSendTargets(roleId: string): string[] {
    const permission = this.permissions.get(roleId);
    if (!permission) return [];

    if (permission.canSendTo.includes('*')) {
      // 返回权限矩阵中所有角色（除了自己）
      return Array.from(this.permissions.keys()).filter(r => r !== roleId);
    }

    return [...permission.canSendTo];
  }

  /**
   * 获取角色可以接收消息的所有源角色
   */
  getReceiveSources(roleId: string): string[] {
    const permission = this.permissions.get(roleId);
    if (!permission) return [];

    if (permission.canReceiveFrom.includes('*')) {
      // 返回权限矩阵中所有角色（除了自己）
      return Array.from(this.permissions.keys()).filter(r => r !== roleId);
    }

    return [...permission.canReceiveFrom];
  }

  /**
   * 检查消息路径是否有效
   */
  validatePath(path: string[]): PermissionCheckResult {
    if (path.length < 2) {
      return { allowed: false, reason: 'Path must have at least 2 roles' };
    }

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const check = this.canSendTo(from, to);

      if (!check.allowed) {
        return {
          allowed: false,
          reason: `Cannot send from ${from} to ${to} in path: ${path.join(' -> ')}`,
          details: check.details
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 批量权限检查
   */
  checkMultiple(checks: Array<{
    type: 'send' | 'receive' | 'memory' | 'decide' | 'manage' | 'modify';
    roleId: string;
    target?: string;
    decisionType?: DecisionType;
    memoryType?: MemoryType;
  }>): Array<PermissionCheckResult> {
    return checks.map(check => {
      switch (check.type) {
        case 'send':
          return this.canSendTo(check.roleId, check.target!);
        case 'receive':
          return this.canReceiveFrom(check.roleId, check.target!);
        case 'memory':
          return this.canAccessMemory(check.roleId, check.memoryType!);
        case 'decide':
          return this.canDecide(check.roleId, check.decisionType!);
        case 'manage':
          return this.canManageAgents(check.roleId);
        case 'modify':
          return this.canModifyWorkflow(check.roleId);
        default:
          return { allowed: false, reason: 'Unknown check type' };
      }
    });
  }

  /**
   * 清空权限
   */
  clear(): void {
    this.permissions.clear();
  }

  /**
   * 获取所有角色 ID
   */
  getRoleIds(): string[] {
    return Array.from(this.permissions.keys());
  }
}

/**
 * 从模板创建权限检查器的便捷方法
 */
export function createCheckerFromTemplate(templateName: string): PermissionChecker {
  const checker = new PermissionChecker();
  checker.loadFromTemplate(templateName);
  return checker;
}
