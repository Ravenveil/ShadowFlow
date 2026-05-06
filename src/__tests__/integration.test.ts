/**
 * 集成测试
 *
 * 测试各个模块之间的集成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { globalNodeRegistry } from '../nodes/registry';
import { getRoleManager } from '../role/role-manager';
import { River } from '../memory/river';
import type { INode } from '../types';
import type { IMemoryChunk } from '../types/memory';

// 全局角色管理器实例
const globalRoleManager = getRoleManager();

describe('Integration Tests', () => {
  let river: River;

  beforeEach(() => {
    river = new River({ enableEvents: false });
  });

  it('should manage roles correctly', () => {
    const planner = globalRoleManager.getRole('planner');

    expect(planner).toBeDefined();
    expect(planner?.name).toBe('规划');
    expect(planner?.description).toBe('负责任务规划和分配');
    expect(planner?.allowedNodes).toContain('planning');
    expect(planner?.capabilities).toContain('analyze');
  });

  it('should register and retrieve nodes', () => {
    const definition: INode = {
      id: 'integration-test-node',
      type: 'builtin',
      category: 'execution',
      icon: 'test',
      name: { en: 'Integration Test', zh: '集成测试' },
      description: { en: 'Test node for integration', zh: '集成测试节点' },
      inputs: [
        { name: 'input', type: 'string', required: true },
      ],
      outputs: [
        { name: 'output', type: 'object', required: false },
      ],
    };

    globalNodeRegistry.registerDefinition(definition);

    const retrieved = globalNodeRegistry.getDefinition('integration-test-node');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name.zh).toBe('集成测试');
    expect(retrieved?.inputs).toHaveLength(1);
    expect(retrieved?.inputs[0].name).toBe('input');
  });

  it('should integrate role manager with node registry', () => {
    // Get a role
    const developer = globalRoleManager.getRole('developer');
    expect(developer).toBeDefined();

    // Check role can access node category
    const canAccess = globalRoleManager.canAccessNode('developer', 'execution');
    expect(canAccess).toBe(true);

    // Get allowed nodes for the role
    const allowedNodes = globalRoleManager.getAllowedNodes('developer');
    expect(allowedNodes.length).toBeGreaterThan(0);
  });

  it('should integrate river memory with node execution simulation', () => {
    // Simulate a node execution
    const nodeId = 'test-execution-node';

    // Write context memory before execution
    const contextChunk: IMemoryChunk = {
      id: 'ctx-1',
      type: 'context',
      level: 'runtime',
      sourceNode: nodeId,
      content: {
        task: 'Generate a function',
        requirements: ['type-safe', 'well-documented'],
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        tokens: 50,
        bytes: 200,
        importance: 0.8,
      },
    };

    river.pour(contextChunk);

    // Simulate execution and write result
    const executionChunk: IMemoryChunk = {
      id: 'exec-1',
      type: 'execution',
      level: 'runtime',
      sourceNode: nodeId,
      content: {
        code: 'function example() { return "hello"; }',
        language: 'typescript',
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        tokens: 30,
        bytes: 150,
        importance: 0.9,
      },
    };

    river.pour(executionChunk);

    // Record node result
    river.recordNodeResult(nodeId, {
      success: true,
      outputs: { code: 'function example() { return "hello"; }' },
      metrics: { executionTime: 500, tokensUsed: 80 },
    });

    // Verify state
    const contextMemories = river.drink('context');
    const executionMemories = river.drink('execution');
    const result = river.getNodeResult(nodeId);

    expect(contextMemories).toHaveLength(1);
    expect(contextMemories[0].content.task).toBe('Generate a function');

    expect(executionMemories).toHaveLength(1);
    expect(executionMemories[0].content.language).toBe('typescript');

    expect(result).toBeDefined();
    expect(result?.success).toBe(true);
    expect(result?.metrics?.executionTime).toBe(500);
  });

  it('should integrate checkpoint with workflow', () => {
    // Add initial state
    river.setVariable('workflow-state', 'initial');
    river.pour({
      id: 'mem-1',
      type: 'working',
      level: 'runtime',
      sourceNode: 'node-1',
      content: { step: 1 },
      metadata: { createdAt: new Date(), updatedAt: new Date(), tokens: 1, bytes: 10, importance: 0.5 },
    });

    // Create checkpoint
    const checkpointId = river.buildDam('node_complete', { nodeId: 'node-1', nodeName: 'Node 1' });

    // Modify state
    river.setVariable('workflow-state', 'modified');
    river.pour({
      id: 'mem-2',
      type: 'working',
      level: 'runtime',
      sourceNode: 'node-2',
      content: { step: 2 },
      metadata: { createdAt: new Date(), updatedAt: new Date(), tokens: 1, bytes: 10, importance: 0.5 },
    });

    // Verify modified state
    expect(river.getVariable('workflow-state')).toBe('modified');
    expect(river.drink('working')).toHaveLength(2);

    // Restore checkpoint
    river.openDam(checkpointId);

    // Verify restored state
    expect(river.getVariable('workflow-state')).toBe('initial');
    expect(river.drink('working')).toHaveLength(1);
  });

  it('should integrate role permissions with memory access', () => {
    // Write memories with different types
    river.pour({
      id: 'context-1',
      type: 'context',
      level: 'workflow',
      sourceNode: 'planner',
      content: { plan: 'test plan' },
      metadata: { createdAt: new Date(), updatedAt: new Date(), tokens: 10, bytes: 50, importance: 0.8 },
    });

    river.pour({
      id: 'execution-1',
      type: 'execution',
      level: 'runtime',
      sourceNode: 'developer',
      content: { result: 'test result' },
      metadata: { createdAt: new Date(), updatedAt: new Date(), tokens: 10, bytes: 50, importance: 0.7 },
    });

    // Verify memories can be retrieved
    const allMemories = river.drink();
    expect(allMemories).toHaveLength(2);

    // Filter by type
    const contextMemories = river.drink('context');
    expect(contextMemories).toHaveLength(1);
  });

  it('should handle complex workflow simulation', () => {
    // Simulate a workflow with multiple nodes
    const nodes = [
      { id: 'analyze', role: 'planner', category: 'planning' as const },
      { id: 'design', role: 'planner', category: 'planning' as const },
      { id: 'implement', role: 'developer', category: 'execution' as const },
      { id: 'review', role: 'reviewer', category: 'review' as const },
    ];

    // Execute each node and record results
    for (const node of nodes) {
      // Verify role can access node category
      const canAccess = globalRoleManager.canAccessNode(node.role, node.category);
      expect(canAccess).toBe(true);

      // Write memory
      river.pour({
        id: `mem-${node.id}`,
        type: 'execution',
        level: 'runtime',
        sourceNode: node.id,
        content: { node: node.id, completed: true },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          tokens: 10,
          bytes: 50,
          importance: 0.7,
        },
      });

      // Record result
      river.recordNodeResult(node.id, {
        success: true,
        outputs: { status: 'completed' },
        metrics: { executionTime: Math.random() * 1000 },
      });
    }

    // Verify all nodes are in execution path
    const path = river.getExecutionPath();
    expect(path).toHaveLength(4);
    expect(path).toEqual(['analyze', 'design', 'implement', 'review']);

    // Verify all results are recorded
    for (const node of nodes) {
      const result = river.getNodeResult(node.id);
      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
    }

    // Create checkpoint at end of workflow
    const checkpointId = river.buildDam('manual', {
      nodeId: 'review',
      nodeName: 'Review Node',
    });

    expect(checkpointId).toBeDefined();
  });

  it('should export and verify stats', () => {
    // Add data
    river.setVariable('var1', 'value1');
    river.setVariable('var2', 'value2');

    river.pour({
      id: 'm1',
      type: 'context',
      level: 'runtime',
      sourceNode: 'n1',
      content: {},
      metadata: { createdAt: new Date(), updatedAt: new Date(), tokens: 1, bytes: 10, importance: 0.5 },
    });

    // Get stats
    const stats = river.getStats();

    expect(stats.totalChunks).toBe(1);
    expect(stats.totalVariables).toBe(2);
    expect(stats.executionPathLength).toBe(0);
    expect(stats.totalCheckpoints).toBe(0);
    expect(stats.riverAge).toBeGreaterThan(0);

    // Get node registry stats
    const registryStats = globalNodeRegistry.getCategoryStats();
    expect(registryStats).toBeDefined();
    expect(registryStats instanceof Map).toBe(true);

    // Get role manager stats
    const roleStats = globalRoleManager.getStats();
    expect(roleStats.totalRoles).toBeGreaterThan(0);
  });
});
