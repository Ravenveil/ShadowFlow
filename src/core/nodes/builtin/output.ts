// ============================================================================
// 输出类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Report 节点 - 生成报告
 */
export class ReportNode extends BaseNode {
  constructor() {
    super({
      id: 'report',
      type: 'builtin',
      name: { en: 'Report', zh: '报告' },
      description: {
        en: 'Generate execution report',
        zh: '生成执行报告'
      },
      category: 'output',
      icon: '📊',
      inputs: [
        { name: 'data', type: 'object', required: true, description: { en: 'Report data', zh: '报告数据' } }
      ],
      outputs: [
        { name: 'report', type: 'object', required: true, description: { en: 'Generated report', zh: '生成的报告' } }
      ],
      color: '#06B6D4',
      accentColor: '#22D3EE'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    return {
      success: true,
      outputs: { report: { generated: true } },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有输出类节点
export const outputNodes = [new ReportNode()];
