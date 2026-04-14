/**
 * Analyze 节点执行器
 * 分析任务复杂度和技术可行性
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 复杂度评分
 */
interface ComplexityScore {
  /** 组件复杂度 */
  component: number;
  /** 协调复杂度 */
  coordinative: number;
  /** 动态复杂度 */
  dynamic: number;
  /** 总体复杂度 */
  overall: number;
}

/**
 * 风险评估
 */
interface RiskAssessment {
  /** 风险类型 */
  type: 'technical' | 'resource' | 'schedule' | 'dependency' | 'security';
  /** 风险描述 */
  description: string;
  /** 影响程度 */
  impact: 'low' | 'medium' | 'high' | 'critical';
  /** 发生概率 */
  probability: 'low' | 'medium' | 'high';
  /** 缓解措施 */
  mitigation?: string;
}

/**
 * 技术可行性分析
 */
interface FeasibilityAnalysis {
  /** 技术栈可行性 */
  tech_stack_feasible: boolean;
  /** 技术栈评估 */
  tech_stack_assessment: string[];
  /** 潜在问题 */
  potential_issues: string[];
  /** 推荐方案 */
  recommendations: string[];
}

/**
 * Analyze 节点配置
 */
interface AnalyzeConfig {
  /** 分析详细程度 */
  detail_level?: 'summary' | 'standard' | 'detailed';
  /** 是否进行风险评估 */
  assess_risks?: boolean;
  /** 是否检查可行性 */
  check_feasibility?: boolean;
  /** 使用的分析模型 */
  analysis_model?: 'heuristic' | 'llm' | 'hybrid';
}

/**
 * Analyze 节点执行器
 */
export class AnalyzeExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as AnalyzeConfig;
    const detailLevel = config.detail_level || 'standard';
    const analysisModel = config.analysis_model || 'hybrid';

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.refined_task || context.inputs.parsed_task?.data;
      const understanding = context.inputs.understanding;

      if (!task) {
        throw new Error('Task data is required');
      }

      // 执行复杂度分析
      const complexity = await this.analyzeComplexity(task, understanding, context, analysisModel);

      // 执行风险评估（如果配置）
      const risks = config.assess_risks
        ? await this.assessRisks(task, complexity, context)
        : [];

      // 执行可行性分析（如果配置）
      const feasibility = config.check_feasibility
        ? await this.checkFeasibility(task, context)
        : null;

      // 生成分析报告
      const analysis_report = this.generateReport(complexity, risks, feasibility, detailLevel);

      // 保存分析结果到变量
      this.setVariable(context, 'task_complexity', complexity);
      this.setVariable(context, 'task_risks', risks);

      this.publishEvent(context, 'analyze:completed', {
        complexity: complexity.overall,
        riskCount: risks.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        complexity,
        analysis_report,
        risks,
        feasibility,
        recommendations: feasibility?.recommendations || [],
        potential_issues: [...complexity.issues, ...feasibility?.potential_issues || []]
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 分析复杂度
   */
  private async analyzeComplexity(
    task: any,
    understanding: any,
    context: NodeContext,
    model: string
  ): Promise<ComplexityScore & { issues: string[] }> {
    if (model === 'heuristic') {
      return this.heuristicComplexityAnalysis(task, understanding);
    } else if (model === 'llm') {
      return await this.llmComplexityAnalysis(task, understanding, context);
    } else {
      // 混合模式
      const heuristic = this.heuristicComplexityAnalysis(task, understanding);
      const llm = await this.llmComplexityAnalysis(task, understanding, context);

      return {
        component: (heuristic.component + llm.component) / 2,
        coordinative: (heuristic.coordinative + llm.coordinative) / 2,
        dynamic: (heuristic.dynamic + llm.dynamic) / 2,
        overall: (heuristic.overall + llm.overall) / 2,
        issues: [...heuristic.issues, ...llm.issues]
      };
    }
  }

  /**
   * 启发式复杂度分析
   */
  private heuristicComplexityAnalysis(task: any, understanding: any): ComplexityScore & { issues: string[] } {
    const issues: string[] = [];
    const description = typeof task === 'string' ? task : JSON.stringify(task);
    const lowerDesc = description.toLowerCase();

    let component = 0;
    let coordinative = 0;
    let dynamic = 0;

    // 组件复杂度分析
    if (lowerDesc.includes('multiple') || lowerDesc.includes('several')) component += 0.2;
    if (lowerDesc.includes('system') || lowerDesc.includes('platform')) component += 0.3;
    if (lowerDesc.includes('database') || lowerDesc.includes('api')) component += 0.2;
    if (lowerDesc.includes('integration') || lowerDesc.includes('connect')) component += 0.2;
    if (understanding?.requiredCapabilities?.length > 3) component += 0.1;

    // 协调复杂度分析
    if (lowerDesc.includes('team') || lowerDesc.includes('collaborate')) coordinative += 0.3;
    if (lowerDesc.includes('sync') || lowerDesc.includes('coordinate')) coordinative += 0.3;
    if (lowerDesc.includes('cross') || lowerDesc.includes('across')) coordinative += 0.2;
    if (understanding?.estimatedSubtasks > 5) coordinative += 0.2;

    // 动态复杂度分析
    if (lowerDesc.includes('real-time') || lowerDesc.includes('streaming')) dynamic += 0.4;
    if (lowerDesc.includes('scalable') || lowerDesc.includes('scale')) dynamic += 0.2;
    if (lowerDesc.includes('async') || lowerDesc.includes('concurrent')) dynamic += 0.2;
    if (lowerDesc.includes('event') || lowerDesc.includes('trigger')) dynamic += 0.2;

    // 归一化
    component = Math.min(1, component);
    coordinative = Math.min(1, coordinative);
    dynamic = Math.min(1, dynamic);

    const overall = (component + coordinative + dynamic) / 3;

    // 生成问题
    if (component > 0.7) issues.push('High component complexity - consider modular architecture');
    if (coordinative > 0.7) issues.push('High coordinative complexity - plan team coordination carefully');
    if (dynamic > 0.7) issues.push('High dynamic complexity - design for scalability');

    return { component, coordinative, dynamic, overall, issues };
  }

  /**
   * LLM 复杂度分析
   */
  private async llmComplexityAnalysis(
    task: any,
    understanding: any,
    context: NodeContext
  ): Promise<ComplexityScore & { issues: string[] }> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const prompt = `
Analyze the complexity of this task:
${description}

Additional context:
${understanding ? JSON.stringify(understanding, null, 2) : 'None'}

Rate the following dimensions (0-1 scale):
1. Component complexity: number of components, files, modules
2. Coordinative complexity: coordination needed, dependencies
3. Dynamic complexity: runtime complexity, scalability needs

Also identify potential issues and challenges.

Return JSON:
{
  "component": 0.0-1.0,
  "coordinative": 0.0-1.0,
  "dynamic": 0.0-1.0,
  "issues": ["issue1", "issue2"]
}
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a software complexity analysis expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      const component = Math.max(0, Math.min(1, parsed.component || 0.5));
      const coordinative = Math.max(0, Math.min(1, parsed.coordinative || 0.5));
      const dynamic = Math.max(0, Math.min(1, parsed.dynamic || 0.5));

      return {
        component,
        coordinative,
        dynamic,
        overall: (component + coordinative + dynamic) / 3,
        issues: Array.isArray(parsed.issues) ? parsed.issues : []
      };
    } catch {
      // 降级到启发式分析
      return this.heuristicComplexityAnalysis(task, understanding);
    }
  }

  /**
   * 评估风险
   */
  private async assessRisks(
    task: any,
    complexity: ComplexityScore,
    context: NodeContext
  ): Promise<RiskAssessment[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const prompt = `
Identify risks for this task:
${description}

Complexity: ${JSON.stringify(complexity)}

Categorize risks as:
- Technical: implementation challenges
- Resource: missing skills/tools
- Schedule: time constraints
- Dependency: external dependencies
- Security: security concerns

For each risk, provide:
- type
- description
- impact: low/medium/high/critical
- probability: low/medium/high
- mitigation (if applicable)

Return JSON array.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a risk assessment expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // 返回基本风险
      return [];
    }
  }

  /**
   * 检查可行性
   */
  private async checkFeasibility(task: any, context: NodeContext): Promise<FeasibilityAnalysis> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);

    const prompt = `
Assess technical feasibility of:
${description}

Consider:
1. Is the tech stack suitable?
2. Are there any technical blockers?
3. What are the main challenges?
4. What would you recommend?

Return JSON:
{
  "tech_stack_feasible": true/false,
  "tech_stack_assessment": ["point1", "point2"],
  "potential_issues": ["issue1", "issue2"],
  "recommendations": ["rec1", "rec2"]
}
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a technical feasibility expert.' },
        { role: 'user', content: prompt }
      ]);

      return JSON.parse(response);
    } catch {
      return {
        tech_stack_feasible: true,
        tech_stack_assessment: [],
        potential_issues: [],
        recommendations: []
      };
    }
  }

  /**
   * 生成分析报告
   */
  private generateReport(
    complexity: ComplexityScore & { issues: string[] },
    risks: RiskAssessment[],
    feasibility: FeasibilityAnalysis | null,
    detailLevel: string
  ): string {
    const sections = [];

    sections.push('=== Task Complexity Analysis ===\n');
    sections.push(`Component Complexity: ${(complexity.component * 100).toFixed(0)}%`);
    sections.push(`Coordinative Complexity: ${(complexity.coordinative * 100).toFixed(0)}%`);
    sections.push(`Dynamic Complexity: ${(complexity.dynamic * 100).toFixed(0)}%`);
    sections.push(`Overall: ${(complexity.overall * 100).toFixed(0)}%\n`);

    if (complexity.issues.length > 0) {
      sections.push('Identified Issues:');
      complexity.issues.forEach(issue => sections.push(`- ${issue}`));
      sections.push('');
    }

    if (risks.length > 0) {
      sections.push('=== Risk Assessment ===');
      risks.forEach(risk => {
        sections.push(`\n[${risk.type.toUpperCase()}] ${risk.description}`);
        sections.push(`  Impact: ${risk.impact}, Probability: ${risk.probability}`);
        if (risk.mitigation) {
          sections.push(`  Mitigation: ${risk.mitigation}`);
        }
      });
      sections.push('');
    }

    if (feasibility) {
      sections.push('=== Technical Feasibility ===');
      sections.push(`Tech Stack Feasible: ${feasibility.tech_stack_feasible ? 'Yes' : 'No'}`);
      if (feasibility.tech_stack_assessment.length > 0) {
        sections.push('\nAssessment:');
        feasibility.tech_stack_assessment.forEach(point => sections.push(`- ${point}`));
      }
      if (feasibility.recommendations.length > 0) {
        sections.push('\nRecommendations:');
        feasibility.recommendations.forEach(rec => sections.push(`- ${rec}`));
      }
    }

    return sections.join('\n');
  }
}
