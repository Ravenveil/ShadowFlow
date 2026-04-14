import type { SyncPoint, SyncPointConfig, Decision, Conflict } from '../types/memory';
import type { ConflictDetector, ConflictContext } from './conflict-detector';

// 辅助类型
interface Agreement {
  id: string;
  syncPointId: string;
  decisions: Decision[];
  reachedAt: Date;
}

/**
 * 同步点实现
 * 用于多个支流之间的协调
 */
export class SyncPointImpl implements SyncPoint {
  id: string;
  name: string;
  type: 'decision' | 'milestone' | 'conflict' | 'checkpoint' | 'manual';
  participants: string[];
  trigger: SyncPoint['trigger'];
  payload: SyncPoint['payload'];
  status: SyncPoint['status'];
  createdAt: Date;
  lastSyncAt?: Date;

  private decisions: Decision[] = [];
  private dependencies: any[] = [];
  private conflicts: Conflict[] = [];
  private agreements: Agreement[] = [];
  private conflictDetector: ConflictDetector;

  constructor(config: SyncPointConfig, conflictDetector: ConflictDetector) {
    this.id = config.id ?? `sync-${Date.now()}`;
    this.name = config.name;
    this.type = config.type ?? 'decision';
    this.participants = config.participants;
    this.trigger = config.trigger;
    this.payload = {
      decisions: [],
      dependencies: [],
      conflicts: [],
      agreements: []
    };
    this.status = 'pending';
    this.createdAt = new Date();
    this.conflictDetector = conflictDetector;
  }

  /**
   * 添加决策
   */
  addDecision(decision: Decision): void {
    this.decisions.push(decision);
    this.payload.decisions = this.decisions;
  }

  /**
   * 添加依赖
   */
  addDependency(dependency: any): void {
    this.dependencies.push(dependency);
    this.payload.dependencies = this.dependencies;
  }

  /**
   * 检测冲突
   */
  detectConflicts(): Conflict[] {
    const context: ConflictContext = {
      decisions: this.decisions,
      dependencies: this.dependencies.map((d: any) => ({
        id: d.id,
        agent: d.agent,
        branch: d.branch,
        dependsOn: d.dependsOn,
        topic: d.topic,
        required: d.required,
        status: d.status,
      })),
      branches: new Set(this.participants),
    };

    this.conflicts = this.conflictDetector.detect(context);
    this.payload.conflicts = this.conflicts;

    return this.conflicts;
  }

  /**
   * 解决冲突
   */
  resolveConflict(conflictId: string, resolution: Conflict['resolution']): boolean {
    const conflict = this.conflicts.find(c => c.id === conflictId);
    if (!conflict) return false;

    conflict.resolution = resolution;
    conflict.status = 'resolved';
    return true;
  }

  /**
   * 尝试自动解决所有可自动解决的冲突
   */
  autoResolveConflicts(): Conflict[] {
    const resolved: Conflict[] = [];

    for (const conflict of this.conflicts) {
      if (conflict.status !== 'resolved' && this.conflictDetector.isAutoResolvable(conflict)) {
        const resolution = this.conflictDetector.autoResolve(conflict);
        if (resolution) {
          this.resolveConflict(conflict.id, resolution);
          resolved.push(conflict);
        }
      }
    }

    return resolved;
  }

  /**
   * 达成共识
   */
  reachConsensus(): Agreement | null {
    // 检查是否有未解决的冲突
    const unresolved = this.conflicts.filter(c => c.status !== 'resolved');
    if (unresolved.length > 0) {
      return null;
    }

    // 汇总所有决策
    const agreement: Agreement = {
      id: `agreement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      syncPointId: this.id,
      decisions: this.decisions,
      reachedAt: new Date()
    };

    this.agreements.push(agreement);
    this.payload.agreements = this.agreements;
    this.status = 'resolved';
    this.lastSyncAt = new Date();

    return agreement;
  }

  /**
   * 执行同步
   */
  async sync(): Promise<{ success: boolean; conflicts: Conflict[]; agreement?: Agreement }> {
    this.status = 'syncing';

    // 1. 检测冲突
    const conflicts = this.detectConflicts();

    // 2. 尝试自动解决冲突
    const autoResolved = this.autoResolveConflicts();

    // 3. 达成共识
    const agreement = this.reachConsensus();

    return {
      success: agreement !== null,
      conflicts: this.conflicts,
      agreement
    };
  }

  /**
   * 获取所有冲突
   */
  getConflicts(): Conflict[] {
    return [...this.conflicts];
  }

  /**
   * 获取未解决的冲突
   */
  getUnresolvedConflicts(): Conflict[] {
    return this.conflicts.filter(c => c.status !== 'resolved');
  }

  /**
   * 获取所有决策
   */
  getDecisions(): Decision[] {
    return [...this.decisions];
  }

  /**
   * 获取所有共识
   */
  getAgreements(): Agreement[] {
    return [...this.agreements];
  }

  /**
   * 添加参与者
   */
  addParticipant(branchId: string): void {
    if (!this.participants.includes(branchId)) {
      this.participants.push(branchId);
    }
  }

  /**
   * 移除参与者
   */
  removeParticipant(branchId: string): void {
    const index = this.participants.indexOf(branchId);
    if (index >= 0) {
      this.participants.splice(index, 1);
    }
  }

  /**
   * 重置同步点
   */
  reset(): void {
    this.decisions = [];
    this.dependencies = [];
    this.conflicts = [];
    this.agreements = [];
    this.status = 'pending';
    this.lastSyncAt = undefined;
    this.payload = {
      decisions: [],
      dependencies: [],
      conflicts: [],
      agreements: []
    };
  }

  /**
   * 获取同步点摘要
   */
  getSummary(): {
    id: string;
    name: string;
    type: string;
    status: string;
    participantsCount: number;
    decisionsCount: number;
    conflictsCount: number;
    unresolvedConflictsCount: number;
    agreementsCount: number;
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      participantsCount: this.participants.length,
      decisionsCount: this.decisions.length,
      conflictsCount: this.conflicts.length,
      unresolvedConflictsCount: this.getUnresolvedConflicts().length,
      agreementsCount: this.agreements.length,
    };
  }
}
