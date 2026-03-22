// ============================================================================
// 决策类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Branch 节点 - 条件分支
 */
export class BranchNode extends BaseNode {
  constructor() {
    super({
      id: 'branch',
      type: 'builtin',
      name: { en: 'Branch', zh: '分支' },
      description: {
        en: 'Conditional branching based on criteria',
        zh: '根据条件进行分支'
      },
      category: 'decision',
      icon: '🔀',
      inputs: [
        { name: 'condition', type: 'any', required: true, description: { en: 'Condition value', zh: '条件值' } }
      ],
      outputs: [
        { name: 'true', type: 'any', required: false, description: { en: 'True path', zh: '真路径' } },
        { name: 'false', type: 'any', required: false, description: { en: 'False path', zh: '假路径' } }
      ],
      color: '#EF4444',
      accentColor: '#F87171'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { inputs } = context;
    const condition = inputs.condition;
    const isTrue = Boolean(condition);

    return {
      success: true,
      outputs: isTrue ? { true: condition } : { false: condition },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有决策类节点
export const decisionNodes = [new BranchNode()];
