/**
 * 规则引擎 (RuleEngine)
 *
 * 负责解析和执行 YAML 规则配置，处理规则优先级和冲突解决
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  Rule,
  RuleCondition,
  RuleAction,
  RuleEngineConfig,
  RuleEngineReport,
  RuleExecutionResult,
  TaskFeatures,
  GeneratedWorkflow,
  NodeDefinition,
  EdgeDefinition,
} from '../types/analyzer.js';

/**
 * 规则解析错误
 */
export class RuleParseError extends Error {
  constructor(
    message: string,
    public ruleId?: string,
    public field?: string
  ) {
    super(message);
    this.name = 'RuleParseError';
  }
}

/**
 * 规则执行错误
 */
export class RuleExecutionError extends Error {
  constructor(
    message: string,
    public ruleId: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RuleExecutionError';
  }
}

/**
 * 默认规则定义
 */
const DEFAULT_RULES: Rule[] = [
  // ========== 复杂度规则 ==========
  {
    id: 'complexity_simple',
    name: '简单任务规则',
    description: '适用于低复杂度的简单任务',
    priority: 10,
    category: 'complexity',
    condition: {
      type: 'compare',
      field: 'overall_complexity',
      operator: 'lt',
      value: 0.3
    },
    action: {
      type: 'add_nodes',
      nodes: [
        { id: 'receive', type: 'receive', position: { x: 250, y: 50 } },
        { id: 'understand', type: 'understand', position: { x: 250, y: 150 } },
        { id: 'code', type: 'code', position: { x: 250, y: 250 } },
        { id: 'report', type: 'report', position: { x: 250, y: 350 } }
      ]
    }
  },

  {
    id: 'complexity_medium',
    name: '中等复杂度任务规则',
    description: '适用于中等复杂度的任务',
    priority: 10,
    category: 'complexity',
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', field: 'overall_complexity', operator: 'ge', value: 0.3 },
        { type: 'compare', field: 'overall_complexity', operator: 'lt', value: 0.7 }
      ]
    },
    action: {
      type: 'add_nodes',
      nodes: [
        { id: 'receive', type: 'receive', position: { x: 250, y: 50 } },
        { id: 'understand', type: 'understand', position: { x: 250, y: 150 } },
        { id: 'analyze', type: 'analyze', position: { x: 250, y: 250 } },
        { id: 'code', type: 'code', position: { x: 250, y: 350 } },
        { id: 'report', type: 'report', position: { x: 250, y: 450 } }
      ]
    }
  },

  {
    id: 'complexity_high',
    name: '高复杂度任务规则',
    description: '适用于高复杂度的复杂任务',
    priority: 10,
    category: 'complexity',
    condition: {
      type: 'compare',
      field: 'overall_complexity',
      operator: 'ge',
      value: 0.7
    },
    action: {
      type: 'add_nodes',
      nodes: [
        { id: 'receive', type: 'receive', position: { x: 250, y: 50 } },
        { id: 'understand', type: 'understand', position: { x: 250, y: 150 } },
        { id: 'analyze', type: 'analyze', position: { x: 250, y: 250 } },
        { id: 'design', type: 'design', position: { x: 250, y: 350 } },
        { id: 'decompose', type: 'decompose', position: { x: 250, y: 450 } },
        { id: 'code', type: 'code', position: { x: 250, y: 550 } },
        { id: 'report', type: 'report', position: { x: 250, y: 650 } }
      ]
    }
  },

  // ========== 类型规则 ==========
  {
    id: 'type_coding_tdd',
    name: 'TDD 编码工作流',
    description: '采用测试驱动开发模式的编码任务',
    priority: 20,
    category: 'type',
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', field: 'type', operator: 'eq', value: 'coding' },
        { type: 'compare', field: 'flags.needs_tdd', operator: 'eq', value: true }
      ]
    },
    action: {
      type: 'custom',
      fn: (workflow: GeneratedWorkflow, features: TaskFeatures) => {
        // 找到 code 节点
        const codeNode = workflow.nodes.find(n => n.type === 'code');
        if (!codeNode) return;

        // 在 code 之前插入测试节点
        const codeIndex = workflow.nodes.findIndex(n => n.id === 'code');
        const insertY = codeNode.position.y - 100;

        workflow.nodes.splice(codeIndex, 0,
          { id: 'test', type: 'test', position: { x: 250, y: insertY }, config: { test_type: 'write' } }
        );

        // 在 code 之后插入验证节点
        workflow.nodes.push(
          { id: 'validate', type: 'validate', position: { x: 250, y: codeNode.position.y + 100 }, config: { test_type: 'run' } },
          { id: 'loop', type: 'loop', position: { x: 250, y: codeNode.position.y + 200 }, config: { condition: 'test_failed', max_iterations: 3 } }
        );

        // 调整边
        workflow.edges = workflow.edges.filter(e => e.target !== 'code');
        workflow.edges.push(
          { id: 'test->code', source: 'test', target: 'code' },
          { id: 'code->validate', source: 'code', target: 'validate' },
          { id: 'validate->loop', source: 'validate', target: 'loop' }
        );
      }
    }
  },

  {
    id: 'type_documentation',
    name: '文档生成工作流',
    description: '适用于文档生成任务',
    priority: 20,
    category: 'type',
    condition: {
      type: 'compare',
      field: 'type',
      operator: 'eq',
      value: 'documentation'
    },
    action: {
      type: 'add_nodes',
      nodes: [
        { id: 'receive', type: 'receive', position: { x: 250, y: 50 } },
        { id: 'understand', type: 'understand', position: { x: 250, y: 150 } },
        { id: 'research', type: 'research', position: { x: 250, y: 250 } },
        { id: 'generate', type: 'generate', position: { x: 250, y: 350 } },
        { id: 'format', type: 'format', position: { x: 250, y: 450 } },
        { id: 'report', type: 'report', position: { x: 250, y: 550 } }
      ]
    }
  },

  // ========== 质量规则 ==========
  {
    id: 'quality_normal_review',
    name: '常规审核',
    description: '为高优先级任务添加审核节点',
    priority: 30,
    category: 'quality',
    condition: {
      type: 'compare',
      field: 'quality_requirement',
      operator: 'eq',
      value: 'high'
    },
    action: {
      type: 'custom',
      fn: (workflow: GeneratedWorkflow, features: TaskFeatures) => {
        const lastNode = workflow.nodes[workflow.nodes.length - 1];
        const reviewY = lastNode.position.y + 100;

        workflow.nodes.push({
          id: 'review',
          type: 'review',
          position: { x: 250, y: reviewY },
          config: { strictness: 'normal', auto_fix: true }
        });

        // 调整最后一条边
        const lastEdge = workflow.edges[workflow.edges.length - 1];
        workflow.edges[workflow.edges.length - 1] = { ...lastEdge, target: 'review' };
        workflow.edges.push({ id: 'review->report', source: 'review', target: 'report' });
      }
    }
  },

  {
    id: 'quality_critical_review',
    name: '严格审核',
    description: '为关键任务添加严格审核和安全审计',
    priority: 40,
    category: 'quality',
    condition: {
      type: 'compare',
      field: 'quality_requirement',
      operator: 'eq',
      value: 'critical'
    },
    action: {
      type: 'custom',
      fn: (workflow: GeneratedWorkflow, features: TaskFeatures) => {
        const lastNode = workflow.nodes[workflow.nodes.length - 1];
        const reviewY = lastNode.position.y + 100;

        workflow.nodes.push({
          id: 'review',
          type: 'review',
          position: { x: 250, y: reviewY },
          config: { strictness: 'strict', auto_fix: false }
        });

        // 添加安全审计节点
        workflow.nodes.push({
          id: 'security',
          type: 'security',
          position: { x: 250, y: reviewY + 100 }
        });

        // 调整边
        const lastEdge = workflow.edges[workflow.edges.length - 1];
        workflow.edges[workflow.edges.length - 1] = { ...lastEdge, target: 'review' };
        workflow.edges.push({ id: 'review->security', source: 'review', target: 'security' });
        workflow.edges.push({ id: 'security->report', source: 'security', target: 'report' });
      }
    }
  },

  // ========== 并行规则 ==========
  {
    id: 'parallel_execution',
    name: '并行执行规则',
    description: '当需要并行执行时添加并行节点',
    priority: 25,
    category: 'parallel',
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', field: 'flags.needs_parallel', operator: 'eq', value: true },
        { type: 'compare', field: 'scale.estimated_subtasks', operator: 'gt', value: 1 }
      ]
    },
    action: {
      type: 'custom',
      fn: (workflow: GeneratedWorkflow, features: TaskFeatures) => {
        const subtaskCount = Math.min(features.scale.estimated_subtasks, 5);
        const lastNode = workflow.nodes[workflow.nodes.length - 1];
        const parallelY = lastNode.position.y + 100;

        // 添加并行节点
        workflow.nodes.push({
          id: 'parallel',
          type: 'parallel',
          position: { x: 250, y: parallelY },
          config: { max_concurrent: subtaskCount }
        });

        // 添加执行节点
        for (let i = 0; i < subtaskCount; i++) {
          const execX = 100 + i * 150;
          workflow.nodes.push({
            id: `exec_${i}`,
            type: 'code',
            position: { x: execX, y: parallelY + 100 }
          });
          workflow.edges.push({
            id: `parallel->exec_${i}`,
            source: 'parallel',
            target: `exec_${i}`
          });
        }

        // 添加汇聚节点
        const aggregateY = parallelY + 200;
        workflow.nodes.push({
          id: 'aggregate',
          type: 'aggregate',
          position: { x: 250, y: aggregateY }
        });

        for (let i = 0; i < subtaskCount; i++) {
          workflow.edges.push({
            id: `exec_${i}->aggregate`,
            source: `exec_${i}`,
            target: 'aggregate'
          });
        }

        // 调整边
        const lastEdge = workflow.edges.find(e => e.target === lastNode.id && !e.target.startsWith('exec_'));
        if (lastEdge) {
          lastEdge.target = 'parallel';
        }
      }
    }
  }
];

/**
 * 规则引擎
 */
export class RuleEngine {
  private config: Required<RuleEngineConfig>;
  private rules: Map<string, Rule> = new Map();

  constructor(config: RuleEngineConfig = {}) {
    this.config = {
      rule_files: config.rule_files || [],
      rules: config.rules || [],
      use_default_rules: config.use_default_rules !== false,
      conflict_resolution: config.conflict_resolution || 'highest_priority',
      max_recursion_depth: config.max_recursion_depth || 10
    };

    this.initializeRules();
  }

  /**
   * 初始化规则
   */
  private async initializeRules(): Promise<void> {
    // 加载默认规则
    if (this.config.use_default_rules) {
      for (const rule of DEFAULT_RULES) {
        this.rules.set(rule.id, rule);
      }
    }

    // 加载配置中的规则
    if (this.config.rules) {
      for (const rule of this.config.rules) {
        this.rules.set(rule.id, rule);
      }
    }

    // 从文件加载规则
    if (this.config.rule_files) {
      await this.loadRulesFromFiles();
    }
  }

  /**
   * 从文件加载规则
   */
  private async loadRulesFromFiles(): Promise<void> {
    for (const filePath of this.config.rule_files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const rules = this.parseRulesFromYaml(content);
        for (const rule of rules) {
          this.rules.set(rule.id, rule);
        }
      } catch (error) {
        console.error(`Failed to load rules from ${filePath}:`, error);
      }
    }
  }

  /**
   * 从 YAML 解析规则
   */
  parseRulesFromYaml(yamlContent: string): Rule[] {
    try {
      const data = yaml.load(yamlContent) as any;

      if (!data || !Array.isArray(data.rules)) {
        throw new RuleParseError('Invalid YAML format: missing "rules" array');
      }

      const rules: Rule[] = [];
      for (const ruleData of data.rules) {
        rules.push(this.parseRule(ruleData));
      }

      return rules;
    } catch (error) {
      if (error instanceof RuleParseError) {
        throw error;
      }
      throw new RuleParseError(`Failed to parse YAML: ${error}`);
    }
  }

  /**
   * 解析单个规则
   */
  private parseRule(data: any): Rule {
    if (!data.id || typeof data.id !== 'string') {
      throw new RuleParseError('Rule must have an "id" field', undefined, 'id');
    }

    if (!data.name || typeof data.name !== 'string') {
      throw new RuleParseError('Rule must have a "name" field', data.id, 'name');
    }

    if (!data.condition) {
      throw new RuleParseError('Rule must have a "condition" field', data.id, 'condition');
    }

    if (!data.action) {
      throw new RuleParseError('Rule must have an "action" field', data.id, 'action');
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      priority: data.priority ?? 0,
      category: data.category ?? 'custom',
      condition: this.parseCondition(data.condition, data.id),
      action: this.parseAction(data.action, data.id),
      enabled: data.enabled !== false,
      tags: data.tags ?? []
    };
  }

  /**
   * 解析条件
   */
  private parseCondition(data: any, ruleId: string): RuleCondition {
    if (!data.type) {
      throw new RuleParseError('Condition must have a "type" field', ruleId, 'condition.type');
    }

    switch (data.type) {
      case 'and':
      case 'or':
        if (!Array.isArray(data.conditions)) {
          throw new RuleParseError(`${data.type} condition must have "conditions" array`, ruleId, 'condition.conditions');
        }
        return {
          type: data.type,
          conditions: data.conditions.map((c: any) => this.parseCondition(c, ruleId))
        };

      case 'not':
        return {
          type: data.type,
          condition: this.parseCondition(data.condition, ruleId)
        };

      case 'compare':
        if (!data.field || !data.operator || data.value === undefined) {
          throw new RuleParseError('compare condition requires field, operator, and value', ruleId, 'condition');
        }
        return { type: 'compare', field: data.field, operator: data.operator, value: data.value };

      case 'range':
        if (!data.field || data.min === undefined || data.max === undefined) {
          throw new RuleParseError('range condition requires field, min, and max', ruleId, 'condition');
        }
        return { type: 'range', field: data.field, min: data.min, max: data.max };

      case 'in':
        if (!data.field || !Array.isArray(data.values)) {
          throw new RuleParseError('in condition requires field and values array', ruleId, 'condition');
        }
        return { type: 'in', field: data.field, values: data.values };

      case 'custom':
        if (typeof data.fn !== 'function') {
          throw new RuleParseError('custom condition requires a function', ruleId, 'condition');
        }
        return { type: 'custom', fn: data.fn };

      default:
        throw new RuleParseError(`Unknown condition type: ${data.type}`, ruleId, 'condition.type');
    }
  }

  /**
   * 解析动作
   */
  private parseAction(data: any, ruleId: string): RuleAction {
    if (!data.type) {
      throw new RuleParseError('Action must have a "type" field', ruleId, 'action.type');
    }

    switch (data.type) {
      case 'add_node':
      case 'remove_node':
      case 'modify_node':
      case 'set_config':
        if (!data.node_id) {
          throw new RuleParseError(`${data.type} action requires node_id`, ruleId, 'action.node_id');
        }
        return { type: data.type, node_id: data.node_id, ...data };

      case 'add_nodes':
        if (!Array.isArray(data.nodes)) {
          throw new RuleParseError('add_nodes action requires nodes array', ruleId, 'action.nodes');
        }
        return { type: 'add_nodes', nodes: data.nodes };

      case 'add_edge':
      case 'remove_edge':
        if (!data.edge_id) {
          throw new RuleParseError(`${data.type} action requires edge_id`, ruleId, 'action.edge_id');
        }
        return { type: data.type, edge_id: data.edge_id, ...data };

      case 'custom':
        if (typeof data.fn !== 'function') {
          throw new RuleParseError('custom action requires a function', ruleId, 'action');
        }
        return { type: 'custom', fn: data.fn };

      default:
        throw new RuleParseError(`Unknown action type: ${data.type}`, ruleId, 'action.type');
    }
  }

  /**
   * 执行规则引擎
   */
  async execute(
    features: TaskFeatures,
    workflow?: GeneratedWorkflow
  ): Promise<{ workflow: GeneratedWorkflow; report: RuleEngineReport }> {
    const startTime = Date.now();
    const result: RuleEngineReport = {
      executed_at: new Date(),
      total_rules: this.rules.size,
      matched_rules: 0,
      successful_rules: 0,
      failed_rules: 0,
      details: [],
      total_duration_ms: 0
    };

    // 创建初始工作流（如果没有提供）
    let currentWorkflow = workflow || this.createInitialWorkflow();

    // 获取按优先级排序的规则
    const sortedRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled !== false)
      .sort((a, b) => b.priority - a.priority);

    // 执行每个规则
    for (const rule of sortedRules) {
      const ruleStartTime = Date.now();
      const executionResult: RuleExecutionResult = {
        rule_id: rule.id,
        matched: false,
        success: false,
        modified_nodes: 0,
        modified_edges: 0,
        duration_ms: 0
      };

      try {
        // 检查条件是否匹配
        const matched = this.evaluateCondition(rule.condition, features);
        executionResult.matched = matched;

        if (matched) {
          result.matched_rules++;

          // 执行动作
          const modificationResult = this.executeAction(
            rule.action,
            currentWorkflow,
            features
          );

          executionResult.success = true;
          executionResult.modified_nodes = modificationResult.nodes;
          executionResult.modified_edges = modificationResult.edges;
          result.successful_rules++;

          // 记录应用的规则
          currentWorkflow.metadata.applied_rules.push(rule.id);
        }
      } catch (error) {
        executionResult.success = false;
        executionResult.error = error instanceof Error ? error.message : String(error);
        result.failed_rules++;
      }

      executionResult.duration_ms = Date.now() - ruleStartTime;
      result.details.push(executionResult);
    }

    result.total_duration_ms = Date.now() - startTime;

    return {
      workflow: currentWorkflow,
      report: result
    };
  }

  /**
   * 创建初始工作流
   */
  private createInitialWorkflow(): GeneratedWorkflow {
    return {
      nodes: [],
      edges: [],
      metadata: {
        generated_at: new Date(),
        based_on_features: {} as any,
        applied_rules: [],
        confidence: 0,
        version: '1.0.0'
      }
    };
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: RuleCondition, features: TaskFeatures): boolean {
    switch (condition.type) {
      case 'and':
        return condition.conditions.every(c => this.evaluateCondition(c, features));

      case 'or':
        return condition.conditions.some(c => this.evaluateCondition(c, features));

      case 'not':
        return !this.evaluateCondition(condition.condition, features);

      case 'compare':
        return this.evaluateCompare(condition, features);

      case 'range':
        return this.evaluateRange(condition, features);

      case 'in':
        return this.evaluateIn(condition, features);

      case 'custom':
        return condition.fn(features);

      default:
        return false;
    }
  }

  /**
   * 评估比较条件
   */
  private evaluateCompare(condition: Extract<RuleCondition, { type: 'compare' }>, features: TaskFeatures): boolean {
    const value = this.getFieldValue(condition.field, features);
    const expected = condition.value;

    switch (condition.operator) {
      case 'eq':
        return value === expected;
      case 'ne':
        return value !== expected;
      case 'gt':
        return typeof value === 'number' && value > expected;
      case 'ge':
        return typeof value === 'number' && value >= expected;
      case 'lt':
        return typeof value === 'number' && value < expected;
      case 'le':
        return typeof value === 'number' && value <= expected;
      case 'contains':
        return typeof value === 'string' && value.includes(expected);
      default:
        return false;
    }
  }

  /**
   * 评估范围条件
   */
  private evaluateRange(condition: Extract<RuleCondition, { type: 'range' }>, features: TaskFeatures): boolean {
    const value = this.getFieldValue(condition.field, features);
    return typeof value === 'number' && value >= condition.min && value <= condition.max;
  }

  /**
   * 评估 in 条件
   */
  private evaluateIn(condition: Extract<RuleCondition, { type: 'in' }>, features: TaskFeatures): boolean {
    const value = this.getFieldValue(condition.field, features);
    return condition.values.includes(value);
  }

  /**
   * 获取字段值（支持嵌套路径）
   */
  private getFieldValue(field: string, features: TaskFeatures): any {
    if (field === 'overall_complexity') {
      return (features.complexity.component + features.complexity.coordinative + features.complexity.dynamic) / 3;
    }

    const parts = field.split('.');
    let value: any = features;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 执行动作
   */
  private executeAction(
    action: RuleAction,
    workflow: GeneratedWorkflow,
    features: TaskFeatures
  ): { nodes: number; edges: number } {
    let nodes = 0;
    let edges = 0;

    switch (action.type) {
      case 'add_node':
        this.applyAddNode(action, workflow);
        nodes = 1;
        break;

      case 'add_nodes':
        action.nodes.forEach(node => {
          workflow.nodes.push(node);
          nodes++;
        });
        break;

      case 'remove_node':
        workflow.nodes = workflow.nodes.filter(n => n.id !== action.node_id);
        workflow.edges = workflow.edges.filter(e => e.source !== action.node_id && e.target !== action.node_id);
        nodes = 1;
        break;

      case 'modify_node':
        const nodeToModify = workflow.nodes.find(n => n.id === action.node_id);
        if (nodeToModify) {
          Object.assign(nodeToModify, action.modifications);
          nodes = 1;
        }
        break;

      case 'set_config':
        const nodeToConfig = workflow.nodes.find(n => n.id === action.node_id);
        if (nodeToConfig) {
          nodeToConfig.config = { ...nodeToConfig.config, ...action.config };
          nodes = 1;
        }
        break;

      case 'add_edge':
        workflow.edges.push(action.edge);
        edges = 1;
        break;

      case 'remove_edge':
        workflow.edges = workflow.edges.filter(e => e.id !== action.edge_id);
        edges = 1;
        break;

      case 'custom':
        action.fn(workflow, features);
        break;
    }

    return { nodes, edges };
  }

  /**
   * 应用添加节点动作
   */
  private applyAddNode(action: Extract<RuleAction, { type: 'add_node' }>, workflow: GeneratedWorkflow): void {
    const targetIndex = workflow.nodes.findIndex(n => n.id === action.target);

    if (action.position === 'before' && targetIndex !== -1) {
      workflow.nodes.splice(targetIndex, 0, action.node);
    } else if (action.position === 'after' && targetIndex !== -1) {
      workflow.nodes.splice(targetIndex + 1, 0, action.node);
    } else if (action.position === 'replace' && targetIndex !== -1) {
      workflow.nodes[targetIndex] = action.node;
    } else {
      workflow.nodes.push(action.node);
    }
  }

  /**
   * 添加规则
   */
  addRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 删除规则
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取按类别分组的规则
   */
  getRulesByCategory(category: Rule['category']): Rule[] {
    return Array.from(this.rules.values()).filter(r => r.category === category);
  }

  /**
   * 启用/禁用规则
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * 清除所有规则
   */
  clearRules(): void {
    this.rules.clear();
  }
}

/**
 * 创建默认的规则引擎实例
 */
export function createRuleEngine(config?: RuleEngineConfig): RuleEngine {
  return new RuleEngine(config);
}
