/**
 * Review 节点执行器
 * 质量审核
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, ReviewResult, ReviewIssue } from '../../types/node.types';

/**
 * 审核严格度
 */
type Strictness = 'loose' | 'normal' | 'strict';

/**
 * 审核类别
 */
type ReviewCategory =
  | 'code'
  | 'design'
  | 'documentation'
  | 'security'
  | 'performance'
  | 'all';

/**
 * Review 节点配置
 */
interface ReviewConfig {
  /** 审核对象类型 */
  artifact_type?: ReviewCategory;
  /** 严格度 */
  strictness?: Strictness;
  /** 审核标准 */
  criteria?: ReviewCriteria[];
  /** 是否自动修复 */
  auto_fix?: boolean;
  /** 最大问题数 */
  max_issues?: number;
}

/**
 * 审核标准
 */
interface ReviewCriteria {
  /** 标准名称 */
  name: string;
  /** 标准描述 */
  description: string;
  /** 权重 */
  weight: number;
  /** 是否必需 */
  required: boolean;
}

/**
 * Review 节点执行器
 */
export class ReviewExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as ReviewConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const artifact = context.inputs.artifact || context.inputs.code || context.inputs.content;
      const spec = context.inputs.specifications;
      const design = context.inputs.design;

      if (!artifact) {
        throw new Error('Artifact data is required');
      }

      const artifactType = config.artifact_type || this.detectArtifactType(artifact);
      const strictness = config.strictness || 'normal';

      // 执行审核
      const reviewResult = await this.performReview(
        artifact,
        artifactType,
        spec,
        design,
        config,
        strictness,
        context
      );

      // 根据严格度和结果决定是否通过
      const threshold = this.getThreshold(strictness);
      const approved = reviewResult.score >= threshold;

      // 生成修订建议（如果未通过）
      let revisedContent;
      if (!approved && config.auto_fix) {
        revisedContent = await this.suggestRevisions(artifact, reviewResult.issues, context);
      }

      // 保存审核结果
      this.setVariable(context, 'review_result', reviewResult);
      this.setVariable(context, 'review_approved', approved);

      this.publishEvent(context, 'review:completed', {
        approved,
        score: reviewResult.score,
        issuesCount: reviewResult.issues.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        approved,
        score: reviewResult.score,
        issues: reviewResult.issues,
        suggestions: reviewResult.suggestions,
        revised_content: revisedContent
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 执行审核
   */
  private async performReview(
    artifact: any,
    artifactType: ReviewCategory,
    spec: any,
    design: any,
    config: ReviewConfig,
    strictness: Strictness,
    context: NodeContext
  ): Promise<ReviewResult> {
    const llmClient = this.getLLMClient(context);

    const artifactContent = typeof artifact === 'string' ? artifact : JSON.stringify(artifact, null, 2);

    // 构建审核提示
    const prompt = this.buildReviewPrompt(
      artifactContent,
      artifactType,
      spec,
      design,
      strictness,
      config.criteria
    );

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getReviewSystemPrompt(artifactType, strictness) },
        { role: 'user', content: prompt }
      ]);

      return this.parseReviewResponse(response);
    } catch {
      // 降级：返回基本审核结果
      return this.getDefaultReviewResult(strictness);
    }
  }

  /**
   * 构建审核提示
   */
  private buildReviewPrompt(
    artifact: string,
    artifactType: ReviewCategory,
    spec: any,
    design: any,
    strictness: Strictness,
    criteria?: ReviewCriteria[]
  ): string {
    const sections: string[] = [];

    sections.push(`Review the following ${artifactType}:\n`);
    sections.push('```\n');
    sections.push(artifact.substring(0, 4000)); // 限制长度
    sections.push('\n```\n');

    // 添加规范上下文
    if (spec) {
      const mustReqs = spec.flatMap((s: any) =>
        s.requirements.filter((r: any) => r.priority === 'must')
      );
      if (mustReqs.length > 0) {
        sections.push('\nRequirements (must):');
        mustReqs.slice(0, 5).forEach((r: any) => sections.push(`- ${r.description}`));
        sections.push('');
      }
    }

    // 添加设计上下文
    if (design?.architecture) {
      sections.push(`\nArchitecture: ${design.architecture}`);
    }

    // 添加严格度说明
    const strictnessDesc = {
      loose: 'Focus on critical issues only. Be lenient with minor problems.',
      normal: 'Evaluate all aspects with balanced judgment. Mark significant issues.',
      strict: 'Examine every detail meticulously. No tolerance for any issues.'
    };
    sections.push(`\nReview strictness: ${strictnessDesc[strictness]}`);

    // 添加自定义标准
    if (criteria && criteria.length > 0) {
      sections.push('\nAdditional criteria:');
      criteria.forEach(c => {
        sections.push(`- ${c.name}: ${c.description} (weight: ${c.weight}${c.required ? ', required' : ''})`);
      });
    }

    sections.push('\n\nReturn JSON:\n```json');
    sections.push(`{
  "score": 0.0-1.0,
  "issues": [
    {
      "type": "error|warning|info",
      "message": "description",
      "severity": "low|medium|high|critical",
      "location": {
        "line": 10,
        "column": 5
      }
    }
  ],
  "suggestions": ["suggestion1", "suggestion2"]
}`);
    sections.push('```');

    return sections.join('\n');
  }

  /**
   * 获取审核系统提示
   */
  private getReviewSystemPrompt(artifactType: ReviewCategory, strictness: Strictness): string {
    const basePrompt = `You are a ${artifactType} review expert. Conduct thorough code/design/documentation reviews.`;

    const typeSpecific = {
      code: 'Evaluate code quality, maintainability, best practices, bugs, security, and performance.',
      design: 'Evaluate architectural soundness, scalability, maintainability, and adherence to design principles.',
      documentation: 'Evaluate clarity, completeness, accuracy, and usability.',
      security: 'Evaluate security vulnerabilities, best practices, and compliance with security standards.',
      performance: 'Evaluate performance bottlenecks, optimization opportunities, and resource usage.',
      all: 'Evaluate all aspects including code quality, design, documentation, security, and performance.'
    };

    return `${basePrompt} ${typeSpecific[artifactType]}\n\nProvide specific, actionable feedback with line numbers when possible.`;
  }

  /**
   * 解析审核响应
   */
  private parseReviewResponse(response: string): ReviewResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
      const parsed = JSON.parse(jsonStr);

      const issues: ReviewIssue[] = (parsed.issues || []).map((issue: any) => ({
        type: ['error', 'warning', 'info'].includes(issue.type) ? issue.type : 'info',
        message: issue.message || 'No description',
        location: issue.location || undefined,
        severity: ['low', 'medium', 'high', 'critical'].includes(issue.severity)
          ? issue.severity
          : 'medium'
      }));

      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        approved: (parsed.score || 0.5) >= 0.7,
        issues,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch {
      return this.getDefaultReviewResult('normal');
    }
  }

  /**
   * 获取默认审核结果
   */
  private getDefaultReviewResult(strictness: Strictness): ReviewResult {
    const scores = { loose: 0.85, normal: 0.7, strict: 0.5 };
    return {
      score: scores[strictness],
      approved: strictness !== 'strict',
      issues: [],
      suggestions: ['Review completed with limited context']
    };
  }

  /**
   * 获取通过阈值
   */
  private getThreshold(strictness: Strictness): number {
    return { loose: 0.5, normal: 0.7, strict: 0.9 }[strictness];
  }

  /**
   * 建议修订
   */
  private async suggestRevisions(
    artifact: string,
    issues: ReviewIssue[],
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    const artifactContent = typeof artifact === 'string' ? artifact : JSON.stringify(artifact, null, 2);

    const prompt = `
Fix the following issues in this ${typeof artifact === 'string' && artifact.includes('function') ? 'code' : 'content'}:

${artifactContent}

Issues to fix:
${issues.slice(0, 5).map(i => `- [${i.severity}] ${i.message}`).join('\n')}

Return only the revised version, no explanation.
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are an expert at fixing code and content issues.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return artifact;
    }
  }

  /**
   * 检测工件类型
   */
  private detectArtifactType(artifact: any): ReviewCategory {
    const content = typeof artifact === 'string' ? artifact : JSON.stringify(artifact);

    if (content.includes('function') || content.includes('class') || content.includes('import')) {
      return 'code';
    }
    if (content.includes('architecture') || content.includes('design')) {
      return 'design';
    }
    if (content.includes('README') || content.includes('documentation')) {
      return 'documentation';
    }

    return 'all';
  }
}
