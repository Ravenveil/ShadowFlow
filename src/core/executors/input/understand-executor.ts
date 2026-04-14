/**
 * Understand 节点执行器
 * 理解任务需求，分析任务复杂度和所需能力
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, TaskUnderstanding } from '../../types/node.types';

/**
 * 理解深度
 */
type UnderstandingDepth = 'shallow' | 'medium' | 'deep';

/**
 * Understand 节点配置
 */
interface UnderstandConfig {
  /** 理解深度 */
  depth?: UnderstandingDepth;
  /** 是否生成澄清问题 */
  ask_clarifying_questions?: boolean;
  /** 最大澄清问题数 */
  max_questions?: number;
  /** 是否识别依赖 */
  identify_dependencies?: boolean;
}

/**
 * 任务分析结果
 */
interface TaskAnalysis {
  /** 任务描述 */
  description: string;
  /** 目标 */
  goals: string[];
  /** 约束条件 */
  constraints: string[];
  /** 假设条件 */
  assumptions: string[];
  /** 模糊点 */
  ambiguities: string[];
  /** 所需能力 */
  required_capabilities: string[];
  /** 技术栈提示 */
  tech_hints: string[];
  /** 复杂度评分 */
  complexity_score: number;
  /** 预估子任务数 */
  estimated_subtasks: number;
  /** 预估时长 */
  estimated_duration: number;
}

/**
 * Understand 节点执行器
 */
export class UnderstandExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as UnderstandConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);
      this.validateConfig(context.config);

      const task = context.inputs.task || context.inputs.parsed_task?.data;

      if (!task) {
        throw new Error('Task data is required');
      }

      const depth = config.depth || 'medium';

      // 分析任务
      const analysis = await this.analyzeTask(task, depth, context);

      // 构建理解结果
      const understanding: TaskUnderstanding = {
        description: this.extractDescription(task),
        complexity: analysis.complexity_score,
        requiredCapabilities: analysis.required_capabilities,
        ambiguities: analysis.ambiguities,
        clarifyingQuestions: config.ask_clarifying_questions && analysis.ambiguities.length > 0
          ? this.generateClarifyingQuestions(analysis.ambiguities, config.max_questions || 5)
          : undefined,
        estimatedSubtasks: analysis.estimated_subtasks,
        estimatedDuration: analysis.estimated_duration
      };

      // 识别依赖（如果配置）
      if (config.identify_dependencies) {
        await this.identifyDependencies(task, context);
      }

      this.publishEvent(context, 'understand:completed', {
        complexity: understanding.complexity,
        capabilities: understanding.requiredCapabilities.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        understanding,
        complexity: understanding.complexity,
        required_capabilities: understanding.requiredCapabilities,
        goals: analysis.goals,
        constraints: analysis.constraints,
        tech_hints: analysis.tech_hints
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 提取任务描述
   */
  private extractDescription(task: any): string {
    if (typeof task === 'string') {
      return task;
    }
    if (task.description) {
      return task.description;
    }
    if (task.task) {
      return task.task;
    }
    return JSON.stringify(task);
  }

  /**
   * 分析任务
   */
  private async analyzeTask(task: any, depth: UnderstandingDepth, context: NodeContext): Promise<TaskAnalysis> {
    const llmClient = this.getLLMClient(context);

    const description = this.extractDescription(task);

    // 构建分析提示
    const prompt = this.buildAnalysisPrompt(description, depth);

    // 调用 LLM
    const response = await llmClient.chat([
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: prompt }
    ]);

    // 解析响应
    return this.parseAnalysis(response);
  }

  /**
   * 构建分析提示
   */
  private buildAnalysisPrompt(description: string, depth: UnderstandingDepth): string {
    const depthInstructions = {
      shallow: 'Provide a high-level summary.',
      medium: 'Provide a moderate level of detail with key points.',
      deep: 'Provide a comprehensive analysis with thorough examination.'
    };

    return `
Analyze the following task:
${description}

${depthInstructions[depth]}

Respond with a JSON object containing:
{
  "description": "Brief task summary",
  "goals": ["list of goals"],
  "constraints": ["list of constraints"],
  "assumptions": ["list of assumptions"],
  "ambiguities": ["list of ambiguous points"],
  "required_capabilities": ["list of required capabilities"],
  "tech_hints": ["suggested technologies"],
  "complexity_score": 0.0-1.0,
  "estimated_subtasks": number,
  "estimated_duration": number (minutes)
}
`;
  }

  /**
   * 获取系统提示
   */
  private getSystemPrompt(): string {
    return `You are an expert task analyst. Analyze tasks to understand:
1. What needs to be done (goals)
2. Constraints and limitations
3. Assumptions being made
4. Ambiguous or unclear points
5. Required capabilities and skills
6. Technical considerations
7. Overall complexity (0-1 scale)
8. Estimated number of subtasks
9. Estimated duration in minutes

Be thorough and realistic in your estimates.`;
  }

  /**
   * 解析分析结果
   */
  private parseAnalysis(response: string): TaskAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
      const parsed = JSON.parse(jsonStr);

      return {
        description: parsed.description || '',
        goals: parsed.goals || [],
        constraints: parsed.constraints || [],
        assumptions: parsed.assumptions || [],
        ambiguities: parsed.ambiguities || [],
        required_capabilities: parsed.required_capabilities || [],
        tech_hints: parsed.tech_hints || [],
        complexity_score: Math.max(0, Math.min(1, parsed.complexity_score || 0.5)),
        estimated_subtasks: Math.max(1, Math.round(parsed.estimated_subtasks || 3)),
        estimated_duration: Math.max(1, Math.round(parsed.estimated_duration || 30))
      };
    } catch (e) {
      // 解析失败时返回默认值
      return {
        description: response,
        goals: [],
        constraints: [],
        assumptions: [],
        ambiguities: ['Parsing failed'],
        required_capabilities: [],
        tech_hints: [],
        complexity_score: 0.5,
        estimated_subtasks: 3,
        estimated_duration: 30
      };
    }
  }

  /**
   * 生成澄清问题
   */
  private generateClarifyingQuestions(ambiguities: string[], maxQuestions: number): string[] {
    const questions: string[] = [];

    for (const ambiguity of ambiguities.slice(0, maxQuestions)) {
      questions.push(`Could you clarify: ${ambiguity}?`);
      questions.push(`What are your specific expectations for: ${ambiguity}?`);
    }

    return questions.slice(0, maxQuestions);
  }

  /**
   * 识别依赖
   */
  private async identifyDependencies(task: any, context: NodeContext): Promise<void> {
    const llmClient = this.getLLMClient(context);

    const description = this.extractDescription(task);

    const prompt = `
Identify dependencies for the following task:
${description}

List:
1. External dependencies (APIs, libraries, services)
2. Internal dependencies (other code, databases)
3. Team dependencies (who needs to be involved)
4. Prerequisites (what must be done first)

Respond with JSON.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a dependency analysis expert.' },
        { role: 'user', content: prompt }
      ]);

      const dependencies = JSON.parse(response);
      this.setVariable(context, 'task_dependencies', dependencies);

      this.publishEvent(context, 'dependencies:identified', dependencies);
    } catch {
      // 依赖识别失败不影响主流程
    }
  }
}
