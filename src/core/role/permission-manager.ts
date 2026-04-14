/**
 * 权限管理器
 *
 * 负责权限验证和访问控制
 */

import type {
  Permission,
  PermissionCheckResult,
  PermissionContext,
  PermissionTemplate,
  IPermissionValidator as PermissionValidator,
  DecisionType,
  MemoryType,
} from '../types/role';

/**
 * 权限管理器配置
 */
export interface PermissionManagerConfig {
  /** 是否记录权限检查日志 */
  enableLogging?: boolean;

  /** 是否启用缓存 */
  enableCache?: boolean;

  /** 默认权限模板 */
  defaultTemplate?: PermissionTemplate;

  /** 超级处理器（权限检查失败时调用） */
  escalationHandler?: (context: PermissionContext, result: PermissionCheckResult) => void;
}

/**
 * 权限管理器
 *
 * 提供权限验证和访问控制功能
 */
export class PermissionManager implements PermissionValidator {
  private permissions: Map<string, Permission> = new Map();
  private checkCache: Map<string, PermissionCheckResult> = new Map();
  private checkHistory: PermissionCheckResult[] = [];
  private config: Required<PermissionManagerConfig>;

  constructor(config: PermissionManagerConfig = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      enableCache: config.enableCache ?? true,
      defaultTemplate: config.defaultTemplate ?? 'full',
      escalationHandler: config.escalationHandler ?? this.defaultEscalationHandler,
    };
  }

  // ===== 权限管理 =====

  /**
   * 设置权限
   * @param roleId 角色 ID
   * @param permission 权限配置
   */
  setPermission(roleId: string, permission: Permission): void {
    this.permissions.set(roleId, permission);
    this.invalidateCache();
  }

  /**
   * 批量设置权限
   * @param permissions 角色 ID 到权限的映射
   */
  setPermissions(permissions: Record<string, Permission>): void {
    for (const [roleId, permission] of Object.entries(permissions)) {
      this.permissions.set(roleId, permission);
    }
    this.invalidateCache();
  }

  /**
   * 应用权限模板
   * @param roleId 角色 ID
   * @param template 权限模板
   * @param overrides 覆盖项
   */
  applyTemplate(
    roleId: string,
    template: PermissionTemplate,
    overrides?: Partial<Permission>
  ): void {
    const templates: Record<PermissionTemplate, Permission> = {
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
        allowedPaths: ['*'],
      },
      'read-write': {
        canSendTo: ['*'],
        canReceiveFrom: ['*'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: ['plan', 'assign', 'dispatch'],
        canManageAgents: false,
        canModifyWorkflow: false,
      },
      'read-only': {
        canSendTo: [],
        canReceiveFrom: ['*'],
        canAccessMemory: ['context'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false,
      },
      execute: {
        canSendTo: ['leader', 'planner', 'coordinator'],
        canReceiveFrom: ['leader', 'planner'],
        canAccessMemory: ['execution', 'working'],
        canDecide: ['dispatch'],
        canManageAgents: false,
        canModifyWorkflow: false,
        canExecuteCode: true,
      },
      review: {
        canSendTo: ['leader', 'executor', 'coordinator'],
        canReceiveFrom: ['leader', 'executor'],
        canAccessMemory: ['context', 'execution'],
        canDecide: ['approve', 'reject', 'vote'],
        canManageAgents: false,
        canModifyWorkflow: false,
      },
    };

    const permission = templates[template];
    const finalPermission = overrides ? { ...permission, ...overrides } : permission;

    this.setPermission(roleId, finalPermission);
  }

  /**
   * 获取权限
   * @param roleId 角色 ID
   * @returns 权限或 undefined
   */
  getPermission(roleId: string): Permission | undefined {
    return this.permissions.get(roleId);
  }

  /**
   * 获取所有权限
   * @returns 所有权限
   */
  getAllPermissions(): Record<string, Permission> {
    const result: Record<string, Permission> = {};
    for (const [roleId, permission] of this.permissions.entries()) {
      result[roleId] = permission;
    }
    return result;
  }

  /**
   * 移除权限
   * @param roleId 角色 ID
   */
  removePermission(roleId: string): void {
    this.permissions.delete(roleId);
    this.invalidateCache();
  }

  // ===== 权限验证 =====

  /**
   * 检查权限
   * @param context 权限验证上下文
   * @returns 验证结果
   */
  check(context: PermissionContext): PermissionCheckResult {
    // 生成缓存键
    const cacheKey = this.generateCacheKey(context);

    // 检查缓存
    if (this.config.enableCache && this.checkCache.has(cacheKey)) {
      const cached = this.checkCache.get(cacheKey)!;
      this.logCheck(context, cached);
      return cached;
    }

    // 获取权限
    const permission = this.permissions.get(context.roleId);
    if (!permission) {
      const result: PermissionCheckResult = {
        allowed: false,
        reason: `Role '${context.roleId}' has no permissions defined`,
        required: { action: context.action },
      };
      this.cacheResult(cacheKey, result);
      this.logCheck(context, result);
      return result;
    }

    // 执行检查
    const result = this.performCheck(context, permission);

    // 缓存结果
    if (this.config.enableCache) {
      this.cacheResult(cacheKey, result);
    }

    // 记录历史
    this.checkHistory.push(result);
    if (this.checkHistory.length > 1000) {
      this.checkHistory.shift();
    }

    // 日志
    this.logCheck(context, result);

    // 如果不允许，调用超级处理器
    if (!result.allowed && this.config.escalationHandler) {
      this.config.escalationHandler(context, result);
    }

    return result;
  }

  /**
   * 执行权限检查
   */
  private performCheck(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const action = context.action.toLowerCase();

    // 检查记忆访问权限
    if (action === 'access-memory' && context.memoryType) {
      return this.checkMemoryAccess(context, permission);
    }

    // 检查决策权限
    if (action === 'make-decision' && context.decisionType) {
      return this.checkDecisionPermission(context, permission);
    }

    // 检查发送消息权限
    if (action === 'send-message') {
      return this.checkSendPermission(context, permission);
    }

    // 检查接收消息权限
    if (action === 'receive-message') {
      return this.checkReceivePermission(context, permission);
    }

    // 检查工作流修改权限
    if (action === 'modify-workflow') {
      return this.checkWorkflowModifyPermission(context, permission);
    }

    // 检查 Agent 管理权限
    if (action === 'manage-agents') {
      return this.checkAgentManagePermission(context, permission);
    }

    // 检查代码执行权限
    if (action === 'execute-code') {
      return this.checkCodeExecutePermission(context, permission);
    }

    // 检查文件系统访问权限
    if (action === 'access-filesystem') {
      return this.checkFilesystemAccessPermission(context, permission);
    }

    // 默认不允许
    return {
      allowed: false,
      reason: `Unknown action: ${action}`,
      required: { action: context.action },
    };
  }

  /**
   * 检查记忆访问权限
   */
  private checkMemoryAccess(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const requestedTypes = context.memoryType === 'all'
      ? ['context', 'execution', 'working', 'knowledge']
      : [context.memoryType];

    const allowedTypes = permission.canAccessMemory;

    // 检查是否可以访问所有类型
    if (allowedTypes.includes('all')) {
      return { allowed: true };
    }

    // 检查是否允许访问请求的类型
    const missing = requestedTypes.filter(t => !allowedTypes.includes(t));
    if (missing.length === 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cannot access memory types: ${missing.join(', ')}`,
      required: { memory: missing as MemoryType[] },
    };
  }

  /**
   * 检查决策权限
   */
  private checkDecisionPermission(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const decisionType = context.decisionType || '';

    // 检查是否允许所有决策
    if (permission.canDecide.includes('all')) {
      return { allowed: true };
    }

    // 检查是否允许特定决策类型
    if (permission.canDecide.includes(decisionType)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cannot make decision type: ${decisionType}`,
      required: { decision: [decisionType as DecisionType] },
    };
  }

  /**
   * 检查发送消息权限
   */
  private checkSendPermission(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const targetAgent = context.resource || '';

    // 检查是否可以发送给任何人
    if (permission.canSendTo.includes('*')) {
      return { allowed: true };
    }

    // 检查是否允许发送给目标
    if (permission.canSendTo.includes(targetAgent)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cannot send messages to agent: ${targetAgent}`,
      required: { action: 'send-message' },
    };
  }

  /**
   * 检查接收消息权限
   */
  private checkReceivePermission(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    const sourceAgent = context.resource || '';

    // 检查是否可以接收任何人的消息
    if (permission.canReceiveFrom.includes('*')) {
      return { allowed: true };
    }

    // 检查是否允许从来源接收
    if (permission.canReceiveFrom.includes(sourceAgent)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cannot receive messages from agent: ${sourceAgent}`,
      required: { action: 'receive-message' },
    };
  }

  /**
   * 检查工作流修改权限
   */
  private checkWorkflowModifyPermission(
    _context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    if (permission.canModifyWorkflow) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Cannot modify workflow',
      required: { action: 'modify-workflow' },
    };
  }

  /**
   * 检查 Agent 管理权限
   */
  private checkAgentManagePermission(
    _context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    if (permission.canManageAgents) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Cannot manage agents',
      required: { action: 'manage-agents' },
    };
  }

  /**
   * 检查代码执行权限
   */
  private checkCodeExecutePermission(
    _context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    if (permission.canExecuteCode ?? false) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Cannot execute code',
      required: { action: 'execute-code' },
    };
  }

  /**
   * 检查文件系统访问权限
   */
  private checkFilesystemAccessPermission(
    context: PermissionContext,
    permission: Permission
  ): PermissionCheckResult {
    if (!permission.canAccessFilesystem) {
      return {
        allowed: false,
        reason: 'Cannot access filesystem',
        required: { action: 'access-filesystem' },
      };
    }

    // 检查路径权限
    if (permission.allowedPaths?.includes('*')) {
      return { allowed: true };
    }

    const requestPath = context.resource;
    if (!requestPath) {
      return { allowed: false, reason: 'No path specified' };
    }

    // 检查请求的路径是否被允许
    const isAllowed = permission.allowedPaths!.some(allowedPath => {
      if (allowedPath === '*') return true;

      // 支持通配符匹配
      if (allowedPath.endsWith('/*')) {
        const basePath = allowedPath.slice(0, -2);
        return requestPath.startsWith(basePath);
      }

      return requestPath === allowedPath;
    });

    if (isAllowed) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cannot access path: ${requestPath}`,
      required: { action: 'access-filesystem' },
    };
  }

  /**
   * 检查是否可以访问指定记忆类型
   */
  canAccessMemory(agentId: string, memoryType: MemoryType): boolean {
    const permission = this.permissions.get(agentId);
    if (!permission) return false;

    if (permission.canAccessMemory.includes('all')) {
      return true;
    }

    return permission.canAccessMemory.includes(memoryType);
  }

  /**
   * 检查是否可以做出指定类型的决策
   */
  canMakeDecision(agentId: string, decisionType: DecisionType): boolean {
    const permission = this.permissions.get(agentId);
    if (!permission) return false;

    if (permission.canDecide.includes('all')) {
      return true;
    }

    return permission.canDecide.includes(decisionType);
  }

  /**
   * 检查是否可以向目标发送消息
   */
  canSendTo(agentId: string, targetAgentId: string): boolean {
    const permission = this.permissions.get(agentId);
    if (!permission) return false;

    if (permission.canSendTo.includes('*')) {
      return true;
    }

    return permission.canSendTo.includes(targetAgentId);
  }

  /**
   * 检查是否可以从来源接收消息
   */
  canReceiveFrom(agentId: string, sourceAgentId: string): boolean {
    const permission = this.permissions.get(agentId);
    if (!permission) return false;

    if (permission.canReceiveFrom.includes('*')) {
      return true;
    }

    return permission.canReceiveFrom.includes(sourceAgentId);
  }

  /**
   * 检查是否可以修改工作流
   */
  canModifyWorkflow(agentId: string): boolean {
    const permission = this.permissions.get(agentId);
    return permission?.canModifyWorkflow ?? false;
  }

  /**
   * 检查是否可以管理 Agent
   */
  canManageAgents(agentId: string): boolean {
    const permission = this.permissions.get(agentId);
    return permission?.canManageAgents ?? false;
  }

  // ===== 缓存管理 =====

  /**
   * 生成缓存键
   */
  private generateCacheKey(context: PermissionContext): string {
    return `${context.agentId}:${context.roleId}:${context.action}:${context.memoryType}:${context.decisionType}:${context.resource}`;
  }

  /**
   * 缓存结果
   */
  private cacheResult(key: string, result: PermissionCheckResult): void {
    this.checkCache.set(key, result);
  }

  /**
   * 使缓存失效
   */
  private invalidateCache(): void {
    this.checkCache.clear();
  }

  // ===== 日志和历史 =====

  /**
   * 记录权限检查
   */
  private logCheck(context: PermissionContext, result: PermissionCheckResult): void {
    if (!this.config.enableLogging) return;

    const entry = {
      timestamp: new Date(),
      agentId: context.agentId,
      roleId: context.roleId,
      action: context.action,
      allowed: result.allowed,
      reason: result.reason,
    };

    // 在实际实现中，这里可以写入日志文件或发送到监控系统
    console.log('[PermissionCheck]', JSON.stringify(entry));
  }

  /**
   * 获取权限检查历史
   */
  getCheckHistory(limit?: number): PermissionCheckResult[] {
    if (limit) {
      return this.checkHistory.slice(-limit);
    }
    return [...this.checkHistory];
  }

  /**
   * 清空检查历史
   */
  clearHistory(): void {
    this.checkHistory = [];
  }

  /**
   * 默认超级处理器
   */
  private defaultEscalationHandler(
    context: PermissionContext,
    result: PermissionCheckResult
  ): void {
    console.warn('[PermissionEscalation]', {
      agentId: context.agentId,
      action: context.action,
      reason: result.reason,
    });
  }

  // ===== 统计信息 =====

  /**
   * 获取权限统计信息
   */
  getStats(): {
    totalRoles: number;
    totalChecks: number;
    deniedChecks: number;
    cacheHits: number;
    cacheMisses: number;
  } {
    const deniedChecks = this.checkHistory.filter(h => !h.allowed).length;
    const cacheHits = this.checkCache.size;
    const cacheMisses = this.checkHistory.length - cacheHits;

    return {
      totalRoles: this.permissions.size,
      totalChecks: this.checkHistory.length,
      deniedChecks,
      cacheHits,
      cacheMisses,
    };
  }

  // ===== 清理操作 =====

  /**
   * 重置管理器
   */
  reset(): void {
    this.permissions.clear();
    this.checkCache.clear();
    this.checkHistory = [];
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.checkCache.clear();
  }
}

// ===== 全局实例 =====

export let globalPermissionManager: PermissionManager | null = null;

/**
 * 获取全局权限管理器实例
 * @param config 配置选项
 * @returns 权限管理器实例
 */
export function getPermissionManager(config?: PermissionManagerConfig): PermissionManager {
  if (!globalPermissionManager) {
    globalPermissionManager = new PermissionManager(config);
  }
  return globalPermissionManager;
}

/**
 * 重置全局权限管理器（用于测试）
 */
export function resetPermissionManager(): void {
  globalPermissionManager = null;
}

/**
 * 创建新的权限管理器实例
 * @param config 配置选项
 * @returns 权限管理器实例
 */
export function createPermissionManager(config?: PermissionManagerConfig): PermissionManager {
  return new PermissionManager(config);
}
