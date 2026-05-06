// ============================================================================
// 输入类节点
// ============================================================================

import { BaseNode } from '../base';
import type { NodeContext, NodeResult } from '../../types';

/**
 * Receive 节点 - 接收并解析用户输入
 */
export class ReceiveNode extends BaseNode {
  constructor() {
    super({
      id: 'receive',
      type: 'builtin',
      name: { en: 'Receive', zh: '接收' },
      description: {
        en: 'Receive and parse user input',
        zh: '接收并解析用户输入'
      },
      category: 'input',
      icon: '📥',
      inputs: [
        {
          name: 'raw_input',
          type: 'string',
          required: true,
          description: { en: 'Raw input text', zh: '原始输入文本' }
        }
      ],
      outputs: [
        {
          name: 'parsed_task',
          type: 'object',
          required: true,
          description: { en: 'Parsed task object', zh: '解析后的任务对象' }
        }
      ],
      configSchema: {
        type: 'object',
        properties: {
          parser: {
            type: 'string',
            enum: ['auto', 'json', 'markdown', 'natural'],
            default: 'auto',
            description: 'Input parser type'
          }
        }
      },
      defaultConfig: {
        parser: 'auto'
      },
      color: '#10B981',
      accentColor: '#34D399'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { inputs, config } = context;
    const rawInput = inputs.raw_input;
    const parser = config.parser ?? 'auto';

    try {
      // 解析输入
      const parsedTask = this.parseInput(rawInput, parser);

      return {
        success: true,
        outputs: { parsed_task: parsedTask },
        metrics: {
          executionTime: Date.now() - new Date().getTime()
        }
      };
    } catch (error) {
      return {
        success: false,
        outputs: {},
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private parseInput(input: string, parser: string): any {
    switch (parser) {
      case 'json':
        try {
          return JSON.parse(input);
        } catch (e) {
          throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
        }
      case 'markdown':
        return { type: 'markdown', content: input };
      case 'natural':
        return { type: 'natural', content: input };
      case 'auto':
      default:
        // 尝试自动检测格式
        try {
          return JSON.parse(input);
        } catch {
          return { type: 'text', content: input };
        }
    }
  }
}

/**
 * Understand 节点 - 深入理解任务需求
 */
export class UnderstandNode extends BaseNode {
  constructor() {
    super({
      id: 'understand',
      type: 'builtin',
      name: { en: 'Understand', zh: '理解' },
      description: {
        en: 'Deep understanding of task requirements and context',
        zh: '深入理解任务需求和上下文'
      },
      category: 'input',
      icon: '🧠',
      inputs: [
        {
          name: 'task',
          type: 'object',
          required: true,
          description: { en: 'Task object', zh: '任务对象' }
        },
        {
          name: 'context',
          type: 'object',
          required: false,
          description: { en: 'Additional context', zh: '附加上下文' }
        }
      ],
      outputs: [
        {
          name: 'understanding',
          type: 'object',
          required: true,
          description: { en: 'Understanding result', zh: '理解结果' }
        },
        {
          name: 'questions',
          type: 'array',
          required: false,
          description: { en: 'Questions for clarification', zh: '待澄清的问题' }
        }
      ],
      configSchema: {
        type: 'object',
        properties: {
          depth: {
            type: 'string',
            enum: ['shallow', 'medium', 'deep'],
            default: 'medium',
            description: 'Analysis depth level'
          }
        }
      },
      defaultConfig: {
        depth: 'medium'
      },
      color: '#10B981',
      accentColor: '#34D399'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { inputs, config } = context;
    const task = inputs.task;
    const depth = config.depth ?? 'medium';

    // 分析任务
    const understanding = {
      summary: typeof task === 'string' ? task : task.content ?? task,
      depth,
      analyzedAt: new Date().toISOString(),
      taskType: this.detectTaskType(task)
    };

    // 根据深度生成问题
    const questions = this.generateQuestions(depth);

    return {
      success: true,
      outputs: { understanding, questions },
      metrics: {
        executionTime: Date.now() - new Date().getTime()
      }
    };
  }

  private detectTaskType(task: any): string {
    const content = typeof task === 'string' ? task : task.content ?? JSON.stringify(task);
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('fix') || lowerContent.includes('error')) {
      return 'bugfix';
    }
    if (lowerContent.includes('implement') || lowerContent.includes('create')) {
      return 'feature';
    }
    if (lowerContent.includes('refactor')) {
      return 'refactoring';
    }
    return 'general';
  }

  private generateQuestions(depth: string): Array<{ question: string; type: string }> {
    switch (depth) {
      case 'shallow':
        return [];
      case 'medium':
        return [
          { question: 'Please confirm the task priority', type: 'clarification' }
        ];
      case 'deep':
        return [
          { question: 'Please confirm the task priority', type: 'clarification' },
          { question: 'Are there any specific constraints or requirements?', type: 'clarification' },
          { question: 'What is the expected outcome format?', type: 'clarification' }
        ];
      default:
        return [];
    }
  }
}

/**
 * Clarify 节点 - 澄清任务细节
 */
export class ClarifyNode extends BaseNode {
  constructor() {
    super({
      id: 'clarify',
      type: 'builtin',
      name: { en: 'Clarify', zh: '澄清' },
      description: {
        en: 'Ask clarifying questions about task details',
        zh: '提出澄清问题以获取任务细节'
      },
      category: 'input',
      icon: '❓',
      inputs: [
        {
          name: 'task',
          type: 'object',
          required: true,
          description: { en: 'Task object', zh: '任务对象' }
        },
        {
          name: 'questions',
          type: 'array',
          required: false,
          description: { en: 'Pre-generated questions', zh: '预生成的问题列表' }
        }
      ],
      outputs: [
        {
          name: 'clarified_task',
          type: 'object',
          required: true,
          description: { en: 'Clarified task with answers', zh: '包含答案的澄清任务' }
        }
      ],
      configSchema: {
        type: 'object',
        properties: {
          interactive: {
            type: 'boolean',
            default: true,
            description: 'Whether to interactively ask questions'
          }
        }
      },
      defaultConfig: {
        interactive: true
      },
      color: '#10B981',
      accentColor: '#34D399'
    });
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const { inputs, config } = context;
    const task = inputs.task;
    const questions = inputs.questions ?? [];
    const interactive = config.interactive ?? true;

    // 简化实现：直接返回原任务
    const clarifiedTask = {
      ...task,
      clarification: {
        questions,
        answers: interactive ? [] : 'Skipped (non-interactive mode)'
      }
    };

    return {
      success: true,
      outputs: { clarified_task: clarifiedTask },
      metrics: {
        executionTime: Date.now() - new Date().getTime()
      }
    };
  }
}

// 导出所有输入类节点
export const inputNodes = [
  new ReceiveNode(),
  new UnderstandNode(),
  new ClarifyNode()
];
