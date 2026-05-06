/**
 * Spec 节点执行器
 * 制定规范和标准
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 规范类型
 */
type SpecType =
  | 'functional'
  | 'non-functional'
  | 'api'
  | 'data'
  | 'security'
  | 'testing'
  | 'documentation'
  | 'all';

/**
 * 规范定义
 */
interface Specification {
  /** 规范 ID */
  id: string;
  /** 规范类型 */
  type: SpecType;
  /** 规范名称 */
  name: string;
  /** 规范描述 */
  description: string;
  /** 具体要求 */
  requirements: SpecRequirement[];
  /** 验收标准 */
  acceptance_criteria: string[];
}

/**
 * 规范要求
 */
interface SpecRequirement {
  /** 要求 ID */
  id: string;
  /** 要求描述 */
  description: string;
  /** 优先级 */
  priority: 'must' | 'should' | 'could' | 'wont';
  /** 分类 */
  category: string;
}

/**
 * Spec 节点配置
 */
interface SpecConfig {
  /** 规范类型 */
  spec_type?: SpecType;
  /** 严格级别 */
  strictness?: 'relaxed' | 'standard' | 'strict';
  /** 是否包含验收标准 */
  include_acceptance_criteria?: boolean;
  /** 输出格式 */
  output_format?: 'json' | 'markdown' | 'both';
}

/**
 * Spec 节点执行器
 */
export class SpecExecutor extends BaseNodeExecutor {
  private specIdCounter = 0;

  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as SpecConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.refined_task || context.inputs.parsed_task?.data;
      const understanding = context.inputs.understanding;
      const design = context.inputs.design;

      if (!task) {
        throw new Error('Task data is required');
      }

      const specType = config.spec_type || 'all';
      const strictness = config.strictness || 'standard';
      const outputFormat = config.output_format || 'both';

      // 生成规范
      const specifications = await this.generateSpecifications(
        task,
        understanding,
        design,
        specType,
        strictness,
        context
      );

      // 生成规范文档（如果需要 Markdown）
      let spec_document: string | undefined;
      if (outputFormat === 'markdown' || outputFormat === 'both') {
        spec_document = this.generateSpecDocument(specifications);
      }

      // 保存规范到变量
      this.setVariable(context, 'specifications', specifications);

      this.publishEvent(context, 'spec:completed', {
        specCount: specifications.length,
        specType
      });

      this.addExecutionRecord(context, true);

      return this.success({
        specifications,
        spec_document,
        total_specs: specifications.length,
        acceptance_criteria: specifications.flatMap(s => s.acceptance_criteria)
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 生成规范
   */
  private async generateSpecifications(
    task: any,
    understanding: any,
    design: any,
    specType: SpecType,
    strictness: string,
    context: NodeContext
  ): Promise<Specification[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    // 确定要生成的规范类型
    const typesToGenerate = specType === 'all'
      ? ['functional', 'non-functional', 'api', 'data', 'testing'] as SpecType[]
      : [specType];

    const specifications: Specification[] = [];

    for (const type of typesToGenerate) {
      const spec = await this.generateSpecType(
        description,
        understanding,
        design,
        type,
        strictness,
        context
      );
      specifications.push(spec);
    }

    return specifications;
  }

  /**
   * 生成特定类型的规范
   */
  private async generateSpecType(
    description: string,
    understanding: any,
    design: any,
    type: SpecType,
    strictness: string,
    context: NodeContext
  ): Promise<Specification> {
    const llmClient = this.getLLMClient(context);

    const typePrompts = {
      functional: 'Define functional requirements - what the system must do.',
      'non-functional': 'Define non-functional requirements - performance, scalability, reliability, etc.',
      api: 'Define API specifications - endpoints, methods, request/response formats.',
      data: 'Define data specifications - schemas, validation rules, constraints.',
      security: 'Define security specifications - authentication, authorization, encryption.',
      testing: 'Define testing specifications - test coverage, types of tests required.',
      documentation: 'Define documentation requirements - what must be documented.',
      all: 'Define comprehensive specifications covering all aspects.'
    };

    const strictnessGuidance = {
      relaxed: 'Use relaxed/loose requirements (focus on essentials)',
      standard: 'Use standard requirements (balanced approach)',
      strict: 'Use strict requirements (comprehensive and detailed)'
    };

    const prompt = `
Create ${type} specifications for:
${description}

${typePrompts[type]}

Strictness: ${strictnessGuidance[strictness as keyof typeof strictnessGuidance]}

For each requirement, specify priority:
- must: absolutely required
- should: recommended if possible
- could: optional enhancement
- wont: explicitly out of scope

Return JSON:
{
  "name": "Specification Name",
  "description": "Brief description",
  "requirements": [
    {
      "description": "requirement text",
      "priority": "must/should/could/wont",
      "category": "category name"
    }
  ],
  "acceptance_criteria": ["criteria1", "criteria2"]
}
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a specification writing expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return {
        id: `spec_${this.specIdCounter++}`,
        type,
        name: parsed.name || `${type} specification`,
        description: parsed.description || '',
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
        acceptance_criteria: Array.isArray(parsed.acceptance_criteria) ? parsed.acceptance_criteria : []
      };
    } catch {
      // 生成默认规范
      return {
        id: `spec_${this.specIdCounter++}`,
        type,
        name: `${type} specification`,
        description: `Specification for ${type} requirements`,
        requirements: [
          {
            id: `req_${this.specIdCounter}`,
            description: 'Core functionality as described in task',
            priority: 'must',
            category: 'core'
          }
        ],
        acceptance_criteria: [
          'All must-requirements are implemented',
          'System passes all tests'
        ]
      };
    }
  }

  /**
   * 生成规范文档
   */
  private generateSpecDocument(specifications: Specification[]): string {
    const sections: string[] = [];

    sections.push('# Project Specifications\n');
    sections.push('---\n');
    sections.push(`Generated: ${new Date().toISOString()}\n`);

    // 按类型分组
    const grouped = new Map<SpecType, Specification[]>();
    specifications.forEach(spec => {
      if (!grouped.has(spec.type)) {
        grouped.set(spec.type, []);
      }
      grouped.get(spec.type)!.push(spec);
    });

    // 生成各类型规范
    grouped.forEach((specs, type) => {
      sections.push(`## ${type.toUpperCase()} Specifications\n`);

      specs.forEach(spec => {
        sections.push(`### ${spec.name}\n`);
        sections.push(spec.description);
        sections.push('\n');

        if (spec.requirements.length > 0) {
          sections.push('**Requirements:**\n');
          spec.requirements.forEach(req => {
            sections.push(`- [${req.priority.toUpperCase()}] ${req.description}`);
            if (req.category) {
              sections.push(`  *Category: ${req.category}*`);
            }
          });
          sections.push('\n');
        }

        if (spec.acceptance_criteria.length > 0) {
          sections.push('**Acceptance Criteria:**\n');
          spec.acceptance_criteria.forEach(criteria => {
            sections.push(`- ${criteria}`);
          });
          sections.push('\n');
        }
      });
    });

    // 生成摘要
    sections.push('## Summary\n');
    sections.push(`\n- Total Specifications: ${specifications.length}`);
    sections.push(`\n- Total Requirements: ${specifications.reduce((sum, s) => sum + s.requirements.length, 0)}`);

    const mustCount = specifications.reduce((sum, s) =>
      sum + s.requirements.filter(r => r.priority === 'must').length, 0);
    const shouldCount = specifications.reduce((sum, s) =>
      sum + s.requirements.filter(r => r.priority === 'should').length, 0);

    sections.push(`\n- Must: ${mustCount}, Should: ${shouldCount}\n`);

    return sections.join('');
  }
}
