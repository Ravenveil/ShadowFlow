import type {
  RiverNetworkAccess, MainFlow, Branch, BranchConfig, SyncPoint, SyncPointConfig,
  Decision, Dependency, Conflict, BranchMessage, Subscription, MergeResult, SyncResult, DependencyStatus, ConflictDetectionOptions
} from '../types/memory';
import { BranchImpl } from './branch';
import { SyncPointImpl } from './sync-point';
import { MainFlowImpl } from './main-flow';
import { MessageBus } from './message-bus';
import { ConflictDetector, ConflictContext } from './conflict-detector';

/**
 * 河网实现
 * 管理主流、支流和同步点
 */
export class RiverNetwork implements RiverNetworkAccess {
  private mainFlow: MainFlowImpl;
  private messageBus: MessageBus;
  private conflictDetector: ConflictDetector;
  private branches: Map<string, BranchImpl> = new Map();
  private syncPoints: Map<string, SyncPointImpl> = new Map();
  private subscriptions: Subscription[] = [];
  private currentBranchId?: string;

  constructor() {
    this.mainFlow = new MainFlowImpl();
    this.messageBus = new MessageBus();
    this.conflictDetector = new ConflictDetector();
  }

  // ===== 主流操作 =====

  getMainFlow(): MainFlow {
    return this.mainFlow;
  }

  broadcast(message: Omit<BranchMessage, 'id' | 'timestamp'>): void {
    this.messageBus.broadcast(message);
  }

  // ===== 支流操作 =====

  createBranch(config: BranchConfig): Branch {
    const branch = new BranchImpl(config, this.messageBus);
    this.branches.set(branch.id, branch);

    // 自动订阅消息总线
    this.messageBus.onMessage(branch.id, (msg) => branch.receiveMessage(msg));

    // 如果配置了初始订阅，自动建立订阅关系
    if (config.subscribeTo) {
      for (const targetBranch of config.subscribeTo) {
        this.messageBus.subscribe({
          subscriber: branch.id,
          publisher: targetBranch,
          topics: ['decision', 'dependency', 'conflict'],
        });
      }
    }

    return branch;
  }

  getBranch(branchId: string): Branch | undefined {
    return this.branches.get(branchId);
  }

  listBranches(): Branch[] {
    return Array.from(this.branches.values());
  }

  switchToBranch(branchId: string): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    this.currentBranchId = branchId;
  }

  mergeBranch(branchId: string): MergeResult {
    const branch = this.branches.get(branchId);
    if (!branch) {
      return { success: false, error: 'Branch not found' };
    }

    // 检查是否有未解决的依赖
    const dependencies = this.checkDependencies(branchId);
    const blockedDeps = dependencies.filter(d => d.status !== 'satisfied');
    if (blockedDeps.length > 0) {
      return {
        success: false,
        error: `Cannot merge: ${blockedDeps.length} unsatisfied dependencies`,
      };
    }

    // 将支流记忆合并到主流
    const memories = branch.drink();
    for (const memory of memories) {
      this.mainFlow.addMemory(memory);
    }

    branch.setStatus('merged');

    // 广播合并消息
    this.broadcast({
      from: 'system',
      to: 'broadcast',
      topic: 'branch-merged',
      type: 'decision',
      payload: { branchId, memoriesCount: memories.length },
      priority: 'normal',
    });

    return { success: true, mergedCount: memories.length };
  }

  abandonBranch(branchId: string, reason: string): void {
    const branch = this.branches.get(branchId);
    if (branch) {
      branch.setStatus('abandoned');

      // 取消所有相关订阅
      this.messageBus.unsubscribe(branchId);

      // 广播废弃消息
      this.broadcast({
        from: 'system',
        to: 'broadcast',
        topic: 'branch-abandoned',
        type: 'decision',
        payload: { branchId, reason },
        priority: 'normal',
      });
    }
  }

  // ===== 同步点操作 =====

  createSyncPoint(config: SyncPointConfig): SyncPoint {
    const syncPoint = new SyncPointImpl(config, this.conflictDetector);
    this.syncPoints.set(syncPoint.id, syncPoint);
    return syncPoint;
  }

  getSyncPoint(syncPointId: string): SyncPoint | undefined {
    return this.syncPoints.get(syncPointId);
  }

  joinSyncPoint(syncPointId: string, branchId: string): void {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (syncPoint && !syncPoint.participants.includes(branchId)) {
      syncPoint.participants.push(branchId);
    }
  }

  async triggerSync(syncPointId: string): Promise<SyncResult> {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      return { success: false, error: 'SyncPoint not found' };
    }

    // 收集所有参与者的决策
    for (const branchId of syncPoint.participants) {
      const branch = this.branches.get(branchId);
      if (branch) {
        for (const decision of branch.getRelatedDecisions()) {
          syncPoint.addDecision(decision);
        }

        // 收集依赖
        // (BranchImpl 需要暴露依赖列表)
      }
    }

    // 执行同步
    const result = await syncPoint.sync();

    // 广播同步结果
    this.broadcast({
      from: 'system',
      to: 'broadcast',
      topic: 'sync-completed',
      type: 'sync-response',
      payload: {
        syncPointId,
        success: result.success,
        conflictsCount: result.conflicts.length,
      },
      priority: result.conflicts.length > 0 ? 'high' : 'normal',
    });

    return {
      success: result.success,
      conflicts: result.conflicts,
      agreement: result.agreement,
    };
  }

  getRelatedSyncPoints(branchId: string): SyncPoint[] {
    return Array.from(this.syncPoints.values())
      .filter(sp => sp.participants.includes(branchId));
  }

  // ===== 决策与依赖 =====

  publishDecision(branchId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Decision {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    const fullDecision = branch.publishDecision(decision);

    // 广播决策
    this.broadcast({
      from: branchId,
      to: 'broadcast',
      topic: decision.topic,
      type: 'decision',
      payload: decision.content,
      priority: 'normal',
    });

    return fullDecision;
  }

  declareDependency(branchId: string, dependency: Omit<Dependency, 'id'>): Dependency {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    const fullDependency = branch.declareDependency(
      dependency.dependsOn,
      dependency.topic,
      dependency.required
    );

    // 通知被依赖方
    this.broadcast({
      from: branchId,
      to: dependency.dependsOn,
      topic: 'dependency',
      type: 'dependency',
      payload: {
        from: branchId,
        topic: dependency.topic,
        required: dependency.required,
      },
      priority: dependency.required ? 'high' : 'normal',
    });

    return fullDependency;
  }

  checkDependencies(branchId: string): DependencyStatus[] {
    const branch = this.branches.get(branchId);
    if (!branch) {
      return [];
    }

    const dependencies = branch['getDependencies']() as Dependency[];
    const results: DependencyStatus[] = [];

    for (const dep of dependencies) {
      const targetBranch = this.branches.get(dep.dependsOn);
      let status = 'pending';

      if (!targetBranch) {
        status = 'blocked';
      } else {
        // 检查目标支流是否已做出相关决策
        const targetDecisions = targetBranch.getRelatedDecisions(dep.topic);
        if (targetDecisions.length > 0) {
          // 检查决策是否被接受
          const accepted = targetDecisions.some(d => d.status === 'accepted');
          status = accepted ? 'satisfied' : 'pending';
        }
      }

      results.push({
        dependency: dep,
        status,
      });
    }

    return results;
  }

  // ===== 冲突管理 =====

  detectConflicts(options?: ConflictDetectionOptions): Conflict[] {
    // 收集所有决策和依赖
    const allDecisions: Decision[] = [];
    const allDependencies: Dependency[] = [];
    const branches = new Set<string>();

    for (const [branchId, branch] of this.branches.entries()) {
      branches.add(branchId);
      allDecisions.push(...branch.getRelatedDecisions());
      allDependencies.push(...(branch['getDependencies']?.() as Dependency[] || []));

      // 应用过滤条件
      if (options?.branches && !options.branches.includes(branchId)) {
        continue;
      }
    }

    const context: ConflictContext = {
      decisions: options?.topics
        ? allDecisions.filter(d => options.topics!.includes(d.topic))
        : allDecisions,
      dependencies: allDependencies,
      branches,
    };

    const conflicts = this.conflictDetector.detect(context);

    return options?.branches
      ? conflicts.filter(c => c.parties.some(p => options.branches!.includes(p)))
      : conflicts;
  }

  resolveConflict(conflictId: string, resolution: Conflict['resolution']): void {
    for (const syncPoint of this.syncPoints.values()) {
      if (syncPoint.resolveConflict(conflictId, resolution)) {
        // 广播冲突解决消息
        this.broadcast({
          from: 'system',
          to: 'broadcast',
          topic: 'conflict-resolved',
          type: 'conflict',
          payload: { conflictId, strategy: resolution.strategy },
          priority: 'normal',
        });
        return;
      }
    }
  }

  getUnresolvedConflicts(): Conflict[] {
    const unresolved: Conflict[] = [];
    for (const syncPoint of this.syncPoints.values()) {
      unresolved.push(...syncPoint['conflicts'].filter(c => c.status !== 'resolved'));
    }
    return unresolved;
  }

  // ===== 订阅与消息 =====

  subscribe(subscription: Subscription): void {
    this.subscriptions.push(subscription);
    this.messageBus.subscribe(subscription);
  }

  unsubscribe(subscriber: string, publisher?: string, topic?: string): void {
    this.subscriptions = this.subscriptions.filter(
      s => !(s.subscriber === subscriber && (!publisher || s.publisher === publisher))
    );
    this.messageBus.unsubscribe(subscriber, publisher, topic);
  }

  sendMessage(message: Omit<BranchMessage, 'id' | 'timestamp'>): void {
    this.messageBus.send(message);
  }

  onMessage(branchId: string, callback: (msg: BranchMessage) => void): void {
    this.messageBus.onMessage(branchId, callback);
  }

  async query(branchId: string, targetBranch: string, topic: string, query: any): Promise<any> {
    const target = this.branches.get(targetBranch);
    if (!target) {
      throw new Error(`Target branch not found: ${targetBranch}`);
    }

    // 发送查询请求
    const queryId = `query-${Date.now()}`;
    const responsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageBus.offMessage(branchId, handler);
        reject(new Error('Query timeout'));
      }, 30000);

      const handler = (msg: BranchMessage) => {
        if (msg.topic === topic && msg.payload?.queryId === queryId) {
          clearTimeout(timeout);
          this.messageBus.offMessage(branchId, handler);
          resolve(msg.payload.response);
        }
      };

      this.messageBus.onMessage(branchId, handler);
    });

    // 发送查询
    this.messageBus.send({
      from: branchId,
      to: targetBranch,
      topic,
      type: 'query',
      payload: { queryId, query },
      priority: 'normal',
    });

    return responsePromise;
  }

  // ===== 系统管理 =====

  /**
   * 获取消息总线实例（用于高级操作）
   */
  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  /**
   * 获取冲突检测器实例（用于高级操作）
   */
  getConflictDetector(): ConflictDetector {
    return this.conflictDetector;
  }

  /**
   * 清空所有数据（用于测试）
   */
  clear(): void {
    this.mainFlow.clear();
    this.messageBus.clear();
    this.branches.clear();
    this.syncPoints.clear();
    this.subscriptions = [];
    this.currentBranchId = undefined;
  }
}

/**
 * 创建河网实例
 */
export function createRiverNetwork(): RiverNetwork {
  return new RiverNetwork();
}
