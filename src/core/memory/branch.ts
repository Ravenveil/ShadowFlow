import type { Branch, BranchConfig, Decision, Dependency, BranchMessage, MemoryType } from '../types/memory';
import type { MessageBus } from './message-bus';

/**
 * 支流实现
 * 每个支流代表一个独立的工作上下文
 */
export class BranchImpl implements Branch {
  id: string;
  name: string;
  role: string;
  responsibilities: string[];
  status: 'active' | 'paused' | 'merged' | 'abandoned';
  subscriptions: Set<string>;
  decisions: Decision[];

  private memoryPool: Map<string, any[]> = new Map();
  private messageCallbacks: ((msg: BranchMessage) => void)[] = [];
  private dependencies: Dependency[] = [];
  private messageBus: MessageBus | null;

  constructor(config: BranchConfig, messageBus?: MessageBus) {
    this.id = config.id ?? `branch-${Date.now()}`;
    this.name = config.name;
    this.role = config.role;
    this.responsibilities = config.responsibilities ?? [];
    this.status = 'active';
    this.subscriptions = new Set(config.subscribeTo ?? []);
    this.decisions = [];
    this.messageBus = messageBus || null;
  }

  // ===== 记忆操作 =====

  /**
   * 取水 - 读取记忆
   */
  drink(type?: MemoryType): any[] {
    if (!type) {
      // 返回所有记忆
      const all: any[] = [];
      for (const chunks of this.memoryPool.values()) {
        all.push(...chunks);
      }
      return all;
    }
    return this.memoryPool.get(type) ?? [];
  }

  /**
   * 过滤取水
   */
  scoop(filter: { type?: MemoryType; sourceNode?: string; timeRange?: { from: Date; to: Date } }): any[] {
    let chunks = this.drink(filter.type);

    if (filter.sourceNode) {
      chunks = chunks.filter(c => c.sourceNode === filter.sourceNode);
    }

    if (filter.timeRange) {
      chunks = chunks.filter(c => {
        const time = new Date(c.timestamp);
        return time >= filter.timeRange!.from && time <= filter.timeRange!.to;
      });
    }

    return chunks;
  }

  /**
   * 注水 - 写入记忆
   */
  pour(chunk: { type: MemoryType; content: any; metadata?: any }): void {
    if (!this.memoryPool.has(chunk.type)) {
      this.memoryPool.set(chunk.type, []);
    }

    this.memoryPool.get(chunk.type)!.push({
      ...chunk,
      timestamp: new Date().toISOString(),
      branchId: this.id
    });
  }

  /**
   * 沉淀 - 记录学习
   */
  settle(pattern: { type: string; content: any; reason?: string }): void {
    this.pour({
      type: 'knowledge',
      content: {
        ...pattern,
        isSettled: true
      },
      metadata: { importance: 0.8 }
    });
  }

  // ===== 决策操作 =====

  /**
   * 发布决策
   */
  publishDecision(decision: Omit<Decision, 'id' | 'branch' | 'timestamp'>): Decision {
    const fullDecision: Decision = {
      ...decision,
      id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      branch: this.id,
      timestamp: new Date()
    };
    this.decisions.push(fullDecision);
    return fullDecision;
  }

  /**
   * 声明依赖
   */
  declareDependency(targetBranch: string, topic: string, required: boolean): Dependency {
    const dependency: Dependency = {
      id: `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agent: this.role,
      branch: this.id,
      dependsOn: targetBranch,
      topic,
      required,
      status: 'pending'
    };
    this.dependencies.push(dependency);
    return dependency;
  }

  /**
   * 更新依赖状态
   */
  updateDependencyStatus(dependencyId: string, status: Dependency['status']): void {
    const dep = this.dependencies.find(d => d.id === dependencyId);
    if (dep) {
      dep.status = status;
    }
  }

  /**
   * 获取所有依赖
   */
  getDependencies(): Dependency[] {
    return [...this.dependencies];
  }

  /**
   * 按主题获取依赖
   */
  getDependenciesByTopic(topic: string): Dependency[] {
    return this.dependencies.filter(d => d.topic === topic);
  }

  // ===== 消息操作 =====

  /**
   * 订阅其他支流
   */
  subscribeTo(targetBranch: string, topics: string[]): void {
    this.subscriptions.add(targetBranch);

    if (this.messageBus) {
      this.messageBus.subscribe({
        subscriber: this.id,
        publisher: targetBranch,
        topics,
      });
    }
  }

  /**
   * 取消订阅
   */
  unsubscribeFrom(targetBranch: string): void {
    this.subscriptions.delete(targetBranch);

    if (this.messageBus) {
      this.messageBus.unsubscribe(this.id, targetBranch);
    }
  }

  /**
   * 注册消息回调
   */
  onMessage(callback: (msg: BranchMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * 移除消息回调
   */
  offMessage(callback: (msg: BranchMessage) => void): void {
    const index = this.messageCallbacks.indexOf(callback);
    if (index >= 0) {
      this.messageCallbacks.splice(index, 1);
    }
  }

  /**
   * 接收消息
   */
  receiveMessage(message: BranchMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (err) {
        console.error('Message callback error:', err);
      }
    }
  }

  /**
   * 发送消息
   */
  sendMessage(message: Omit<BranchMessage, 'id' | 'timestamp' | 'from'>): void {
    if (!this.messageBus) {
      throw new Error('MessageBus not configured for this branch');
    }

    this.messageBus.send({
      ...message,
      from: this.id,
    });
  }

  /**
   * 广播消息
   */
  broadcast(topic: string, payload: any, priority: BranchMessage['priority'] = 'normal'): void {
    if (!this.messageBus) {
      throw new Error('MessageBus not configured for this branch');
    }

    this.messageBus.broadcast({
      from: this.id,
      topic,
      type: 'decision',
      payload,
      priority,
    });
  }

  /**
   * 获取相关决策
   */
  getRelatedDecisions(topic?: string): Decision[] {
    if (!topic) return this.decisions;
    return this.decisions.filter(d => d.topic === topic);
  }

  /**
   * 获取指定状态的决策
   */
  getDecisionsByStatus(status: Decision['status']): Decision[] {
    return this.decisions.filter(d => d.status === status);
  }

  /**
   * 更新决策状态
   */
  updateDecisionStatus(decisionId: string, status: Decision['status']): void {
    const decision = this.decisions.find(d => d.id === decisionId);
    if (decision) {
      decision.status = status;
    }
  }

  /**
   * 更新状态
   */
  setStatus(status: Branch['status']): void {
    this.status = status;
  }

  /**
   * 获取支流摘要信息
   */
  getSummary(): {
    id: string;
    name: string;
    role: string;
    status: string;
    memoriesCount: number;
    decisionsCount: number;
    dependenciesCount: number;
    subscriptionsCount: number;
  } {
    let memoriesCount = 0;
    for (const chunks of this.memoryPool.values()) {
      memoriesCount += chunks.length;
    }

    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status: this.status,
      memoriesCount,
      decisionsCount: this.decisions.length,
      dependenciesCount: this.dependencies.length,
      subscriptionsCount: this.subscriptions.size,
    };
  }

  /**
   * 清空数据（用于测试）
   */
  clear(): void {
    this.memoryPool.clear();
    this.decisions = [];
    this.dependencies = [];
    this.messageCallbacks = [];
  }
}
