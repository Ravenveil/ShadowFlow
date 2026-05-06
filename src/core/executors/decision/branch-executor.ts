/**
 * Branch 节点执行器
 * 条件分支
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 分支条件类型
 */
type BranchConditionType =
  | 'simple'
  | 'expression'
  | 'comparison'
  | 'logical'
  | 'custom';

/**
 * Branch 节点配置
 */
interface BranchConfig {
  /** 条件类型 */
  condition_type?: BranchConditionType;
  /** 条件表达式 */
  condition?: string;
  /** 条件变量路径 */
  variable?: string;
  /** 比较操作符 */
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'exists' | 'not_exists';
  /** 比较值 */
  value?: any;
  /** 真分支输出 */
  true_branch?: string;
  /** 假分支输出 */
  false_branch?: string;
}

/**
 * Branch 节点执行器
 */
export class BranchExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as BranchConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const conditionType = config.condition_type || 'simple';

      // 评估条件
      const conditionMet = await this.evaluateCondition(context, conditionType, config);

      // 保存分支结果
      this.setVariable(context, 'branch_result', conditionMet);
      this.setVariable(context, 'branch_taken', conditionMet ? 'true' : 'false');

      // 获取分支输出
      const branchTaken = conditionMet ? config.true_branch || 'true' : config.false_branch || 'false';

      this.publishEvent(context, 'branch:evaluated', {
        condition: config.condition || config.variable,
        result: conditionMet,
        branch: branchTaken
      });

      this.addExecutionRecord(context, true);

      return this.success({
        branch_result: conditionMet,
        branch_taken: branchTaken,
        output_branch: branchTaken,
        condition: config.condition || config.variable
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 评估条件
   */
  private async evaluateCondition(
    context: NodeContext,
    conditionType: BranchConditionType,
    config: BranchConfig
  ): Promise<boolean> {
    switch (conditionType) {
      case 'simple':
        return this.evaluateSimpleCondition(context, config);

      case 'expression':
        return this.evaluateExpressionCondition(context, config);

      case 'comparison':
        return this.evaluateComparisonCondition(context, config);

      case 'logical':
        return this.evaluateLogicalCondition(context, config);

      case 'custom':
        return this.evaluateCustomCondition(context, config);

      default:
        return false;
    }
  }

  /**
   * 评估简单条件
   */
  private evaluateSimpleCondition(context: NodeContext, config: BranchConfig): boolean {
    const { variable, value } = config;

    if (!variable) {
      return false;
    }

    const actualValue = this.getNestedValue(context.inputs, variable);
    const expectedValue = value !== undefined ? value : true;

    return actualValue === expectedValue;
  }

  /**
   * 评估表达式条件
   */
  private evaluateExpressionCondition(context: NodeContext, config: BranchConfig): boolean {
    const { condition } = config;

    if (!condition) {
      return false;
    }

    try {
      // 简化版表达式评估 - 实际应使用安全的表达式解析器
      const fn = new Function('inputs', `return ${condition}`);
      return Boolean(fn(context.inputs));
    } catch {
      return false;
    }
  }

  /**
   * 评估比较条件
   */
  private evaluateComparisonCondition(context: NodeContext, config: BranchConfig): boolean {
    const { variable, operator, value } = config;

    if (!variable || !operator || value === undefined) {
      return false;
    }

    const actualValue = this.getNestedValue(context.inputs, variable);

    switch (operator) {
      case '==':
        return actualValue == value;
      case '!=':
        return actualValue != value;
      case '>':
        return actualValue > value;
      case '<':
        return actualValue < value;
      case '>=':
        return actualValue >= value;
      case '<=':
        return actualValue <= value;
      case 'contains':
        return String(actualValue).includes(String(value));
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'not_exists':
        return actualValue === undefined || actualValue === null;
      default:
        return false;
    }
  }

  /**
   * 评估逻辑条件
   */
  private evaluateLogicalCondition(context: NodeContext, config: BranchConfig): boolean {
    const { condition } = config;

    if (!condition) {
      return false;
    }

    // 处理 AND/OR 逻辑
    const lowerCondition = condition.toLowerCase();

    if (lowerCondition.includes(' and ')) {
      const parts = condition.split(/ and /i);
      return parts.every(part => this.evaluateSimpleCondition(context, { variable: part.trim(), value: true }));
    }

    if (lowerCondition.includes(' or ')) {
      const parts = condition.split(/ or /i);
      return parts.some(part => this.evaluateSimpleCondition(context, { variable: part.trim(), value: true }));
    }

    return this.evaluateSimpleCondition(context, { variable: condition, value: true });
  }

  /**
   * 评估自定义条件
   */
  private async evaluateCustomCondition(context: NodeContext, config: BranchConfig): Promise<boolean> {
    const { condition } = config;

    if (!condition) {
      return false;
    }

    try {
      // 使用 LLM 评估复杂条件
      const llmClient = this.getLLMClient(context);

      const prompt = `
Evaluate this condition:

Condition: ${condition}

Available inputs:
${JSON.stringify(context.inputs, null, 2)}

Return only "true" or "false".
`;

      const response = await llmClient.chat([
        { role: 'system', content: 'You are a condition evaluation expert.' },
        { role: 'user', content: prompt }
      ]);

      return response.toLowerCase().includes('true');
    } catch {
      return false;
    }
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
