// ============================================================================
// 角色注册中心 - 管理角色的注册、查询和配置加载
// ============================================================================

import type { Role, RoleConfig, NodeCategory } from '../types';
import type { RoleRegistration, NodeToRoleMapping } from './types';

/**
 * 预定义角色模板
 */
export const BUILTIN_ROLES: Record<string, Role> = {
  // 三权分立模式角色
  planner: {
    id: 'planner',
    name: '规划',
    description: '负责任务规划和分配',
    allowedNodes: ['input', 'planning', 'coordinate'],
    capabilities: ['analyze', 'design', 'decompose', 'assign'],
    priority: 3
  },
  reviewer: {
    id: 'reviewer',
    name: '审核',
    description: '负责质量把关和审批',
    allowedNodes: ['review', 'decision'],
    capabilities: ['review', 'validate', 'approve', 'reject'],
    priority: 4
  },
  dispatcher: {
    id: 'dispatcher',
    name: '调度',
    description: '负责资源调度和协调',
    allowedNodes: ['coordinate', 'output'],
    capabilities: ['assign', 'aggregate', 'dispatch'],
    priority: 2
  },

  // 执行组角色
  developer: {
    id: 'developer',
    name: '开发者',
    description: '负责代码实现',
    allowedNodes: ['execution', 'review'],
    capabilities: ['code', 'test', 'debug', 'refactor'],
    priority: 1
  },
  dataEngineer: {
    id: 'dataEngineer',
    name: '数据工程师',
    description: '负责数据处理',
    allowedNodes: ['execution'],
    capabilities: ['transform', 'query', 'analyze'],
    priority: 1
  },
  docWriter: {
    id: 'docWriter',
    name: '文档工程师',
    description: '负责文档生成',
    allowedNodes: ['execution', 'output'],
    capabilities: ['generate', 'format'],
    priority: 1
  },
  compliance: {
    id: 'compliance',
    name: '合规专员',
    description: '负责安全审计',
    allowedNodes: ['review'],
    capabilities: ['security-audit', 'compliance-check'],
    priority: 2
  },
  deployer: {
    id: 'deployer',
    name: '部署专员',
    description: '负责发布上线',
    allowedNodes: ['execution', 'output'],
    capabilities: ['build', 'deploy', 'monitor'],
    priority: 1
  }
};

/**
 * 节点到角色的默认映射
 */
export const NODE_TO_ROLE_MAPPINGS: NodeToRoleMapping[] = [
  // 输入节点
  {
    nodeType: 'receive',
    nodeCategory: 'input',
    allowedRoles: ['planner'],
    defaultRole: 'planner'
  },
  {
    nodeType: 'understand',
    nodeCategory: 'input',
    allowedRoles: ['planner'],
    defaultRole: 'planner'
  },

  // 规划节点
  {
    nodeType: 'analyze',
    nodeCategory: 'planning',
    allowedRoles: ['planner', 'reviewer'],
    defaultRole: 'planner'
  },
  {
    nodeType: 'design',
    nodeCategory: 'planning',
    allowedRoles: ['planner'],
    defaultRole: 'planner'
  },
  {
    nodeType: 'decompose',
    nodeCategory: 'planning',
    allowedRoles: ['planner'],
    defaultRole: 'planner'
  },
  {
    nodeType: 'spec',
    nodeCategory: 'planning',
    allowedRoles: ['planner', 'reviewer'],
    defaultRole: 'planner'
  },

  // 执行节点
  {
    nodeType: 'code',
    nodeCategory: 'execution',
    allowedRoles: ['developer', 'deployer'],
    defaultRole: 'developer'
  },
  {
    nodeType: 'test',
    nodeCategory: 'execution',
    allowedRoles: ['developer'],
    defaultRole: 'developer'
  },
  {
    nodeType: 'transform',
    nodeCategory: 'execution',
    allowedRoles: ['developer', 'dataEngineer', 'deployer', 'docWriter'],
    defaultRole: 'developer'
  },
  {
    nodeType: 'generate',
    nodeCategory: 'execution',
    allowedRoles: ['developer', 'docWriter'],
    defaultRole: 'developer'
  },

  // 审核节点
  {
    nodeType: 'review',
    nodeCategory: 'review',
    allowedRoles: ['reviewer', 'compliance', 'planner'],
    defaultRole: 'reviewer'
  },
  {
    nodeType: 'validate',
    nodeCategory: 'review',
    allowedRoles: ['reviewer', 'compliance'],
    defaultRole: 'reviewer'
  },
  {
    nodeType: 'security',
    nodeCategory: 'review',
    allowedRoles: ['compliance'],
    defaultRole: 'compliance'
  },

  // 决策节点
  {
    nodeType: 'branch',
    nodeCategory: 'decision',
    allowedRoles: ['reviewer', 'planner', 'dispatcher'],
    defaultRole: 'reviewer'
  },

  // 协调节点
  {
    nodeType: 'assign',
    nodeCategory: 'coordinate',
    allowedRoles: ['planner', 'dispatcher'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'aggregate',
    nodeCategory: 'coordinate',
    allowedRoles: ['dispatcher'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'parallel',
    nodeCategory: 'coordinate',
    allowedRoles: ['dispatcher'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'sequence',
    nodeCategory: 'coordinate',
    allowedRoles: ['dispatcher'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'barrier',
    nodeCategory: 'coordinate',
    allowedRoles: ['dispatcher'],
    defaultRole: 'dispatcher'
  },

  // 输出节点
  {
    nodeType: 'report',
    nodeCategory: 'output',
    allowedRoles: ['dispatcher', 'docWriter'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'store',
    nodeCategory: 'output',
    allowedRoles: ['dispatcher', 'deployer'],
    defaultRole: 'dispatcher'
  },
  {
    nodeType: 'notify',
    nodeCategory: 'output',
    allowedRoles: ['dispatcher'],
    defaultRole: 'dispatcher'
  }
];

/**
 * 角色注册中心
 */
export class RoleRegistry {
  private roles: Map<string, RoleRegistration> = new Map();
  private nodeToRoleMappings: Map<string, NodeToRoleMapping> = new Map();

  constructor() {
    // 注册内置角色
    for (const [id, role] of Object.entries(BUILTIN_ROLES)) {
      this.register(role, true);
    }

    // 注册节点到角色的映射
    for (const mapping of NODE_TO_ROLE_MAPPINGS) {
      this.nodeToRoleMappings.set(mapping.nodeType, mapping);
    }
  }

  /**
   * 注册角色
   */
  register(role: Role, builtin: boolean = false): void {
    if (this.roles.has(role.id)) {
      throw new Error(`Role already registered: ${role.id}`);
    }

    this.roles.set(role.id, {
      role,
      builtin,
      registeredAt: new Date()
    });
  }

  /**
   * 获取角色
   */
  get(id: string): Role | undefined {
    return this.roles.get(id)?.role;
  }

  /**
   * 获取角色注册信息
   */
  getRegistration(id: string): RoleRegistration | undefined {
    return this.roles.get(id);
  }

  /**
   * 获取所有角色
   */
  getAll(): Role[] {
    return Array.from(this.roles.values()).map(r => r.role);
  }

  /**
   * 获取内置角色
   */
  getBuiltin(): Role[] {
    return Array.from(this.roles.values())
      .filter(r => r.builtin)
      .map(r => r.role);
  }

  /**
   * 获取自定义角色
   */
  getCustom(): Role[] {
    return Array.from(this.roles.values())
      .filter(r => !r.builtin)
      .map(r => r.role);
  }

  /**
   * 检查角色是否存在
   */
  has(id: string): boolean {
    return this.roles.has(id);
  }

  /**
   * 检查角色是否为内置角色
   */
  isBuiltin(id: string): boolean {
    return this.roles.get(id)?.builtin ?? false;
  }

  /**
   * 注销角色
   */
  unregister(id: string): boolean {
    const registration = this.roles.get(id);
    if (registration?.builtin) {
      throw new Error(`Cannot unregister builtin role: ${id}`);
    }
    return this.roles.delete(id);
  }

  /**
   * 加载角色配置
   */
  loadConfig(config: RoleConfig): Role[] {
    const result: Role[] = [];

    // 加载预定义角色
    if (config.use) {
      for (const id of config.use) {
        const role = this.get(id);
        if (role) {
          result.push(role);
        }
      }
    }

    // 加载自定义角色
    if (config.custom) {
      for (const role of config.custom) {
        this.register(role, false);
        result.push(role);
      }
    }

    return result;
  }

  /**
   * 按优先级排序角色
   */
  sortByPriority(roles?: string[]): Role[] {
    const targetRoles = roles
      ? roles.map(id => this.roles.get(id)?.role).filter(Boolean) as Role[]
      : this.getAll();

    return targetRoles.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查角色是否可以执行指定节点
   */
  canExecuteNode(roleId: string, nodeCategory: NodeCategory): boolean {
    const role = this.get(roleId);
    if (!role) return false;
    return role.allowedNodes.includes(nodeCategory);
  }

  /**
   * 检查角色是否拥有指定能力
   */
  hasCapability(roleId: string, capability: string): boolean {
    const role = this.get(roleId);
    if (!role) return false;
    return role.capabilities.includes(capability);
  }

  /**
   * 获取角色的所有能力
   */
  getCapabilities(roleId: string): string[] {
    const role = this.get(roleId);
    return role ? [...role.capabilities] : [];
  }

  /**
   * 获取所有可以执行指定节点类型的角色
   */
  getRolesForNode(nodeCategory: NodeCategory): Role[] {
    return this.getAll().filter(role =>
      role.allowedNodes.includes(nodeCategory)
    ).sort((a, b) => b.priority - a.priority);
  }

  /**
   * 根据节点类型获取可用角色
   */
  getRolesForNodeType(nodeType: string): Role[] {
    const mapping = this.nodeToRoleMappings.get(nodeType);
    if (!mapping) return [];

    return mapping.allowedRoles
      .map(id => this.get(id))
      .filter(Boolean) as Role[];
  }

  /**
   * 根据节点类型获取默认角色
   */
  getDefaultRoleForNodeType(nodeType: string): Role | undefined {
    const mapping = this.nodeToRoleMappings.get(nodeType);
    if (!mapping || !mapping.defaultRole) return undefined;

    return this.get(mapping.defaultRole);
  }

  /**
   * 注册节点到角色的映射
   */
  registerNodeMapping(mapping: NodeToRoleMapping): void {
    this.nodeToRoleMappings.set(mapping.nodeType, mapping);
  }

  /**
   * 获取所有角色注册信息
   */
  getAllRegistrations(): RoleRegistration[] {
    return Array.from(this.roles.values());
  }

  /**
   * 按能力搜索角色
   */
  findRolesByCapability(capability: string): Role[] {
    return this.getAll().filter(role =>
      role.capabilities.includes(capability)
    ).sort((a, b) => b.priority - a.priority);
  }
}

// 全局角色注册中心实例
export const globalRoleRegistry = new RoleRegistry();
