/**
 * AgentGraph 主入口文件
 *
 * 导出所有公共 API
 */

// ============================================================================
// 类型导出（从统一入口导出，避免重复）
// ============================================================================

export * from './types';

// ============================================================================
// 节点系统
// ============================================================================

export * from './nodes/base';
export * from './nodes/registry';

// ============================================================================
// 角色和权限实现（仅导出类和实例，类型已从 types 导出）
// ============================================================================

// 角色管理
export { RoleManager, globalRoleManager, BUILTIN_ROLES as ROLE_DEFINITIONS } from './role/role-manager';
export { RoleRegistry, globalRoleRegistry, BUILTIN_ROLES, NODE_TO_ROLE_MAPPINGS } from './role/registry';

// 权限管理
export { PermissionManager, globalPermissionManager } from './role/permission-manager';
export { PermissionMatrix, globalPermissionMatrix, PERMISSION_TEMPLATES } from './permission/matrix';
export { PermissionChecker } from './permission/checker';

// ============================================================================
// 河网同步实现（仅导出类和函数，避免与 types 重复）
// ============================================================================

export {
  RiverMemorySystem,
  getMemorySystem,
  resetMemorySystem,
  createMemorySystem,
  River,
  DamManager,
  SedimentManager,
  Purifier,
  BranchImpl,
  SyncPointImpl,
  RiverNetwork,
  createRiverNetwork,
  MainFlowImpl,
  createMainFlow,
  MessageBus,
  createMessageBus,
  ConflictDetector,
  createConflictDetector
} from './memory';

// ============================================================================
// 执行器（仅导出特定成员，避免与 types 重复）
// ============================================================================

export { BaseExecutor } from './executors/base-executor';
export { BaseNodeExecutor } from './executors/base-node-executor';
export { nodeDefinitions } from './executors/node-definitions';

// ============================================================================
// 全局实例
// ============================================================================

import { globalNodeRegistry } from './nodes/registry';
import { globalRoleRegistry } from './role/registry';
import { globalPermissionMatrix } from './permission/matrix';
import { getMemorySystem } from './memory';

// 导出全局节点注册表
export { globalNodeRegistry };

// 导出全局角色注册中心
export { globalRoleRegistry };

// 导出全局权限矩阵
export { globalPermissionMatrix };

// 导出获取记忆系统函数
export { getMemorySystem };
