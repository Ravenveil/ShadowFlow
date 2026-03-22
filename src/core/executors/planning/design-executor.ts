/**
 * Design 节点执行器
 * 设计技术方案和架构
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, TechnicalDesign } from '../../types/node.types';

/**
 * 架构模式
 */
type ArchitecturePattern =
  | 'monolithic'
  | 'microservices'
  | 'serverless'
  | 'event-driven'
  | 'layered'
  | 'hexagonal'
  | 'clean-architecture';

/**
 * Design 节点配置
 */
interface DesignConfig {
  /** 架构模式（可选，不指定则自动推荐） */
  architecture_pattern?: ArchitecturePattern;
  /** 是否生成数据模型 */
  generate_data_models?: boolean;
  /** 是否生成接口定义 */
  generate_interfaces?: boolean;
  /** 是否包含实现步骤 */
  include_implementation_steps?: boolean;
  /** 设计详细程度 */
  detail_level?: 'high-level' | 'mid-level' | 'detailed';
  /** 输出格式 */
  output_format?: 'json' | 'markdown' | 'both';
}

/**
 * Design 节点执行器
 */
export class DesignExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as DesignConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.refined_task || context.inputs.parsed_task?.data;
      const understanding = context.inputs.understanding;
      const complexity = context.inputs.complexity;

      if (!task) {
        throw new Error('Task data is required');
      }

      const detailLevel = config.detail_level || 'mid-level';
      const outputFormat = config.output_format || 'both';

      // 设计架构
      const architecture = await this.designArchitecture(
        task,
        understanding,
        complexity,
        config.architecture_pattern,
        context
      );

      // 生成数据模型
      const dataModels = config.generate_data_models !== false
        ? await this.generateDataModels(task, architecture, context)
        : [];

      // 生成接口定义
      const interfaces = config.generate_interfaces !== false
        ? await this.generateInterfaces(task, architecture, context)
        : [];

      // 生成技术栈建议
      const techStack = await this.suggestTechStack(task, understanding, context);

      // 生成实现步骤
      const implementationSteps = config.include_implementation_steps !== false
        ? await this.generateImplementationSteps(task, architecture, detailLevel, context)
        : [];

      // 构建设计方案
      const design: TechnicalDesign = {
        architecture,
        dataModels,
        interfaces,
        techStack,
        implementationSteps
      };

      // 生成设计文档（如果需要 Markdown）
      let design_document: string | undefined;
      if (outputFormat === 'markdown' || outputFormat === 'both') {
        design_document = this.generateDesignDocument(design);
      }

      // 保存设计到变量
      this.setVariable(context, 'technical_design', design);
      this.setVariable(context, 'architecture_pattern', architecture);

      this.publishEvent(context, 'design:completed', {
        pattern: architecture,
        modelsCount: dataModels.length,
        interfacesCount: interfaces.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        design,
        design_document,
        architecture_pattern: architecture,
        tech_stack: techStack,
        data_models: dataModels,
        interfaces,
        implementation_steps: implementationSteps
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 设计架构
   */
  private async designArchitecture(
    task: any,
    understanding: any,
    complexity: any,
    pattern: ArchitecturePattern | undefined,
    context: NodeContext
  ): Promise<string> {
    if (pattern) {
      return this.expandArchitecturePattern(pattern);
    }

    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);
    const complexityScore = complexity?.overall || understanding?.complexity || 0.5;

    const prompt = `
Design a suitable architecture for this task:
${description}

Context:
- Complexity: ${(complexityScore * 100).toFixed(0)}%
- Required capabilities: ${understanding?.requiredCapabilities?.join(', ') || 'none'}

Consider these patterns:
- Monolithic: simple, cohesive, suitable for small-medium apps
- Microservices: scalable, independent deploy, suitable for complex apps
- Serverless: event-driven, pay-per-use, suitable for bursty workloads
- Event-driven: async, decoupled, suitable for real-time systems
- Layered: organized, maintainable, suitable for most apps
- Hexagonal/Clean: domain-driven, testable, suitable for complex domains

Provide a detailed architecture description (200-300 words).
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are a software architecture expert.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return 'Three-layer architecture: Presentation layer handles user interactions, Business layer contains core logic, Data layer manages persistence.';
    }
  }

  /**
   * 扩展架构模式
   */
  private expandArchitecturePattern(pattern: ArchitecturePattern): string {
    const patterns: Record<ArchitecturePattern, string> = {
      monolithic: 'Monolithic architecture: Single deployable unit with all components tightly coupled. Simple to develop and deploy initially, suitable for small to medium applications.',
      microservices: 'Microservices architecture: Application divided into small, independent services. Each service owns its data and communicates via APIs. Highly scalable and maintainable.',
      serverless: 'Serverless architecture: Function-as-a-Service (FaaS) approach. Code runs in stateless compute containers that are event-triggered and ephemeral. Cost-effective with automatic scaling.',
      'event-driven': 'Event-driven architecture: Components communicate through events. Decoupled, scalable, and responsive. Suitable for real-time processing and complex workflows.',
      layered: 'Layered architecture: Application organized into layers (Presentation, Business, Data). Each layer has specific responsibilities. Common and well-understood pattern.',
      hexagonal: 'Hexagonal architecture: Domain-centered design with ports and adapters. Business logic independent of external concerns. Highly testable and maintainable.',
      'clean-architecture': 'Clean architecture: Concentric layers with dependency rule (dependencies point inward). Separates business logic from infrastructure. Excellent for complex business domains.'
    };

    return patterns[pattern] || pattern;
  }

  /**
   * 生成数据模型
   */
  private async generateDataModels(
    task: any,
    architecture: string,
    context: NodeContext
  ): Promise<any[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const prompt = `
Identify key data models for this task:
${description}

Architecture: ${architecture}

For each model, provide:
- name: model name
- fields: {fieldName: type} object
- relationships: optional array of related models

Return JSON array:
[
  {
    "name": "User",
    "fields": {"id": "string", "name": "string", "email": "string"},
    "relationships": ["Post", "Comment"]
  }
]
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a data modeling expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /**
   * 生成接口定义
   */
  private async generateInterfaces(
    task: any,
    architecture: string,
    context: NodeContext
  ): Promise<any[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const prompt = `
Define API interfaces for this task:
${description}

Architecture: ${architecture}

For each interface, provide:
- name: endpoint name
- method: GET/POST/PUT/DELETE
- path: URL path
- parameters: {paramName: type}
- response: {fieldName: type}

Return JSON array.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are an API design expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /**
   * 建议技术栈
   */
  private async suggestTechStack(
    task: any,
    understanding: any,
    context: NodeContext
  ): Promise<any> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);
    const capabilities = understanding?.requiredCapabilities || [];

    const prompt = `
Suggest a tech stack for this task:
${description}

Required capabilities: ${capabilities.join(', ')}

Provide:
- framework: recommended framework
- language: primary language
- database: recommended database
- libraries: list of useful libraries

Return JSON.
`;

    try {
      return JSON.parse(await llmClient.chat([
        { role: 'system', content: 'You are a technology consultant.' },
        { role: 'user', content: prompt }
      ]));
    } catch {
      return {
        framework: 'Custom',
        language: 'TypeScript',
        database: 'PostgreSQL',
        libraries: []
      };
    }
  }

  /**
   * 生成实现步骤
   */
  private async generateImplementationSteps(
    task: any,
    architecture: string,
    detailLevel: string,
    context: NodeContext
  ): Promise<string[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const stepCount = detailLevel === 'high-level' ? 5 : detailLevel === 'detailed' ? 10 : 7;

    const prompt = `
Create implementation steps for:
${description}

Architecture: ${architecture}

Create exactly ${stepCount} numbered steps covering the full implementation lifecycle.
Each step should be actionable and clear.

Return as JSON array of strings.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are an implementation planning expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return [
        'Set up project structure and dependencies',
        'Implement data models and schemas',
        'Create API interfaces and routes',
        'Implement core business logic',
        'Add data validation and error handling',
        'Implement authentication and authorization',
        'Write unit tests',
        'Perform integration testing',
        'Deploy and monitor'
      ].slice(0, stepCount);
    }
  }

  /**
   * 生成设计文档
   */
  private generateDesignDocument(design: TechnicalDesign): string {
    const sections: string[] = [];

    sections.push('# Technical Design Document\n');
    sections.push('---\n');

    // Architecture
    sections.push('## Architecture\n');
    sections.push(design.architecture);
    sections.push('\n');

    // Data Models
    if (design.dataModels.length > 0) {
      sections.push('## Data Models\n');
      design.dataModels.forEach(model => {
        sections.push(`### ${model.name}\n`);
        sections.push('**Fields:**\n');
        Object.entries(model.fields).forEach(([name, type]) => {
          sections.push(`- \`${name}\`: ${type}`);
        });
        if (model.relationships?.length) {
          sections.push('\n**Relationships:**\n');
          model.relationships.forEach(rel => sections.push(`- ${rel}`));
        }
        sections.push('\n');
      });
    }

    // Interfaces
    if (design.interfaces.length > 0) {
      sections.push('## API Interfaces\n');
      design.interfaces.forEach(iface => {
        sections.push(`### ${iface.name}\n`);
        sections.push(`**Method:** \`${iface.method}\`\n`);
        sections.push(`**Path:** \`${iface.path}\`\n`);
        if (Object.keys(iface.parameters).length) {
          sections.push('**Parameters:**\n');
          Object.entries(iface.parameters).forEach(([name, type]) => {
            sections.push(`- \`${name}\`: ${type}`);
          });
        }
        if (Object.keys(iface.response).length) {
          sections.push('\n**Response:**\n');
          Object.entries(iface.response).forEach(([name, type]) => {
            sections.push(`- \`${name}\`: ${type}`);
          });
        }
        sections.push('\n');
      });
    }

    // Tech Stack
    sections.push('## Technology Stack\n');
    if (design.techStack.framework) {
      sections.push(`- **Framework:** ${design.techStack.framework}\n`);
    }
    if (design.techStack.language) {
      sections.push(`- **Language:** ${design.techStack.language}\n`);
    }
    if (design.techStack.database) {
      sections.push(`- **Database:** ${design.techStack.database}\n`);
    }
    if (design.techStack.libraries?.length) {
      sections.push('\n**Libraries:**\n');
      design.techStack.libraries.forEach(lib => sections.push(`- ${lib}\n`));
    }
    sections.push('\n');

    // Implementation Steps
    if (design.implementationSteps.length > 0) {
      sections.push('## Implementation Steps\n');
      design.implementationSteps.forEach((step, index) => {
        sections.push(`${index + 1}. ${step}\n`);
      });
    }

    return sections.join('');
  }
}
