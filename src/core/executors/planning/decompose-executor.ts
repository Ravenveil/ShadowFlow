/**
 * Decompose 节点执行器
 * 分解任务为子任务
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 子任务定义
 */
interface SubTask {
  /** 子任务 ID */
  id: string;
  /** 子任务名称 */
  name: string;
  /** 子任务描述 */
  description: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 依赖的子任务 ID 列表 */
  dependencies: string[];
  /** 预估时长（分钟） */
  estimated_duration: number;
  /** 分配的 Agent ID */
  assigned_to?: string;
  /** 状态 */
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Decompose 节点配置
 */
interface DecomposeConfig {
  /** 分解策略 */
  strategy?: 'sequential' | 'parallel' | 'hybrid';
  /** 最大子任务数 */
  max_subtasks?: number;
  /** 子任务粒度 */
  granularity?: 'coarse' | 'fine' | 'auto';
  /** 是否识别依赖 */
  identify_dependencies?: boolean;
}

/**
 * Decompose 节点执行器
 */
export class DecomposeExecutor extends BaseNodeExecutor {
  private taskIdCounter = 0;

  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as DecomposeConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.refined_task || context.inputs.parsed_task?.data;
      const design = context.inputs.design;
      const understanding = context.inputs.understanding;
      const implementationSteps = design?.implementationSteps || [];

      if (!task) {
        throw new Error('Task data is required');
      }

      const strategy = config.strategy || 'sequential';
      const maxSubtasks = config.max_subtasks || 10;
      const granularity = config.granularity || 'auto';

      // 生成子任务
      let subtasks = await this.generateSubtasks(
        task,
        implementationSteps,
        understanding,
        maxSubtasks,
        granularity,
        context
      );

      // 识别依赖（如果配置）
      if (config.identify_dependencies !== false) {
        subtasks = await this.identifyDependencies(subtasks, strategy, context);
      }

      // 构建执行计划
      const executionPlan = this.buildExecutionPlan(subtasks, strategy);

      // 保存子任务到变量
      this.setVariable(context, 'subtasks', subtasks);
      this.setVariable(context, 'execution_plan', executionPlan);

      this.publishEvent(context, 'decompose:completed', {
        subtaskCount: subtasks.length,
        strategy
      });

      this.addExecutionRecord(context, true);

      return this.success({
        subtasks,
        execution_plan: executionPlan,
        total_subtasks: subtasks.length,
        estimated_duration: subtasks.reduce((sum, t) => sum + t.estimated_duration, 0)
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 生成子任务
   */
  private async generateSubtasks(
    task: any,
    implementationSteps: string[],
    understanding: any,
    maxSubtasks: number,
    granularity: string,
    context: NodeContext
  ): Promise<SubTask[]> {
    // 如果已有实现步骤，转换为子任务
    if (implementationSteps.length > 0) {
      return implementationSteps.slice(0, maxSubtasks).map((step, index) => ({
        id: `subtask_${this.taskIdCounter++}`,
        name: step.split(':')[0] || `Subtask ${index + 1}`,
        description: step,
        priority: index === 0 ? 'high' : 'medium',
        dependencies: [],
        estimated_duration: understanding?.estimated_duration
          ? Math.ceil(understanding.estimated_duration / implementationSteps.length)
          : 30,
        status: 'pending' as const
      }));
    }

    // 使用 LLM 生成子任务
    const llmClient = this.getLLMClient(context);

    const description = typeof task === 'string' ? task : JSON.stringify(task);
    const subtaskCount = Math.min(maxSubtasks, understanding?.estimatedSubtasks || 5);

    const granularityPrompt = {
      coarse: 'Create broad, high-level subtasks (3-5 max).',
      fine: 'Create detailed, granular subtasks (up to 10).',
      auto: 'Create appropriately sized subtasks based on task complexity.'
    };

    const prompt = `
Decompose this task into ${subtaskCount} subtasks:
${description}

${granularityPrompt[granularity as keyof typeof granularityPrompt] || granularityPrompt.auto}

For each subtask, provide:
- name: concise task name
- description: what needs to be done
- priority: high/medium/low
- estimated_duration: minutes

Return JSON array:
[
  {
    "name": "Setup project",
    "description": "Initialize project structure and install dependencies",
    "priority": "high",
    "estimated_duration": 30
  }
]
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a task decomposition expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
        id: `subtask_${this.taskIdCounter++}`,
        name: item.name || 'Unnamed task',
        description: item.description || '',
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
        dependencies: [],
        estimated_duration: Math.max(5, Math.round(item.estimated_duration || 30)),
        status: 'pending' as const
      }));
    } catch {
      // 降级：生成默认子任务
      return [
        {
          id: `subtask_${this.taskIdCounter++}`,
          name: 'Analyze requirements',
          description: 'Review and understand the task requirements',
          priority: 'high',
          dependencies: [],
          estimated_duration: 15,
          status: 'pending' as const
        },
        {
          id: `subtask_${this.taskIdCounter++}`,
          name: 'Implement core functionality',
          description: 'Implement the main features of the task',
          priority: 'high',
          dependencies: ['subtask_0'],
          estimated_duration: 60,
          status: 'pending' as const
        },
        {
          id: `subtask_${this.taskIdCounter++}`,
          name: 'Test and validate',
          description: 'Test the implementation and verify correctness',
          priority: 'medium',
          dependencies: ['subtask_1'],
          estimated_duration: 30,
          status: 'pending' as const
        }
      ];
    }
  }

  /**
   * 识别子任务依赖
   */
  private async identifyDependencies(
    subtasks: SubTask[],
    strategy: string,
    context: NodeContext
  ): Promise<SubTask[]> {
    if (strategy === 'parallel') {
      // 并行策略：所有任务无依赖
      return subtasks.map(task => ({ ...task, dependencies: [] }));
    }

    const llmClient = this.getLLMClient(context);

    const taskDescriptions = subtasks.map(t => `${t.id}: ${t.description}`).join('\n');

    const prompt = `
Analyze dependencies between these subtasks:
${taskDescriptions}

Identify which tasks must complete before others can start.
Return JSON mapping task ID to array of dependency task IDs:
{
  "subtask_1": ["subtask_0"],
  "subtask_2": ["subtask_1"]
}

If a task has no dependencies, use empty array.
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a task dependency analysis expert.' },
        { role: 'user', content: prompt }
      ]);

      const dependenciesMap = JSON.parse(response);

      return subtasks.map(task => ({
        ...task,
        dependencies: Array.isArray(dependenciesMap[task.id])
          ? dependenciesMap[task.id]
          : []
      }));
    } catch {
      // 默认顺序依赖
      return subtasks.map((task, index) => ({
        ...task,
        dependencies: index > 0 ? [subtasks[index - 1].id] : []
      }));
    }
  }

  /**
   * 构建执行计划
   */
  private buildExecutionPlan(subtasks: SubTask[], strategy: string): any {
    const plan: any = {
      strategy,
      phases: [],
      timeline: []
    };

    if (strategy === 'sequential') {
      // 顺序执行：所有任务按顺序
      plan.phases.push({
        name: 'Sequential Execution',
        tasks: subtasks.map(t => t.id),
        parallel: false
      });
    } else if (strategy === 'parallel') {
      // 并行执行：所有任务并行
      plan.phases.push({
        name: 'Parallel Execution',
        tasks: subtasks.map(t => t.id),
        parallel: true
      });
    } else {
      // 混合策略：按依赖分组
      const batches = this.topologicalSort(subtasks);
      batches.forEach((batch, index) => {
        plan.phases.push({
          name: `Phase ${index + 1}`,
          tasks: batch,
          parallel: batch.length > 1
        });
      });
    }

    // 生成时间线
    let currentTime = 0;
    subtasks.forEach(task => {
      plan.timeline.push({
        task_id: task.id,
        start: currentTime,
        end: currentTime + task.estimated_duration
      });
      currentTime += task.estimated_duration;
    });

    return plan;
  }

  /**
   * 拓扑排序，返回可以并行的任务批次
   */
  private topologicalSort(subtasks: SubTask[]): string[][] {
    const taskMap = new Map(subtasks.map(t => [t.id, t]));
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // 初始化图
    subtasks.forEach(task => {
      inDegree.set(task.id, 0);
      graph.set(task.id, []);
    });

    // 构建图和入度
    subtasks.forEach(task => {
      task.dependencies.forEach(depId => {
        if (graph.has(depId)) {
          graph.get(depId)!.push(task.id);
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        }
      });
    });

    // 拓扑排序
    const result: string[][] = [];
    let queue = subtasks.filter(t => inDegree.get(t.id) === 0).map(t => t.id);

    while (queue.length > 0) {
      result.push([...queue]);
      const nextQueue: string[] = [];

      queue.forEach(taskId => {
        graph.get(taskId)!.forEach(neighborId => {
          inDegree.set(neighborId, (inDegree.get(neighborId) || 0) - 1);
          if (inDegree.get(neighborId) === 0) {
            nextQueue.push(neighborId);
          }
        });
      });

      queue = nextQueue;
    }

    return result;
  }
}
