/**
 * Clarify 节点执行器
 * 澄清任务中的疑问和模糊点
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 澄清模式
 */
type ClarifyMode = 'interactive' | 'auto' | 'batch';

/**
 * Clarify 节点配置
 */
interface ClarifyConfig {
  /** 澄清模式 */
  mode?: ClarifyMode;
  /** 最大澄清轮次 */
  max_rounds?: number;
  /** 是否自动推断答案 */
  auto_infer?: boolean;
  /** 是否保存澄清历史 */
  save_history?: boolean;
}

/**
 * 澄清问题
 */
interface ClarificationQuestion {
  /** 问题 ID */
  id: string;
  /** 问题内容 */
  question: string;
  /** 问题类型 */
  type: 'requirement' | 'constraint' | 'preference' | 'technical' | 'other';
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 上下文 */
  context?: string;
  /** 用户回答 */
  answer?: string;
  /** 推断的答案 */
  inferred_answer?: string;
  /** 状态 */
  status: 'pending' | 'answered' | 'inferred' | 'skipped';
}

/**
 * 澄清结果
 */
interface ClarificationResult {
  /** 是否完成澄清 */
  completed: boolean;
  /** 澄清问题列表 */
  questions: ClarificationQuestion[];
  /** 已回答的问题数 */
  answered_count: number;
  /** 推断的问题数 */
  inferred_count: number;
  /** 跳过的问题数 */
  skipped_count: number;
  /** 澄清后的任务描述 */
  refined_task?: string;
  /** 剩余的疑问 */
  remaining_ambiguities: string[];
}

/**
 * Clarify 节点执行器
 */
export class ClarifyExecutor extends BaseNodeExecutor {
  private questionIdCounter = 0;

  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as ClarifyConfig;
    const mode = config.mode || 'auto';
    const maxRounds = config.max_rounds || 3;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.parsed_task?.data;
      const understanding = context.inputs.understanding;
      const clarifying_questions = context.inputs.clarifying_questions;

      if (!task) {
        throw new Error('Task data is required');
      }

      // 生成或获取问题列表
      let questions = clarifying_questions
        ? this.createQuestionsFromList(clarifying_questions)
        : await this.generateQuestions(task, understanding, context);

      // 根据模式处理问题
      const result = await this.processQuestions(
        questions,
        mode,
        maxRounds,
        config.auto_infer || false,
        context
      );

      // 如果配置保存历史
      if (config.save_history) {
        this.setVariable(context, 'clarification_history', {
          timestamp: new Date().toISOString(),
          questions: result.questions
        });
      }

      this.publishEvent(context, 'clarify:completed', {
        completed: result.completed,
        answered: result.answered_count
      });

      this.addExecutionRecord(context, true);

      return this.success({
        clarification_result: result,
        refined_task: result.refined_task,
        questions: result.questions,
        remaining_ambiguities: result.remaining_ambiguities
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 从问题列表创建问题对象
   */
  private createQuestionsFromList(questionList: string[]): ClarificationQuestion[] {
    return questionList.map((q, index) => ({
      id: `q_${this.questionIdCounter++}`,
      question: q,
      type: this.classifyQuestion(q),
      priority: 'medium',
      status: 'pending'
    }));
  }

  /**
   * 分类问题类型
   */
  private classifyQuestion(question: string): ClarificationQuestion['type'] {
    const lower = question.toLowerCase();

    if (lower.includes('require') || lower.includes('need')) {
      return 'requirement';
    }
    if (lower.includes('constraint') || lower.includes('limit') || lower.includes('must not')) {
      return 'constraint';
    }
    if (lower.includes('prefer') || lower.includes('like') || lower.includes('want')) {
      return 'preference';
    }
    if (lower.includes('how') || lower.includes('implement') || lower.includes('framework')) {
      return 'technical';
    }

    return 'other';
  }

  /**
   * 生成澄清问题
   */
  private async generateQuestions(
    task: any,
    understanding: any,
    context: NodeContext
  ): Promise<ClarificationQuestion[]> {
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);
    const ambiguities = understanding?.ambiguities || [];

    const prompt = `
Task: ${description}
${ambiguities.length > 0 ? `Ambiguities: ${ambiguities.join(', ')}` : ''}

Generate clarifying questions to better understand this task.
For each question, provide:
1. The question text
2. Type: requirement/constraint/preference/technical/other
3. Priority: high/medium/low

Return as JSON array:
[
  {
    "question": "...",
    "type": "...",
    "priority": "..."
  }
]

Focus on the most important questions (5-10 max).
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are an expert at asking clarifying questions.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return (Array.isArray(parsed) ? parsed : []).map((q: any) => ({
        id: `q_${this.questionIdCounter++}`,
        question: q.question || 'Clarify this point',
        type: q.type || 'other',
        priority: q.priority || 'medium',
        status: 'pending' as const
      }));
    } catch {
      // 失败时返回基础问题
      return [{
        id: `q_${this.questionIdCounter++}`,
        question: 'Could you provide more details about the expected outcome?',
        type: 'requirement',
        priority: 'high',
        status: 'pending'
      }];
    }
  }

  /**
   * 处理问题
   */
  private async processQuestions(
    questions: ClarificationQuestion[],
    mode: ClarifyMode,
    maxRounds: number,
    autoInfer: boolean,
    context: NodeContext
  ): Promise<ClarificationResult> {
    let currentRound = 0;

    while (currentRound < maxRounds) {
      const pendingQuestions = questions.filter(q => q.status === 'pending');
      if (pendingQuestions.length === 0) {
        break;
      }

      currentRound++;

      // 根据模式处理
      if (mode === 'interactive') {
        // 交互模式 - 需要用户回答
        await this.handleInteractiveMode(pendingQuestions, context);
      } else if (mode === 'auto' || mode === 'batch') {
        // 自动模式 - 尝试推断答案
        if (autoInfer) {
          await this.inferAnswers(pendingQuestions, context);
        } else {
          // 标记为跳过
          pendingQuestions.forEach(q => q.status = 'skipped');
        }
      }
    }

    // 统计结果
    const answered_count = questions.filter(q => q.status === 'answered').length;
    const inferred_count = questions.filter(q => q.status === 'inferred').length;
    const skipped_count = questions.filter(q => q.status === 'skipped').length;
    const remaining = questions.filter(q => q.status === 'pending');

    // 生成精炼的任务描述
    const refined_task = await this.generateRefinedTask(questions, context);

    return {
      completed: remaining.length === 0,
      questions,
      answered_count,
      inferred_count,
      skipped_count,
      refined_task,
      remaining_ambiguities: remaining.map(q => q.question)
    };
  }

  /**
   * 处理交互模式
   */
  private async handleInteractiveMode(questions: ClarificationQuestion[], context: NodeContext): Promise<void> {
    // 在实际实现中，这会触发 UI 交互
    // 这里我们简化为等待用户提供 answers 输入
    const userAnswers = context.inputs.user_answers;

    if (userAnswers && typeof userAnswers === 'object') {
      for (const q of questions) {
        const answer = userAnswers[q.id] || userAnswers[q.question];
        if (answer) {
          q.answer = answer;
          q.status = 'answered';
        }
      }
    } else {
      // 没有提供答案，标记为跳过
      questions.forEach(q => q.status = 'skipped');
    }
  }

  /**
   * 推断答案
   */
  private async inferAnswers(questions: ClarificationQuestion[], context: NodeContext): Promise<void> {
    const llmClient = this.getLLMClient(context);
    const task = context.inputs.task || context.inputs.parsed_task?.data;
    const understanding = context.inputs.understanding;

    const taskDescription = typeof task === 'string' ? task : JSON.stringify(task);

    // 批量推断
    const questionTexts = questions.map(q => q.question).join('\n');
    const ambiguityText = understanding?.ambiguities?.join(', ') || '';

    const prompt = `
Based on the following task and context, infer reasonable answers to these questions:

Task: ${taskDescription}
Ambiguities: ${ambiguityText}

Questions:
${questionTexts}

For each question, provide a reasonable inference or state "Cannot infer".
Return as JSON mapping question ID to inferred answer.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are an expert at making reasonable inferences.' },
        { role: 'user', content: prompt }
      ]);

      const inferences = JSON.parse(response);

      for (const q of questions) {
        const inference = inferences[q.id];
        if (inference && inference !== 'Cannot infer') {
          q.inferred_answer = inference;
          q.status = 'inferred';
        } else {
          q.status = 'skipped';
        }
      }
    } catch {
      // 推断失败，标记为跳过
      questions.forEach(q => q.status = 'skipped');
    }
  }

  /**
   * 生成精炼的任务描述
   */
  private async generateRefinedTask(
    questions: ClarificationQuestion[],
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);
    const originalTask = context.inputs.task || context.inputs.parsed_task?.data;

    const answeredQuestions = questions.filter(q => q.status === 'answered' || q.status === 'inferred');

    if (answeredQuestions.length === 0) {
      return typeof originalTask === 'string' ? originalTask : JSON.stringify(originalTask);
    }

    const prompt = `
Original task: ${typeof originalTask === 'string' ? originalTask : JSON.stringify(originalTask)}

Clarifications:
${answeredQuestions.map(q => `- ${q.question}\n  Answer: ${q.answer || q.inferred_answer}`).join('\n')}

Generate a refined task description incorporating the clarifications.
Keep the original intent but make it more specific and clear.
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are an expert at refining task descriptions.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return typeof originalTask === 'string' ? originalTask : JSON.stringify(originalTask);
    }
  }
}
