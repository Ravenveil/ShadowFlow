// ============================================================================
// 协调类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Parallel 节点 - 并行执行
 */
export class ParallelNode extends BaseNode {
  constructor() {
    super({
      id: 'parallel',
      type: 'builtin',
      name: { en: 'Parallel', zh: '并行' },
      description: {
        en: 'Execute tasks in parallel',
        zh: '并行执行任务'
      },
      category: 'coordinate',
      icon: '🔄',
      inputs: [
        { name: 'tasks', type: 'array', required: true, description: { en: 'Tasks to execute', zh: '待执行任务' } }
      ],
      outputs: [
        { name: 'results', type: 'array', required: true, description: { en: 'Execution results', zh: '执行结果' } }
      ],
      color: '#EC4899',
      accentColor: '#F472B6'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    return {
      success: true,
      outputs: { results: [] },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有协调类节点
export const coordinateNodes = [new ParallelNode()];
