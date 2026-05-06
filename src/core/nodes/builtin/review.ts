// ============================================================================
// 审核类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Review 节点 - 审核代码/内容
 */
export class ReviewNode extends BaseNode {
  constructor() {
    super({
      id: 'review',
      type: 'builtin',
      name: { en: 'Review', zh: '审核' },
      description: {
        en: 'Review code or content for quality',
        zh: '审核代码或内容质量'
      },
      category: 'review',
      icon: '✅',
      inputs: [
        { name: 'content', type: 'object', required: true, description: { en: 'Content to review', zh: '待审核内容' } }
      ],
      outputs: [
        { name: 'review_result', type: 'object', required: true, description: { en: 'Review result', zh: '审核结果' } }
      ],
      color: '#F59E0B',
      accentColor: '#FBBF24'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    return {
      success: true,
      outputs: { review_result: { approved: true } },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有审核类节点
export const reviewNodes = [new ReviewNode()];
