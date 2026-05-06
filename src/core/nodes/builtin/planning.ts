// ============================================================================
// 规划类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Analyze 节点 - 分析任务
 */
export class AnalyzeNode extends BaseNode {
  constructor() {
    super({
      id: 'analyze',
      type: 'builtin',
      name: { en: 'Analyze', zh: '分析' },
      description: {
        en: 'Analyze task complexity and requirements',
        zh: '分析任务复杂度和需求'
      },
      category: 'planning',
      icon: '🔍',
      inputs: [
        { name: 'task', type: 'object', required: true, description: { en: 'Task object', zh: '任务对象' } }
      ],
      outputs: [
        { name: 'analysis', type: 'object', required: true, description: { en: 'Analysis result', zh: '分析结果' } }
      ],
      color: '#8B5CF6',
      accentColor: '#A78BFA'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    return {
      success: true,
      outputs: { analysis: { analyzed: true } },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有规划类节点
export const planningNodes = [new AnalyzeNode()];
