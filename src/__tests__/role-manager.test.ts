/**
 * 角色管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getRoleManager, resetRoleManager } from '../role/role-manager';

describe('RoleManager', () => {
  beforeEach(() => {
    resetRoleManager();
  });

  it('should initialize with builtin roles', () => {
    const roleManager = getRoleManager();
    const allRoles = roleManager.getAllRoles();

    expect(allRoles.length).toBeGreaterThan(0);
    expect(allRoles.some((r: any) => r.id === 'planner')).toBe(true);
  });

  it('should get a role by id', () => {
    const roleManager = getRoleManager();
    const planner = roleManager.getRole('planner');

    expect(planner).toBeDefined();
    expect(planner?.name).toBe('规划');
    expect(planner?.description).toBe('负责任务规划和分配');
    expect(planner?.capabilities).toContain('analyze');
  });

  it('should check if role can access node category', () => {
    const roleManager = getRoleManager();

    const canAnalyze = roleManager.canAccessNode('planner', 'planning');
    const canCode = roleManager.canAccessNode('developer', 'execution');
    const cannotCode = roleManager.canAccessNode('planner', 'execution');

    expect(canAnalyze).toBe(true);
    expect(canCode).toBe(true);
    expect(cannotCode).toBe(false);
  });

  it('should check role capabilities', () => {
    const roleManager = getRoleManager();

    const hasAnalyze = roleManager.hasCapability('planner', 'analyze');
    const hasCode = roleManager.hasCapability('developer', 'code');
    const notHasCode = roleManager.hasCapability('planner', 'code');

    expect(hasAnalyze).toBe(true);
    expect(hasCode).toBe(true);
    expect(notHasCode).toBe(false);
  });

  it('should get role capabilities', () => {
    const roleManager = getRoleManager();
    const capabilities = roleManager.getRoleCapabilities('planner');

    expect(capabilities).toContain('analyze');
    expect(capabilities).toContain('design');
    expect(capabilities).toContain('decompose');
    expect(capabilities).toContain('assign');
    expect(capabilities.length).toBe(4);
  });

  it('should get allowed nodes for role', () => {
    const roleManager = getRoleManager();
    const allowedNodes = roleManager.getAllowedNodes('developer');

    expect(allowedNodes.length).toBeGreaterThan(0);
    expect(allowedNodes.includes('execution')).toBe(true);
  });

  it('should create custom role', () => {
    const roleManager = getRoleManager();

    const customRole = {
      id: 'custom-dev',
      name: '自定义开发',
      description: '自定义开发角色',
      allowedNodes: ['execution'] as any,
      capabilities: ['code', 'test'],
      priority: 1,
    };

    roleManager.createRole(customRole);

    const retrieved = roleManager.getRole('custom-dev');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('自定义开发');
  });

  it('should throw error when creating duplicate role', () => {
    const roleManager = getRoleManager();

    const duplicateRole = {
      id: 'planner',
      name: '重复规划',
      description: '重复的角色',
      allowedNodes: ['planning'] as any,
      capabilities: ['plan'],
      priority: 1,
    };

    expect(() => roleManager.createRole(duplicateRole)).toThrow();
  });

  it('should delete custom role', () => {
    const roleManager = getRoleManager();

    const customRole = {
      id: 'temporary',
      name: '临时',
      description: '临时角色',
      allowedNodes: ['execution'] as any,
      capabilities: ['test'],
      priority: 1,
    };

    roleManager.createRole(customRole);
    expect(roleManager.getRole('temporary')).toBeDefined();

    const result = roleManager.deleteRole('temporary');
    expect(result).toBe(true);
    expect(roleManager.getRole('temporary')).toBeUndefined();
  });

  it('should not delete predefined role', () => {
    const roleManager = getRoleManager();
    expect(() => roleManager.deleteRole('planner')).toThrow();
  });

  it('should bind agent to role', () => {
    const roleManager = getRoleManager();

    const binding = roleManager.bindAgent('agent-1', 'developer', {
      assignedBy: 'test',
    });

    expect(binding.agentId).toBe('agent-1');
    expect(binding.roleId).toBe('developer');
    expect(binding.boundAt).toBeInstanceOf(Date);
  });

  it('should get agent role', () => {
    const roleManager = getRoleManager();

    roleManager.bindAgent('agent-1', 'planner');
    const roleId = roleManager.getAgentRole('agent-1');

    expect(roleId).toBe('planner');
  });

  it('should unbind agent from role', () => {
    const roleManager = getRoleManager();

    roleManager.bindAgent('agent-1', 'developer');
    expect(roleManager.getAgentRole('agent-1')).toBe('developer');

    roleManager.unbindAgent('agent-1');
    expect(roleManager.getAgentRole('agent-1')).toBeNull();
  });

  it('should get role stats', () => {
    const roleManager = getRoleManager();
    const stats = roleManager.getStats();

    expect(stats.totalRoles).toBeGreaterThan(0);
    expect(stats.predefinedRoles).toBeGreaterThan(0);
    expect(stats.customRoles).toBe(0);
  });
});
