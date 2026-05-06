/**
 * 工作流生成器 (WorkflowGenerator)
 *
 * 根据任务特征生成工作流，包括节点选择、连接逻辑、配置参数填充和置信度计算
 */

import {
  TaskFeatures,
  GeneratedWorkflow,
  WorkflowGeneratorConfig,
  NodeDefinition,
  EdgeDefinition,
  ComplexityScore
} from '../types/analyzer.js';
import { RuleEngine, createRuleEngine } from './rule-engine.js';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<WorkflowGeneratorConfig> = {
  rule_engine: {
    use_default_rules: true,
    conflict_resolution: 'highest_priority',
    max_recursion_depth: 10
  },
  default_layout: {
    start_x: 250,
    start_y: 50,
    node_spacing_x: 0,
    node_spacing_y: 100
  },
  auto_layout: true,
  confidence_threshold: 0.5,
  validate: true
};

/**
 * 节点模板定义
 */
interface NodeTemplate {
  type: string;
  defaultConfig?: Record<string, any>;
  requiredInputs?: string[];
  outputs?: string[];
}

/**
 * 节点模板注册表
 */
const NODE_TEMPLATES: Record<string, NodeTemplate> = {
  receive: { type: 'receive', outputs: ['task'] },
  understand: { type: 'understand', requiredInputs: ['task'], outputs: ['understanding'] },
  analyze: { type: 'analyze', requiredInputs: ['understanding'], outputs: ['analysis'] },
  design: { type: 'design', requiredInputs: ['analysis'], outputs: ['design'] },
  decompose: { type: 'decompose', requiredInputs: ['design'], outputs: ['subtasks'] },
  research: { type: 'research', requiredInputs: ['understanding'], outputs: ['research_result'] },
  code: { type: 'code', requiredInputs: ['task', 'design'], outputs: ['code'] },
  test: { type: 'test', requiredInputs: ['code'], outputs: ['test'] },
  validate: { type: 'validate', requiredInputs: ['code', 'test'], outputs: ['validation'] },
  generate: { type: 'generate', requiredInputs: ['input'], outputs: ['output'] },
  format: { type: 'format', requiredInputs: ['output'], outputs: ['formatted'] },
  review: { type: 'review', requiredInputs: ['artifact'], outputs: ['review_result'] },
  security: { type: 'security', requiredInputs: ['code'], outputs: ['security_report'] },
  loop: { type: 'loop', requiredInputs: ['validation'], outputs: ['loop_result'] },
  parallel: { type: 'parallel', requiredInputs: ['tasks'], outputs: ['parallel_results'] },
  aggregate: { type: 'aggregate', requiredInputs: ['parallel_results'], outputs: ['aggregated'] },
  branch: { type: 'branch', requiredInputs: ['condition'], outputs: ['true', 'false'] },
  report: { type: 'report', requiredInputs: ['result'], outputs: ['report'] }
};

/**
 * 工作流模式定义
 */
interface WorkflowPattern {
  name: string;
  description: string;
  nodeSequence: string[];
  complexityThreshold?: number;
  typeFilter?: TaskFeatures['type'][];
}

/**
 * 预定义的工作流模式
 */
const WORKFLOW_PATTERNS: WorkflowPattern[] = [
  {
    name: 'simple_code',
    description: '简单的编码工作流',
    nodeSequence: ['receive', 'understand', 'code', 'report'],
    complexityThreshold: 0.3
  },
  {
    name: 'standard_code',
    description: '标准编码工作流',
    nodeSequence: ['receive', 'understand', 'analyze', 'code', 'report'],
    complexityThreshold: 0.7
  },
  {
    name: 'complex_code',
    description: '复杂编码工作流',
    nodeSequence: ['receive', 'understand', 'analyze', 'design', 'decompose', 'code', 'report']
  },
  {
    name: 'tdd_workflow',
    description: '测试驱动开发工作流',
    nodeSequence: ['receive', 'understand', 'test', 'code', 'validate', 'report'],
    typeFilter: ['coding']
  },
  {
    name: 'documentation',
    description: '文档生成工作流',
    nodeSequence: ['receive', 'understand', 'research', 'generate', 'format', 'report'],
    typeFilter: ['documentation']
  },
  {
    name: 'analysis',
    description: '分析工作流',
    nodeSequence: ['receive', 'understand', 'research', 'generate', 'report'],
    typeFilter: ['analysis', 'review']
  }
];

/**
 * 工作流生成器
 */
export class WorkflowGenerator {
  private config: Required<WorkflowGeneratorConfig>;
  private ruleEngine: RuleEngine;
  private nodeCounter = 0;

  constructor(config: WorkflowGeneratorConfig = {}) {
    this.config = {
      rule_engine: {
        ...DEFAULT_CONFIG.rule_engine,
        ...config.rule_engine
      },
      default_layout: {
        ...DEFAULT_CONFIG.default_layout,
        ...config.default_layout
      },
      auto_layout: config.auto_layout ?? DEFAULT_CONFIG.auto_layout,
      confidence_threshold: config.confidence_threshold ?? DEFAULT_CONFIG.confidence_threshold,
      validate: config.validate ?? DEFAULT_CONFIG.validate
    };

    this.ruleEngine = new RuleEngine(this.config.rule_engine);
  }

  /**
   * 根据任务特征生成工作流
   */
  async generate(features: TaskFeatures): Promise<GeneratedWorkflow> {
    this.nodeCounter = 0;

    // 1. 基于模式选择基础工作流
    const baseWorkflow = this.selectBasePattern(features);

    // 2. 使用规则引擎增强工作流
    const { workflow } = await this.ruleEngine.execute(features, baseWorkflow);

    // 3. 计算置信度
    const confidence = this.calculateConfidence(features, workflow);

    // 4. 更新元数据
    workflow.metadata = {
      generated_at: new Date(),
      based_on_features: features,
      applied_rules: workflow.metadata.applied_rules,
      confidence,
      version: '1.0.0'
    };

    // 5. 验证工作流（如果启用）
    if (this.config.validate) {
      this.validateWorkflow(workflow);
    }

    return workflow;
  }

  /**
   * 选择基础工作流模式
   */
  private selectBasePattern(features: TaskFeatures): GeneratedWorkflow {
    const nodes: NodeDefinition[] = [];
    const edges: EdgeDefinition[] = [];
    const layout = this.config.default_layout;

    // 选择最适合的模式
    let pattern = WORKFLOW_PATTERNS.find(p =>
      p.typeFilter?.includes(features.type) &&
      (!p.complexityThreshold || this.overallComplexity(features.complexity) <= p.complexityThreshold)
    );

    // 如果没有匹配的模式，使用默认的编码模式
    if (!pattern) {
      pattern = WORKFLOW_PATTERNS.find(p => {
        const complexity = this.overallComplexity(features.complexity);
        if (complexity < 0.3) return p.name === 'simple_code';
        if (complexity < 0.7) return p.name === 'standard_code';
        return p.name === 'complex_code';
      })!;
    }

    // 生成节点
    let currentY = layout.start_y;
    let previousNodeId: string | null = null;

    for (const nodeType of pattern.nodeSequence) {
      const nodeId = this.generateNodeId(nodeType);
      const node: NodeDefinition = {
        id: nodeId,
        type: nodeType,
        position: { x: layout.start_x, y: currentY }
      };

      // 添加节点特定配置
      this.applyNodeConfig(node, features);

      nodes.push(node);

      // 创建边
      if (previousNodeId) {
        edges.push({
          id: `${previousNodeId}->${nodeId}`,
          source: previousNodeId,
          target: nodeId,
          type: 'smoothstep'
        });
      }

      previousNodeId = nodeId;
      currentY += layout.node_spacing_y;
    }

    return {
      nodes,
      edges,
      metadata: {
        generated_at: new Date(),
        based_on_features: features,
        applied_rules: [pattern.name],
        confidence: 0,
        version: '1.0.0'
      }
    };
  }

  /**
   * 应用节点特定配置
   */
  private applyNodeConfig(node: NodeDefinition, features: TaskFeatures): void {
    const template = NODE_TEMPLATES[node.type];
    if (!template) return;

    // 应用默认配置
    node.config = { ...template.defaultConfig };

    switch (node.type) {
      case 'understand':
        node.config.depth = this.overallComplexity(features.complexity) > 0.5 ? 'deep' : 'medium';
        node.config.ask_clarifying_questions = features.flags.needs_negotiation;
        break;

      case 'decompose':
        node.config.strategy = features.flags.needs_parallel ? 'parallel' : 'sequential';
        node.config.max_depth = features.scale.estimated_subtasks;
        break;

      case 'code':
        node.config.language = features.tech_stack?.languages[0] || 'typescript';
        node.config.framework = features.tech_stack?.frameworks[0];
        break;

      case 'test':
        node.config.test_type = 'write';
        node.config.framework = features.tech_stack?.libraries.find(l => /test/i.test(l));
        break;

      case 'validate':
        node.config.test_type = 'run';
        node.config.stop_on_failure = features.quality_requirement !== 'low';
        break;

      case 'review':
        node.config.strictness = this.getReviewStrictness(features);
        node.config.auto_fix = features.quality_requirement !== 'critical';
        break;

      case 'parallel':
        node.config.max_concurrent = Math.min(features.scale.estimated_subtasks, 5);
        break;

      case 'loop':
        node.config.condition = 'test_failed';
        node.config.max_iterations = 3;
        break;
    }
  }

  /**
   * 计算工作流置信度
   */
  private calculateConfidence(features: TaskFeatures, workflow: GeneratedWorkflow): number {
    let confidence = 0.5; // 基础置信度

    // 规模因素 - 规模越大，置信度越高（因为规则更明确）
    const scaleScore = Math.min(features.scale.estimated_subtasks / 10, 0.2);
    confidence += scaleScore;

    // 复杂度因素 - 复杂度适中时置信度更高
    const complexity = this.overallComplexity(features.complexity);
    const complexityScore = complexity > 0.3 && complexity < 0.8 ? 0.15 : 0.05;
    confidence += complexityScore;

    // 规则匹配因素 - 匹配的规则越多，置信度越高
    const ruleScore = Math.min(workflow.metadata.applied_rules.length * 0.05, 0.2);
    confidence += ruleScore;

    // 特征明确性因素 - 特征标记越多，越明确
    const flagCount = Object.values(features.flags).filter(f => f).length;
    const flagScore = Math.min(flagCount * 0.02, 0.15);
    confidence += flagScore;

    // 质量要求因素 - 明确的质量要求增加置信度
    const qualityScore = features.quality_requirement !== 'normal' ? 0.05 : 0;
    confidence += qualityScore;

    return Math.min(confidence, 1.0);
  }

  /**
   * 获取审核严格度
   */
  private getReviewStrictness(features: TaskFeatures): 'loose' | 'normal' | 'strict' {
    switch (features.quality_requirement) {
      case 'critical':
        return 'strict';
      case 'high':
        return 'normal';
      case 'low':
        return 'loose';
      default:
        return 'normal';
    }
  }

  /**
   * 验证工作流
   */
  private validateWorkflow(workflow: GeneratedWorkflow): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查节点引用
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    workflow.edges.forEach(edge => {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    });

    // 检查孤立节点
    const connectedNodeIds = new Set([
      ...workflow.edges.map(e => e.source),
      ...workflow.edges.map(e => e.target)
    ]);
    workflow.nodes.forEach(node => {
      if (!connectedNodeIds.has(node.id)) {
        warnings.push(`Node ${node.id} is not connected to any edge`);
      }
    });

    // 检查循环（允许循环节点，但警告潜在无限循环）
    this.detectCycles(workflow).forEach(cycle => {
      warnings.push(`Potential cycle detected: ${cycle.join(' -> ')}`);
    });

    if (errors.length > 0) {
      throw new Error(`Workflow validation failed:\n${errors.join('\n')}`);
    }

    if (warnings.length > 0 && this.config.validate) {
      console.warn('[WorkflowGenerator] Validation warnings:', warnings);
    }
  }

  /**
   * 检测工作流中的循环
   */
  private detectCycles(workflow: GeneratedWorkflow): string[][] {
    const cycles: string[][] = [];
    const graph = new Map<string, string[]>();

    // 构建邻接表
    workflow.nodes.forEach(node => {
      graph.set(node.id, []);
    });
    workflow.edges.forEach(edge => {
      const targets = graph.get(edge.source) || [];
      targets.push(edge.target);
      graph.set(edge.source, targets);
    });

    // DFS 检测循环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      for (const neighbor of graph.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // 找到循环
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    workflow.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    });

    return cycles;
  }

  /**
   * 计算整体复杂度
   */
  private overallComplexity(complexity: ComplexityScore): number {
    return (complexity.component + complexity.coordinative + complexity.dynamic) / 3;
  }

  /**
   * 生成唯一节点 ID
   */
  private generateNodeId(type: string): string {
    const counter = this.nodeCounter++;
    return `${type}_${counter}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<WorkflowGeneratorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      rule_engine: {
        ...this.config.rule_engine,
        ...config.rule_engine
      },
      default_layout: {
        ...this.config.default_layout,
        ...config.default_layout
      }
    };
  }

  /**
   * 获取节点模板
   */
  getNodeTemplate(type: string): NodeTemplate | undefined {
    return NODE_TEMPLATES[type];
  }

  /**
   * 注册节点模板
   */
  registerNodeTemplate(type: string, template: NodeTemplate): void {
    NODE_TEMPLATES[type] = template;
  }

  /**
   * 获取所有工作流模式
   */
  getWorkflowPatterns(): WorkflowPattern[] {
    return [...WORKFLOW_PATTERNS];
  }

  /**
   * 添加自定义工作流模式
   */
  addWorkflowPattern(pattern: WorkflowPattern): void {
    WORKFLOW_PATTERNS.push(pattern);
  }
}

/**
 * 创建默认的工作流生成器实例
 */
export function createWorkflowGenerator(config?: WorkflowGeneratorConfig): WorkflowGenerator {
  return new WorkflowGenerator(config);
}

/**
 * 从特征快速生成工作流的便捷函数
 */
export async function generateWorkflow(
  features: TaskFeatures,
  config?: WorkflowGeneratorConfig
): Promise<GeneratedWorkflow> {
  const generator = createWorkflowGenerator(config);
  return generator.generate(features);
}
