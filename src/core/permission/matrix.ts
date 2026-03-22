// ============================================================================
// 权限矩阵实现 - 管理权限模板和权限配置
// ============================================================================

import type { PermissionConfig } from '../types';
import type { Permission, PermissionTemplate, MemoryType, DecisionType } from '../role/types';

/**
 * 预定义权限模板
 */
export const PERMISSION_TEMPLATES: Record<string, PermissionTemplate> = {
  // 三权分立模式权限
  'three-powers': {
    name: '三权分立',
    description: '规划、审核、调度三权分立，相互制衡',
    compatibleRoles: ['planner', 'reviewer', 'dispatcher', 'developer', 'dataEngineer', 'docWriter', 'compliance', 'deployer'],
    permissions: {
      planner: {
        canSendTo: ['reviewer', 'dispatcher'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'knowledge'],
        canDecide: ['plan', 'assign'],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      reviewer: {
        canSendTo: ['planner', 'dispatcher'],
        canReceiveFrom: ['planner'],
        canAccessMemory: ['context', 'execution', 'knowledge'],
        canDecide: ['approve', 'reject'],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      dispatcher: {
        canSendTo: ['planner', 'reviewer', 'developer', 'dataEngineer', 'docWriter', 'compliance', 'deployer'],
        canReceiveFrom: ['reviewer', 'developer', 'dataEngineer', 'docWriter', 'compliance', 'deployer'],
        canAccessMemory: ['all'],
        canDecide: ['dispatch', 'aggregate'],
        canManageAgents: true,
        canModifyWorkflow: false
      },
      developer: {
        canSendTo: ['dispatcher', 'reviewer'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      dataEngineer: {
        canSendTo: ['dispatcher', 'reviewer'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      docWriter: {
        canSendTo: ['dispatcher', 'reviewer'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      compliance: {
        canSendTo: ['dispatcher', 'reviewer'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'execution', 'knowledge', 'working'],
        canDecide: ['security-audit', 'compliance-check'],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      deployer: {
        canSendTo: ['dispatcher', 'reviewer'],
        canReceiveFrom: ['dispatcher'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      }
    }
  },

  // 蜂群并行模式权限（扁平化）
  'swarm': {
    name: '蜂群并行',
    description: '中心化调度，工蜂并行执行',
    compatibleRoles: ['queen', 'worker'],
    permissions: {
      queen: {
        canSendTo: ['*'],
        canReceiveFrom: ['*'],
        canAccessMemory: ['all'],
        canDecide: ['all'],
        canManageAgents: true,
        canModifyWorkflow: true
      },
      worker: {
        canSendTo: ['queen'],
        canReceiveFrom: ['queen'],
        canAccessMemory: ['context', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      }
    }
  },

  // 扁平协作模式（无层级）
  'flat': {
    name: '扁平协作',
    description: '所有成员平等，投票决策',
    compatibleRoles: ['member'],
    permissions: {
      member: {
        canSendTo: ['*'],
        canReceiveFrom: ['*'],
        canAccessMemory: ['all'],
        canDecide: ['vote'],
        canManageAgents: false,
        canModifyWorkflow: true
      }
    }
  },

  // TDD 模式
  'tdd': {
    name: '测试驱动',
    description: '测试先行，代码实现，循环验证',
    compatibleRoles: ['planner', 'developer', 'reviewer'],
    permissions: {
      planner: {
        canSendTo: ['developer', 'reviewer'],
        canReceiveFrom: ['reviewer'],
        canAccessMemory: ['context', 'knowledge'],
        canDecide: ['plan', 'assign'],
        canManageAgents: true,
        canModifyWorkflow: false
      },
      developer: {
        canSendTo: ['reviewer'],
        canReceiveFrom: ['planner', 'reviewer'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      reviewer: {
        canSendTo: ['planner', 'developer'],
        canReceiveFrom: ['developer'],
        canAccessMemory: ['context', 'execution', 'knowledge'],
        canDecide: ['approve', 'reject', 'refactor'],
        canManageAgents: false,
        canModifyWorkflow: false
      }
    }
  },

  // 规范驱动模式
  'spec-driven': {
    name: '规范驱动',
    description: '宪法先行，规范明确，任务化执行',
    compatibleRoles: ['planner', 'developer', 'reviewer', 'compliance'],
    permissions: {
      planner: {
        canSendTo: ['developer', 'reviewer'],
        canReceiveFrom: ['compliance', 'reviewer'],
        canAccessMemory: ['context', 'knowledge'],
        canDecide: ['constitute', 'specify', 'plan', 'taskify'],
        canManageAgents: true,
        canModifyWorkflow: false
      },
      developer: {
        canSendTo: ['reviewer'],
        canReceiveFrom: ['planner'],
        canAccessMemory: ['context', 'execution', 'working'],
        canDecide: [],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      reviewer: {
        canSendTo: ['planner', 'compliance', 'developer'],
        canReceiveFrom: ['developer'],
        canAccessMemory: ['context', 'execution', 'knowledge'],
        canDecide: ['approve', 'reject'],
        canManageAgents: false,
        canModifyWorkflow: false
      },
      compliance: {
        canSendTo: ['planner', 'reviewer'],
        canReceiveFrom: ['planner', 'reviewer'],
        canAccessMemory: ['context', 'knowledge', 'all'],
        canDecide: ['verify', 'compliance-check'],
        canManageAgents: false,
        canModifyWorkflow: false
      }
    }
  }
};

/**
 * 权限矩阵
 */
export class PermissionMatrix {
  private templates: Map<string, PermissionTemplate> = new Map();

  constructor() {
    // 加载内置权限模板
    for (const [name, template] of Object.entries(PERMISSION_TEMPLATES)) {
      this.registerTemplate(template);
    }
  }

  /**
   * 注册权限模板
   */
  registerTemplate(template: PermissionTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * 获取权限模板
   */
  getTemplate(name: string): PermissionTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 获取所有模板名称
   */
  getTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): PermissionTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取角色的权限
   */
  getPermission(templateName: string, roleId: string): Permission | undefined {
    return this.templates.get(templateName)?.permissions[roleId];
  }

  /**
   * 检查模板是否包含指定角色
   */
  hasRole(templateName: string, roleId: string): boolean {
    return roleId in (this.templates.get(templateName)?.permissions ?? {});
  }

  /**
   * 获取模板中的所有角色
   */
  getTemplateRoles(templateName: string): string[] {
    return Object.keys(this.templates.get(templateName)?.permissions ?? {});
  }

  /**
   * 加载权限配置
   */
  loadConfig(config: PermissionConfig): Map<string, Permission> {
    const result = new Map<string, Permission>();

    // 加载模板
    if (config.template) {
      const template = this.templates.get(config.template);
      if (template) {
        for (const [roleId, permission] of Object.entries(template.permissions)) {
          result.set(roleId, permission);
        }
      }
    }

    // 应用覆盖
    if (config.overrides) {
      for (const [roleId, override] of Object.entries(config.overrides)) {
        const existing = result.get(roleId);
        if (existing) {
          result.set(roleId, { ...existing, ...override });
        }
      }
    }

    // 加载自定义权限
    if (config.custom) {
      for (const [roleId, permission] of Object.entries(config.custom)) {
        result.set(roleId, permission);
      }
    }

    return result;
  }

  /**
   * 创建新的权限模板
   */
  createTemplate(
    name: string,
    description: string,
    permissions: Record<string, Permission>,
    compatibleRoles: string[] = []
  ): PermissionTemplate {
    const template: PermissionTemplate = {
      name,
      description,
      permissions,
      compatibleRoles
    };

    this.registerTemplate(template);
    return template;
  }

  /**
   * 检查角色是否兼容模板
   */
  isRoleCompatible(templateName: string, roleId: string): boolean {
    const template = this.templates.get(templateName);
    if (!template) return false;

    // 如果没有指定兼容角色列表，则认为兼容
    if (template.compatibleRoles.length === 0) return true;

    // 检查角色是否在兼容列表中
    return template.compatibleRoles.includes(roleId);
  }

  /**
   * 获取兼容指定角色列表的所有模板
   */
  findTemplatesForRoles(roleIds: string[]): PermissionTemplate[] {
    return this.getAllTemplates().filter(template =>
      roleIds.some(roleId => this.isRoleCompatible(template.name, roleId))
    );
  }

  /**
   * 转换为 YAML 格式（用于导出配置）
   */
  exportTemplate(name: string): string {
    const template = this.getTemplate(name);
    if (!template) throw new Error(`Template not found: ${name}`);

    const lines: string[] = [];
    lines.push(`name: "${template.name}"`);
    lines.push(`description: "${template.description}"`);
    lines.push(`compatibleRoles:`);
    for (const role of template.compatibleRoles) {
      lines.push(`  - ${role}`);
    }
    lines.push(`permissions:`);

    for (const [roleId, permission] of Object.entries(template.permissions)) {
      lines.push(`  ${roleId}:`);
      lines.push(`    canSendTo: [${permission.canSendTo.join(', ')}]`);
      lines.push(`    canReceiveFrom: [${permission.canReceiveFrom.join(', ')}]`);
      lines.push(`    canAccessMemory: [${permission.canAccessMemory.join(', ')}]`);
      lines.push(`    canDecide: [${permission.canDecide.join(', ')}]`);
      lines.push(`    canManageAgents: ${permission.canManageAgents}`);
      lines.push(`    canModifyWorkflow: ${permission.canModifyWorkflow}`);
    }

    return lines.join('\n');
  }
}

// 全局权限矩阵实例
export const globalPermissionMatrix = new PermissionMatrix();
