// ============================================================================
// 执行类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Generate 节点 - 生成代码/内容
 */
export class GenerateNode extends BaseNode {
  constructor() {
    super({
      id: 'generate',
      type: 'builtin',
      name: { en: 'Generate', zh: '生成' },
      description: {
        en: 'Generate code or content based on requirements',
        zh: '根据需求生成代码或内容'
      },
      category: 'execution',
      icon: '⚡',
      inputs: [
        { name: 'requirements', type: 'object', required: true, description: { en: 'Requirements', zh: '需求' } }
      ],
      outputs: [
        { name: 'generated', type: 'object', required: true, description: { en: 'Generated content', zh: '生成的内容' } }
      ],
      color: '#3B82F6',
      accentColor: '#60A5FA'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    return {
      success: true,
      outputs: { generated: { content: '' } },
      metrics: { executionTime: 0 }
    };
  }
}

// 导出所有执行类节点
export const executionNodes = [new GenerateNode()];
