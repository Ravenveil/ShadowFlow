/**
 * 角色管理器
 *
 * 管理角色的创建、绑定和生命周期
 */

import {
  Role,
  PredefinedRole,
  RoleBinding,
  RoleBindings,
  PREDEFINED_ROLES,
  Capability,
  NodeCategory,
} from '../types/role';

/**
 * 角色配置选项
 */
export interface RoleManagerConfig {
  /** 是否允许动态创建角色 */
  allowDynamicRoles?: boolean;

  /** 角色绑定过期时间（毫秒） */
  bindingExpiryMs?: number;

  /** 是否启用绑定缓存 */
  enableCache?: boolean;
}

/**
 * 角色管理器
 *
 * 提供角色的注册、绑定、查询和权限验证功能
 */
export class RoleManager {
  private roles: Map<string, Role> = new Map();
  private bindings: RoleBindingsImpl;
  private config: Required<RoleManagerConfig>;

  constructor(config: RoleManagerConfig = {}) {
    this.config = {
      allowDynamicRoles: config.allowDynamicRoles ?? true,
      bindingExpiryMs: config.bindingExpiryMs ?? 86400000, // 24 小时
      enableCache: config.enableCache ?? true,
    };

    this.bindings = new RoleBindingsImpl();
    this.initializePredefinedRoles();
  }

  // ===== 初始化 =====

  /**
   * 初始化预定义角色
   */
  private initializePredefinedRoles(): void {
    for (const [roleKey, role] of Object.entries(PREDEFINED_ROLES)) {
      this.roles.set(role.id, role);
    }
  }

  // ===== 角色管理 =====

  /**
   * 创建自定义角色
   * @param role 角色定义
   * @returns 创建的角色
   * @throws 如果不允许动态创建角色
   */
  createRole(role: Role): Role {
    if (!this.config.allowDynamicRoles) {
      throw new Error('Dynamic role creation is not allowed');
    }

    if (this.roles.has(role.id)) {
      throw new Error(`Role '${role.id}' already exists`);
    }

    // 设置创建时间元数据
    if (!role.metadata) {
      role.metadata = {};
    }
    role.metadata.createdAt = new Date();

    this.roles.set(role.id, role);
    return role;
  }

  /**
   * 更新角色
   * @param roleId 角色ID
   * @param updates 更新内容
   * @returns 更新后的角色
   */
  updateRole(roleId: string, updates: Partial<Role>): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role '${roleId}' not found`);
    }

    // 不允许更新预定义角色的核心属性
    const predefinedKey = Object.keys(PREDEFINED_ROLES).find(
      key => PREDEFINED_ROLES[key as PredefinedRole].id === roleId
    );
    if (predefinedKey) {
      // 仅允许更新非核心属性
      const allowedUpdates = ['metadata'];
      const updateKeys = Object.keys(updates);
      const disallowed = updateKeys.filter(k => !allowedUpdates.includes(k));
      if (disallowed.length > 0) {
        throw new Error(`Cannot update predefined role properties: ${disallowed.join(', ')}`);
      }
    }

    const updatedRole = { ...role, ...updates };
    this.roles.set(roleId, updatedRole);
    return updatedRole;
  }

  /**
   * 获取角色
   * @param roleId 角色ID
   * @returns 角色或 undefined
   */
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  /**
   * 获取所有角色
   * @returns 所有角色列表
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * 按预定义类型获取角色
   * @param roleType 预定义角色类型
   * @returns 角色或 undefined
   */
  getPredefinedRole(roleType: PredefinedRole): Role | undefined {
    return PREDEFINED_ROLES[roleType];
  }

  /**
   * 检查角色是否存在
   * @param roleId 角色ID
   * @returns 是否存在
   */
  hasRole(roleId: string): boolean {
    return this.roles.has(roleId);
  }

  /**
   * 删除自定义角色
   * @param roleId 角色ID
   * @returns 是否成功删除
   */
  deleteRole(roleId: string): boolean {
    // 不允许删除预定义角色
    const isPredefined = Object.values(PREDEFINED_ROLES).some(r => r.id === roleId);
    if (isPredefined) {
      throw new Error(`Cannot delete predefined role '${roleId}'`);
    }

    // 删除角色前先移除相关绑定
    const agents = this.bindings.getAgentsByRole(roleId);
    for (const agentId of agents) {
      this.bindings.remove(agentId);
    }

    return this.roles.delete(roleId);
  }

  // ===== 角色绑定 =====

  /**
   * 绑定 Agent 到角色
   * @param agentId Agent ID
   * @param roleId 角色 ID
   * @param metadata 绑定元数据
   * @returns 绑定信息
   */
  bindAgent(agentId: string, roleId: string, metadata?: RoleBinding['metadata']): RoleBinding {
    if (!this.roles.has(roleId)) {
      throw new Error(`Role '${roleId}' does not exist`);
    }

    const binding: RoleBinding = {
      agentId,
      roleId,
      boundAt: new Date(),
      metadata,
    };

    // 如果已存在绑定，先移除旧的
    const existingRole = this.bindings.getRole(agentId);
    if (existingRole) {
      this.bindings.remove(agentId);
    }

    this.bindings.add(binding);
    return binding;
  }

  /**
   * 解除 Agent 的角色绑定
   * @param agentId Agent ID
   * @returns 是否成功解除
   */
  unbindAgent(agentId: string): boolean {
    return this.bindings.remove(agentId);
  }

  /**
   * 获取 Agent 的角色
   * @param agentId Agent ID
   * @returns 角色 ID 或 null
   */
  getAgentRole(agentId: string): string | null {
    return this.bindings.getRole(agentId);
  }

  /**
   * 获取拥有指定角色的所有 Agent
   * @param roleId 角色 ID
   * @returns Agent ID 列表
   */
  getAgentsByRole(roleId: string): string[] {
    return this.bindings.getAgentsByRole(roleId);
  }

  /**
   * 获取所有绑定
   * @returns 所有绑定列表
   */
  getAllBindings(): RoleBinding[] {
    return this.bindings.bindings;
  }

  // ===== 能力检查 =====

  /**
   * 检查角色是否拥有指定能力
   * @param roleId 角色 ID
   * @param capability 能力名称
   * @returns 是否拥有该能力
   */
  hasCapability(roleId: string, capability: string): boolean {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }
    return role.capabilities.includes(capability);
  }

  /**
   * 检查角色是否拥有所有指定能力
   * @param roleId 角色 ID
   * @param capabilities 能力列表
   * @returns 是否拥有所有能力
   */
  hasAllCapabilities(roleId: string, capabilities: string[]): boolean {
    return capabilities.every(cap => this.hasCapability(roleId, cap));
  }

  /**
   * 检查角色是否拥有任意指定能力
   * @param roleId 角色 ID
   * @param capabilities 能力列表
   * @returns 是否拥有任意能力
   */
  hasAnyCapability(roleId: string, capabilities: string[]): boolean {
    return capabilities.some(cap => this.hasCapability(roleId, cap));
  }

  /**
   * 获取角色的所有能力
   * @param roleId 角色 ID
   * @returns 能力列表
   */
  getRoleCapabilities(roleId: string): string[] {
    const role = this.roles.get(roleId);
    return role?.capabilities || [];
  }

  /**
   * 添加角色能力
   * @param roleId 角色 ID
   * @param capability 能力名称
   */
  addCapability(roleId: string, capability: string): void {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role '${roleId}' not found`);
    }

    if (!role.capabilities.includes(capability)) {
      role.capabilities.push(capability);
    }
  }

  /**
   * 移除角色能力
   * @param roleId 角色 ID
   * @param capability 能力名称
   */
  removeCapability(roleId: string, capability: string): void {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role '${roleId}' not found`);
    }

    const index = role.capabilities.indexOf(capability);
    if (index >= 0) {
      role.capabilities.splice(index, 1);
    }
  }

  // ===== 节点访问权限 =====

  /**
   * 检查角色是否允许访问指定节点分类
   * @param roleId 角色 ID
   * @param category 节点分类
   * @returns 是否允许访问
   */
  canAccessNode(roleId: string, category: NodeCategory): boolean {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }
    return role.allowedNodes.includes(category);
  }

  /**
   * 获取角色允许访问的节点分类
   * @param roleId 角色 ID
   * @returns 节点分类列表
   */
  getAllowedNodes(roleId: string): NodeCategory[] {
    const role = this.roles.get(roleId);
    return role?.allowedNodes || [];
  }

  // ===== 批量操作 =====

  /**
   * 批量绑定 Agent 到角色
   * @param bindings Agent ID 到角色 ID 的映射
   * @returns 绑定结果
   */
  batchBind(bindings: Record<string, string>): { success: string[]; failed: Array<{ agentId: string; roleId: string; error: string }> } {
    const result = {
      success: [] as string[],
      failed: [] as Array<{ agentId: string; roleId: string; error: string }>,
    };

    for (const [agentId, roleId] of Object.entries(bindings)) {
      try {
        this.bindAgent(agentId, roleId);
        result.success.push(agentId);
      } catch (error) {
        result.failed.push({
          agentId,
          roleId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * 清理过期的绑定
   * @returns 清理的绑定数量
   */
  cleanExpiredBindings(): number {
    const now = Date.now();
    const expiryMs = this.config.bindingExpiryMs;

    let cleaned = 0;
    const bindings = this.getAllBindings();

    for (const binding of bindings) {
      if (binding.metadata?.expiresAt) {
        const expiryTime = new Date(binding.metadata.expiresAt).getTime();
        if (now > expiryTime) {
          this.unbindAgent(binding.agentId);
          cleaned++;
        }
      } else {
        // 检查绑定时间是否超过默认过期时间
        const boundTime = new Date(binding.boundAt).getTime();
        if (now - boundTime > expiryMs) {
          this.unbindAgent(binding.agentId);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  // ===== 统计信息 =====

  /**
   * 获取角色统计信息
   * @returns 统计信息
   */
  getStats(): {
    totalRoles: number;
    predefinedRoles: number;
    customRoles: number;
    totalBindings: number;
    bindingsByRole: Record<string, number>;
    bindingsByPriority: Record<number, number>;
  } {
    const stats = {
      totalRoles: this.roles.size,
      predefinedRoles: 0,
      customRoles: 0,
      totalBindings: this.bindings.bindings.length,
      bindingsByRole: {} as Record<string, number>,
      bindingsByPriority: {} as Record<number, number>,
    };

    for (const role of this.roles.values()) {
      const isPredefined = Object.values(PREDEFINED_ROLES).some(r => r.id === role.id);
      if (isPredefined) {
        stats.predefinedRoles++;
      } else {
        stats.customRoles++;
      }
    }

    for (const binding of this.bindings.bindings) {
      stats.bindingsByRole[binding.roleId] = (stats.bindingsByRole[binding.roleId] || 0) + 1;

      const role = this.roles.get(binding.roleId);
      if (role) {
        stats.bindingsByPriority[role.priority] = (stats.bindingsByPriority[role.priority] || 0) + 1;
      }
    }

    return stats;
  }

  // ===== 清理操作 =====

  /**
   * 重置管理器（清除所有数据）
   */
  reset(): void {
    this.roles.clear();
    this.bindings.bindings = [];
    this.initializePredefinedRoles();
  }
}

/**
 * 角色绑定实现
 */
class RoleBindingsImpl implements RoleBindings {
  bindings: RoleBinding[] = [];

  add(binding: RoleBinding): void {
    this.bindings.push(binding);
  }

  remove(agentId: string): void {
    const index = this.bindings.findIndex(b => b.agentId === agentId);
    if (index >= 0) {
      this.bindings.splice(index, 1);
    }
  }

  getRole(agentId: string): string | null {
    const binding = this.bindings.find(b => b.agentId === agentId);
    return binding?.roleId || null;
  }

  getAgentsByRole(roleId: string): string[] {
    return this.bindings
      .filter(b => b.roleId === roleId)
      .map(b => b.agentId);
  }
}

// ===== 全局实例 =====

export let globalRoleManager: RoleManager | null = null;

/**
 * 获取全局角色管理器实例
 * @param config 配置选项
 * @returns 角色管理器实例
 */
export function getRoleManager(config?: RoleManagerConfig): RoleManager {
  if (!globalRoleManager) {
    globalRoleManager = new RoleManager(config);
  }
  return globalRoleManager;
}

/**
 * 重置全局角色管理器（用于测试）
 */
export function resetRoleManager(): void {
  globalRoleManager = null;
}

/**
 * 创建新的角色管理器实例
 * @param config 配置选项
 * @returns 角色管理器实例
 */
export function createRoleManager(config?: RoleManagerConfig): RoleManager {
  return new RoleManager(config);
}

/**
 * 导出预定义角色别名（用于向后兼容）
 */
export const BUILTIN_ROLES = PREDEFINED_ROLES;
