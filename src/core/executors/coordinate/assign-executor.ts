/**
 * Assign 节点执行器
 * 任务分配
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 分配策略
 */
type AssignmentStrategy =
  | 'round_robin'
  | 'random'
  | 'load_balanced'
  | 'capability_based'
  | 'priority_based'
  | 'manual';

/**
 * 任务分配
 */
interface TaskAssignment {
  /** 任务 ID */
  task_id: string;
  /** 任务内容 */
  task: any;
  /** 分配的 Agent ID */
  agent_id: string;
  /** 分配的 Agent 名称 */
  agent_name: string;
  /** 分配时间 */
  assigned_at: Date;
  /** 状态 */
  status: 'assigned' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Assign 节点配置
 */
interface AssignConfig {
  /** 分配策略 */
  strategy?: AssignmentStrategy;
  /** Agent 列表（手动分配时使用） */
  agents?: string[];
  /** 是否自动预订 Agent */
  auto_reserve?: boolean;
  /** 能力要求 */
  required_capabilities?: string[];
}

/**
 * Assign 节点执行器
 */
export class AssignExecutor extends BaseNodeExecutor {
  private roundRobinIndex = 0;

  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as AssignConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 获取任务和 Agent 池
      const tasks = this.getTasks(context.inputs);
      const agentPool = this.getAgentPool(context);

      if (tasks.length === 0) {
        return this.success({ assignments: [] });
      }

      const strategy = config.strategy || 'capability_based';
      const autoReserve = config.auto_reserve !== false;

      // 执行分配
      const assignments = await this.assignTasks(
        tasks,
        strategy,
        agentPool,
        autoReserve,
        config.required_capabilities,
        context
      );

      // 保存分配结果
      this.setVariable(context, 'task_assignments', assignments);

      this.publishEvent(context, 'assign:completed', {
        taskCount: tasks.length,
        strategy
      });

      this.addExecutionRecord(context, true);

      return this.success({
        assignments,
        count: assignments.length,
        strategy
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 获取任务列表
   */
  private getTasks(inputs: Record<string, any>): any[] {
    if (inputs.tasks && Array.isArray(inputs.tasks)) {
      return inputs.tasks;
    }

    if (inputs.subtasks && Array.isArray(inputs.subtasks)) {
      return inputs.subtasks;
    }

    return [inputs];
  }

  /**
   * 分配任务
   */
  private async assignTasks(
    tasks: any[],
    strategy: AssignmentStrategy,
    agentPool: any,
    autoReserve: boolean,
    requiredCapabilities: string[] | undefined,
    context: NodeContext
  ): Promise<TaskAssignment[]> {
    const assignments: TaskAssignment[] = [];
    const taskIds = new Set<string>();

    for (let i = 0; i < tasks.length; i++) {
      const taskId = `task_${i}_${Date.now()}`;
      const task = tasks[i];

      // 选择 Agent
      const agent = this.selectAgent(
        taskId,
        task,
        strategy,
        agentPool,
        requiredCapabilities
      );

      if (!agent) {
        throw new Error(`No available agent for task ${taskId}`);
      }

      // 预订 Agent（如果配置）
      if (autoReserve) {
        const reserved = await agentPool.reserve(agent.id);
        if (!reserved) {
          throw new Error(`Failed to reserve agent ${agent.id}`);
        }
      }

      // 创建分配
      const assignment: TaskAssignment = {
        task_id: taskId,
        task,
        agent_id: agent.id,
        agent_name: agent.name,
        assigned_at: new Date(),
        status: 'assigned'
      };

      assignments.push(assignment);
      taskIds.add(taskId);
    }

    return assignments;
  }

  /**
   * 选择 Agent
   */
  private selectAgent(
    taskId: string,
    task: any,
    strategy: AssignmentStrategy,
    agentPool: any,
    requiredCapabilities: string[] | undefined
  ): any {
    // 获取可用 Agent
    const availableAgents = agentPool.getAvailable(requiredCapabilities || []);

    if (!availableAgents) {
      return null;
    }

    switch (strategy) {
      case 'round_robin':
        return this.selectRoundRobin(availableAgents);

      case 'random':
        return this.selectRandom(availableAgents);

      case 'load_balanced':
        return this.selectLoadBalanced(availableAgents, agentPool);

      case 'capability_based':
        return this.selectCapabilityBased(task, availableAgents);

      case 'priority_based':
        return this.selectPriorityBased(availableAgents);

      case 'manual':
        return this.selectManual(availableAgents);

      default:
        return availableAgents[0];
    }
  }

  /**
   * 轮询选择
   */
  private selectRoundRobin(agents: any[]): any {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;
    return agent;
  }

  /**
   * 随机选择
   */
  private selectRandom(agents: any[]): any {
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * 负载均衡选择
   */
  private selectLoadBalanced(agents: any[], agentPool: any): any {
    // 简化实现：返回第一个空闲 Agent
    const idleAgents = agents.filter((a: any) => a.status === 'idle');
    return idleAgents.length > 0 ? idleAgents[0] : agents[0];
  }

  /**
   * 基于能力选择
   */
  private selectCapabilityBased(task: any, agents: any[]): any {
    // 检查任务是否有能力要求
    const requiredCapabilities = task.required_capabilities || [];

    if (requiredCapabilities.length === 0) {
      return agents[0];
    }

    // 找到最匹配的 Agent
    for (const agent of agents) {
      const agentCapabilities = agent.capabilities || [];
      const hasAllCapabilities = requiredCapabilities.every((cap: string) =>
        agentCapabilities.includes(cap)
      );

      if (hasAllCapabilities) {
        return agent;
      }
    }

    // 降级：返回第一个 Agent
    return agents[0];
  }

  /**
   * 基于优先级选择
   */
  private selectPriorityBased(agents: any[]): any {
    // 按优先级排序（如果有）
    const sorted = [...agents].sort((a: any, b: any) =>
      (b.priority || 0) - (a.priority || 0)
    );

    return sorted[0];
  }

  /**
   * 手动选择
   */
  private selectManual(agents: any[]): any {
    // 返回第一个可用 Agent（手动模式下应该指定 Agent）
    return agents[0];
  }
}
