/**
 * 节点注册表测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { globalNodeRegistry } from '../nodes/registry';
import type { INodeDefinition } from '../types/node';

describe('NodeRegistry', () => {
  beforeEach(() => {
    // 清空注册表
    for (const def of globalNodeRegistry.getAllDefinitions()) {
      globalNodeRegistry.remove(def.id);
    }
  });

  it('should register a node definition', () => {
    const definition: INodeDefinition = {
      id: 'test-node',
      type: 'builtin',
      category: 'input',
      icon: 'test',
      name: { en: 'Test Node', zh: '测试节点' },
      description: { en: 'A test node', zh: '一个测试节点' },
      inputs: [],
      outputs: [],
    };

    globalNodeRegistry.registerDefinition(definition);

    const retrieved = globalNodeRegistry.getDefinition('test-node');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-node');
    expect(retrieved?.name.zh).toBe('测试节点');
  });

  it('should throw error when registering duplicate node', () => {
    const definition: INodeDefinition = {
      id: 'test-node',
      type: 'builtin',
      category: 'input',
      icon: 'test',
      name: { en: 'Test Node', zh: '测试节点' },
      description: { en: 'A test node', zh: '一个测试节点' },
      inputs: [],
      outputs: [],
    };

    globalNodeRegistry.registerDefinition(definition);

    expect(() => globalNodeRegistry.registerDefinition(definition)).toThrow();
  });

  it('should get nodes by category', () => {
    const inputNode: INode = {
      id: 'input-node',
      type: 'builtin',
      category: 'input',
      icon: 'input',
      name: { en: 'Input', zh: '输入' },
      description: { en: 'Input node', zh: '输入节点' },
      inputs: [],
      outputs: [],
    };

    const executionNode: INode = {
      id: 'execution-node',
      type: 'builtin',
      category: 'execution',
      icon: 'execution',
      name: { en: 'Execution', zh: '执行' },
      description: { en: 'Execution node', zh: '执行节点' },
      inputs: [],
      outputs: [],
    };

    globalNodeRegistry.registerDefinition(inputNode);
    globalNodeRegistry.registerDefinition(executionNode);

    const inputNodes = globalNodeRegistry.getDefinitionsByCategory('input');
    const executionNodes = globalNodeRegistry.getDefinitionsByCategory('execution');

    expect(inputNodes).toHaveLength(1);
    expect(inputNodes[0].id).toBe('input-node');
    expect(executionNodes).toHaveLength(1);
    expect(executionNodes[0].id).toBe('execution-node');
  });

  it('should search nodes by query', () => {
    const nodes: INode[] = [
      {
        id: 'data-transform',
        type: 'builtin',
        category: 'execution',
        icon: 'transform',
        name: { en: 'Data Transform', zh: '数据转换' },
        description: { en: 'Transform data', zh: '转换数据' },
        inputs: [],
        outputs: [],
      },
      {
        id: 'code-generator',
        type: 'builtin',
        category: 'execution',
        icon: 'code',
        name: { en: 'Code Generator', zh: '代码生成器' },
        description: { en: 'Generate code', zh: '生成代码' },
        inputs: [],
        outputs: [],
      },
    ];

    globalNodeRegistry.registerDefinitions(nodes);

    const results1 = globalNodeRegistry.searchDefinitions('data');
    expect(results1).toHaveLength(1);
    expect(results1[0].id).toBe('data-transform');

    const results2 = globalNodeRegistry.searchDefinitions('代码');
    expect(results2).toHaveLength(1);
    expect(results2[0].id).toBe('code-generator');

    const results3 = globalNodeRegistry.searchDefinitions('transform');
    expect(results3).toHaveLength(1);
    expect(results3[0].id).toBe('data-transform');
  });

  it('should remove a node', () => {
    const definition: INodeDefinition = {
      id: 'test-node',
      type: 'builtin',
      category: 'input',
      icon: 'test',
      name: { en: 'Test Node', zh: '测试节点' },
      description: { en: 'A test node', zh: '一个测试节点' },
      inputs: [],
      outputs: [],
    };

    globalNodeRegistry.registerDefinition(definition);
    expect(globalNodeRegistry.hasDefinition('test-node')).toBe(true);

    globalNodeRegistry.remove('test-node');
    expect(globalNodeRegistry.hasDefinition('test-node')).toBe(false);
  });

  it('should clear all nodes', () => {
    const definitions: INode[] = [
      {
        id: 'node-1',
        type: 'builtin',
        category: 'input',
        icon: 'test',
        name: { en: 'Node 1', zh: '节点1' },
        description: { en: 'First node', zh: '第一个节点' },
        inputs: [],
        outputs: [],
      },
      {
        id: 'node-2',
        type: 'builtin',
        category: 'execution',
        icon: 'test',
        name: { en: 'Node 2', zh: '节点2' },
        description: { en: 'Second node', zh: '第二个节点' },
        inputs: [],
        outputs: [],
      },
    ];

    definitions.forEach((def: INodeDefinition) => globalNodeRegistry.registerDefinition(def));
    expect(globalNodeRegistry.getAllDefinitions()).toHaveLength(2);

    globalNodeRegistry.clear();
    expect(globalNodeRegistry.getAllDefinitions()).toHaveLength(0);
  });

  it('should get category statistics', () => {
    const definitions: INode[] = [
      { id: 'input-1', type: 'builtin', category: 'input', icon: 'i', name: { en: 'I1', zh: 'I1' }, description: { en: 'D', zh: 'D' }, inputs: [], outputs: [] },
      { id: 'input-2', type: 'builtin', category: 'input', icon: 'i', name: { en: 'I2', zh: 'I2' }, description: { en: 'D', zh: 'D' }, inputs: [], outputs: [] },
      { id: 'exec-1', type: 'builtin', category: 'execution', icon: 'e', name: { en: 'E1', zh: 'E1' }, description: { en: 'D', zh: 'D' }, inputs: [], outputs: [] },
      { id: 'review-1', type: 'builtin', category: 'review', icon: 'r', name: { en: 'R1', zh: 'R1' }, description: { en: 'D', zh: 'D' }, inputs: [], outputs: [] },
    ];

    definitions.forEach((def: INodeDefinition) => globalNodeRegistry.registerDefinition(def));

    const stats = globalNodeRegistry.getCategoryStats();
    expect(stats.get('input')).toBe(2);
    expect(stats.get('execution')).toBe(1);
    expect(stats.get('review')).toBe(1);
    expect(stats.get('planning')).toBe(0);
  });
});
