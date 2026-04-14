/**
 * 河网同步系统集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RiverNetwork } from '../memory/river-network';
import type {
  BranchConfig,
  SyncPointConfig,
  Decision,
  Dependency,
  Conflict,
  BranchMessage,
} from '../types/memory';

describe('River Network - Branch (支流）', () => {
  let network: RiverNetwork;

  beforeEach(() => {
    network = new RiverNetwork();
  });

  afterEach(() => {
    network.clear();
  });

  describe('Branch Creation', () => {
    it('should create a branch with valid config', () => {
      const config: BranchConfig = {
        name: 'frontend',
        role: 'dev',
        responsibilities: ['UI组件', '页面逻辑'],
        subscribeTo: ['backend'],
      };

      const branch = network.createBranch(config);

      expect(branch).toBeDefined();
      expect(branch.id).toBeDefined();
      expect(branch.name).toBe('frontend');
      expect(branch.role).toBe('dev');
      expect(branch.status).toBe('active');
      expect(branch.responsibilities).toEqual(['UI组件', '页面逻辑']);
    });

    it('should retrieve created branch', () => {
      const config: BranchConfig = {
        name: 'backend',
        role: 'dev',
        responsibilities: ['API接口', '业务逻辑'],
      };

      const branch = network.createBranch(config);
      const retrieved = network.getBranch(branch.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(branch.id);
      expect(retrieved?.name).toBe('backend');
    });

    it('should list all branches', () => {
      network.createBranch({ name: 'branch1', role: 'dev', responsibilities: [] });
      network.createBranch({ name: 'branch2', role: 'dev', responsibilities: [] });
      network.createBranch({ name: 'branch3', role: 'dev', responsibilities: [] });

      const branches = network.listBranches();

      expect(branches).toHaveLength(3);
      expect(branches.every(b => b.role === 'dev')).toBe(true);
    });

    it('should handle duplicate branch IDs', () => {
      const config: BranchConfig = {
        id: 'duplicate-id',
        name: 'test',
        role: 'dev',
        responsibilities: [],
      };

      const branch1 = network.createBranch(config);
      const branch2 = network.createBranch(config);

      expect(branch1.id).toBe(branch2.id);
    });
  });

  describe('Branch Memory Operations', () => {
    let branch: any;

    beforeEach(() => {
      branch = network.createBranch({
        name: 'test-branch',
        role: 'dev',
        responsibilities: [],
      });
    });

    it('should pour (write) memories', () => {
      branch.pour({
        type: 'context',
        content: { message: 'Hello, World!' },
        metadata: { importance: 0.8 },
      });

      const memories = branch.drink('context');
      expect(memories).toHaveLength(1);
      expect(memories[0].content).toEqual({ message: 'Hello, World!' });
    });

    it('should drink (read) memories by type', () => {
      branch.pour({ type: 'context', content: { type: 'context' }, metadata: {} });
      branch.pour({ type: 'execution', content: { type: 'execution' }, metadata: {} });
      branch.pour({ type: 'knowledge', content: { type: 'working' }, metadata: {} });

      const contextMemories = branch.drink('context');
      const executionMemories = branch.drink('execution');
      const allMemories = branch.drink();

      expect(contextMemories).toHaveLength(1);
      expect(executionMemories).toHaveLength(1);
      expect(allMemories).toHaveLength(3);
    });

    it('should scoop memories with filters', () => {
      branch.pour({ type: 'context', content: { source: 'node-a' }, metadata: {} });
      branch.pour({ type: 'context', content: { source: 'node-b' }, metadata: {} });
      branch.pour({ type: 'execution', content: { source: 'node-a' }, metadata: {} });

      const fromNodeA = branch.scoop({ sourceNode: 'node-a' });
      const onlyContext = branch.scoop({ type: 'context' });

      expect(fromNodeA).toHaveLength(2);
      expect(onlyContext).toHaveLength(2);
    });

    it('should settle (record learned) patterns', () => {
      branch.settle({
        type: 'success-pattern',
        content: { pattern: 'test-pattern' },
        reason: 'Testing settle',
      });

      const memories = branch.drink('knowledge');
      expect(memories).toHaveLength(1);
      expect(memories[0].content.isSettled).toBe(true);
      expect(memories[0].content.pattern).toBe('test-pattern');
    });
  });

  describe('Branch Data Isolation', () => {
    it('should maintain separate memory pools per branch', () => {
      const branch1 = network.createBranch({
        name: 'branch1',
        role: 'dev',
        responsibilities: [],
      });

      const branch2 = network.createBranch({
        name: 'branch2',
        role: 'dev',
        responsibilities: [],
      });

      // Write different memories
      branch1.pour({ type: 'context', content: { branch: 'branch1' }, metadata: {} });
      branch2.pour({ type: 'context', content: { branch: 'branch2' }, metadata: {} });

      // Verify isolation
      const branch1Memories = branch1.drink('context');
      const branch2Memories = branch2.drink('context');

      expect(branch1Memories).toHaveLength(1);
      expect(branch2Memories).toHaveLength(1);
      expect(branch1Memories[0].content.branch).toBe('branch1');
      expect(branch2Memories[0].content.branch).toBe('branch2');
    });

    it('should not share decisions between branches', () => {
      const branch1 = network.createBranch({
        name: 'branch1',
        role: 'dev',
        responsibilities: [],
      });

      const branch2 = network.createBranch({
        name: 'branch2',
        role: 'dev',
        responsibilities: [],
      });

      branch1.publishDecision({
        agent: 'dev',
        topic: 'test',
        content: { decision: 'branch1' },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: 'test',
        content: { decision: 'branch2' },
        impact: [],
      });

      const branch1Decisions = branch1.getRelatedDecisions('test');
      const branch2Decisions = branch2.getRelatedDecisions('test');

      expect(branch1Decisions).toHaveLength(1);
      expect(branch2Decisions).toHaveLength(1);
      expect(branch1Decisions[0].content.decision).toBe('branch1');
      expect(branch2Decisions[0].content.decision).toBe('branch2');
    });
  });

  describe('Branch Status Management', () => {
    let branch: any;

    beforeEach(() => {
      branch = network.createBranch({
        name: 'test-branch',
        role: 'dev',
        responsibilities: [],
      });
    });

    it('should update branch status', () => {
      expect(branch.status).toBe('active');

      branch.setStatus('paused');
      expect(branch.status).toBe('paused');

      branch.setStatus('merged');
      expect(branch.status).toBe('merged');

      branch.setStatus('abandoned');
      expect(branch.status).toBe('abandoned');
    });

    it('should handle all status values', () => {
      const statuses = ['active', 'paused', 'merged', 'abandoned'];

      for (const status of statuses) {
        branch.setStatus(status);
        expect(branch.status).toBe(status);
      }
    });
  });

  describe('Branch Merge', () => {
    let branch: any;

    beforeEach(() => {
      branch = network.createBranch({
        name: 'test-branch',
        role: 'dev',
        responsibilities: [],
      });
    });

    it('should merge branch memories to main flow', () => {
      // Add memories to branch
      branch.pour({ type: 'context', content: { test: 'data1' }, metadata: {} });
      branch.pour({ type: 'execution', content: { test: 'data2' }, metadata: {} });
      branch.pour({ type: 'knowledge', content: { test: 'data3' }, metadata: {} });

      // Merge branch
      const result = network.mergeBranch(branch.id);

      expect(result.success).toBe(true);
      expect(result.mergedCount).toBe(3);
      expect(branch.status).toBe('merged');

      // Verify main flow has the memories
      const mainFlow = network.getMainFlow();
      const mainMemories = mainFlow.getMemories();
      expect(mainMemories).toHaveLength(3);
    });

    it('should not merge non-existent branch', () => {
      const result = network.mergeBranch('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Branch not found');
    });

    it('should abandon branch with reason', () => {
      network.abandonBranch(branch.id, 'Testing abandonment');

      expect(branch.status).toBe('abandoned');

      const retrieved = network.getBranch(branch.id);
      expect(retrieved?.status).toBe('abandoned');
    });
  });
});

describe('River Network - SyncPoint (同步点）', () => {
  let network: RiverNetwork;
  let branch1: any;
  let branch2: any;

  beforeEach(() => {
    network = new RiverNetwork();
    branch1 = network.createBranch({
      name: 'frontend',
      role: 'dev',
      responsibilities: ['UI开发'],
    });
    branch2 = network.createBranch({
      name: 'backend',
      role: 'dev',
      responsibilities: ['API开发'],
    });
  });

  afterEach(() => {
    network.clear();
  });

  describe('SyncPoint Creation', () => {
    it('should create a sync point with valid config', () => {
      const config: SyncPointConfig = {
        name: 'api-sync',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: {
          type: 'event-based',
          condition: 'api-decision-made',
        },
      };

      const syncPoint = network.createSyncPoint(config);

      expect(syncPoint).toBeDefined();
      expect(syncPoint.id).toBeDefined();
      expect(syncPoint.name).toBe('api-sync');
      expect(syncPoint.type).toBe('decision');
      expect(syncPoint.participants).toHaveLength(2);
      expect(syncPoint.status).toBe('pending');
    });

    it('should retrieve created sync point', () => {
      const config: SyncPointConfig = {
        name: 'test-sync',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      };

      const syncPoint = network.createSyncPoint(config);
      const retrieved = network.getSyncPoint(syncPoint.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(syncPoint.id);
      expect(retrieved?.name).toBe('test-sync');
    });
  });

  describe('SyncPoint Participants', () => {
    it('should add participant to sync point', () => {
      const syncPoint = network.createSyncPoint({
        name: 'test-sync',
        type: 'decision',
        participants: [branch1.id],
        trigger: { type: 'manual' },
      });

      expect(syncPoint.participants).toHaveLength(1);

      network.joinSyncPoint(syncPoint.id, branch2.id);

      expect(syncPoint.participants).toHaveLength(2);
      expect(syncPoint.participants).toContain(branch2.id);
    });

    it('should not add duplicate participant', () => {
      const syncPoint = network.createSyncPoint({
        name: 'test-sync',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      network.joinSyncPoint(syncPoint.id, branch1.id);

      expect(syncPoint.participants).toHaveLength(2);
    });

    it('should get related sync points for branch', () => {
      network.createSyncPoint({
        name: 'sync1',
        type: 'decision',
        participants: [branch1.id],
        trigger: { type: 'manual' },
      });

      network.createSyncPoint({
        name: 'sync2',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      network.createSyncPoint({
        name: 'sync3',
        type: 'decision',
        participants: [branch2.id],
        trigger: { type: 'manual' },
      });

      const relatedToBranch1 = network.getRelatedSyncPoints(branch1.id);
      const relatedToBranch2 = network.getRelatedSyncPoints(branch2.id);

      expect(relatedToBranch1).toHaveLength(2);
      expect(relatedToBranch2).toHaveLength(3);
    });
  });

  describe('SyncPoint Conflict Detection', () => {
    it('should detect semantic conflicts', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'api-conflict-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      // Add conflicting decisions
      branch1.publishDecision({
        agent: 'dev',
        topic: 'API接口定义',
        content: {
          endpoint: '/api/users',
          method: 'GET',
          response: 'User[]',
        },
        impact: [branch2.id],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: 'API接口定义',
        content: {
          endpoint: '/api/users',
          method: 'POST',
          response: 'User',
        },
        impact: [branch1.id],
      });

      // Trigger sync and detect conflicts
      const result = await network.triggerSync(syncPoint.id);

      expect(result.success).toBe(false); // Should have conflicts
      expect(result.conflicts.length).toBeGreaterThan(0);

      const conflict = result.conflicts[0];
      expect(conflict.type).toBe('semantic-conflict');
      expect(conflict.status).toBe('resolved'); // Auto-resolved
      expect(conflict.resolution?.strategy).toBe('auto');
    });

    it('should detect type mismatch conflicts', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'type-mismatch-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      // Add type mismatch decisions
      branch1.publishDecision({
        agent: 'dev',
        topic: '数据类型',
        content: {
          field: 'userId',
          type: 'number',
        },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: '数据类型',
        content: {
          field: 'userId',
          type: 'string',
        },
        impact: [],
      });

      const result = await network.triggerSync(syncPoint.id);

      expect(result.conflicts.length).toBeGreaterThan(0);

      const conflict = result.conflicts.find((c: Conflict) => c.type === 'type-mismatch');
      expect(conflict).toBeDefined();
      if (conflict) {
        expect(conflict.details.field).toBe('userId');
        expect(conflict.details.frontendType).toBeDefined();
        expect(conflict.details.backendType).toBeDefined();
      }
    });

    it('should detect naming collisions', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'naming-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      branch1.publishDecision({
        agent: 'dev',
        topic: '命名决策',
        content: {
          name: 'User',
          meaning: 'System user entity',
        },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: '命名决策',
        content: {
          name: 'User',
          meaning: 'User profile entity',
        },
        impact: [],
      });

      const result = await network.triggerSync(syncPoint.id);

      const conflict = result.conflicts.find((c: Conflict) => c.type === 'naming-collision');
      expect(conflict).toBeDefined();
      if (conflict) {
        expect(conflict.details.name).toBe('User');
        expect(conflict.details.definitions).toHaveLength(2);
      }
    });
  });

  describe('SyncPoint Conflict Resolution', () => {
    it('should auto-resolve semantic conflicts', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'auto-resolve-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      // Add conflicting decisions with priority
      branch1.publishDecision({
        agent: 'dev',
        topic: 'API格式',
        content: { format: 'JSON' },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: 'API格式',
        content: { format: 'XML' },
        impact: [],
      });

      const result = await network.triggerSync(syncPoint.id);

      // Should auto-resolve and reach consensus
      expect(result.conflicts.length).toBeGreaterThan(0);
      const unresolved = result.conflicts.filter((c: Conflict) => c.status !== 'resolved');
      expect(unresolved).toHaveLength(0);
    });

    it('should manually resolve conflicts', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'manual-resolve-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      branch1.publishDecision({
        agent: 'dev',
        topic: 'test',
        content: { choice: 'A' },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: 'test',
        content: { choice: 'B' },
        impact: [],
      });

      const result = await network.triggerSync(syncPoint.id);

      // Get the conflict
      const conflict = result.conflicts[0];
      expect(conflict).toBeDefined();

      // Manually resolve
      network.resolveConflict(conflict.id, {
        strategy: 'negotiate',
        result: { action: 'use-choice-A' },
        resolvedAt: new Date(),
      });

      // Verify resolution
      const updatedConflict = result.conflicts[0];
      expect(updatedConflict.resolution?.result.action).toBe('use-choice-A');
    });

    it('should reach consensus after resolving all conflicts', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'consensus-test',
        type: 'decision',
        participants: [branch1.id, branch2.id],
        trigger: { type: 'manual' },
      });

      branch1.publishDecision({
        agent: 'dev',
        topic: '决策主题',
        content: { proposal: 'Proposal 1' },
        impact: [],
      });

      branch2.publishDecision({
        agent: 'dev',
        topic: '决策主题',
        content: { proposal: 'Proposal 1' }, // Same content - no conflict
        impact: [],
      });

      const result = await network.triggerSync(syncPoint.id);

      expect(result.success).toBe(true);
      expect(result.agreement).toBeDefined();
      if (result.agreement) {
        expect(result.agreement.decisions).toHaveLength(2);
        expect(result.agreement.reachedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('SyncPoint Status and Lifecycle', () => {
    it('should track sync point status transitions', async () => {
      const syncPoint = network.createSyncPoint({
        name: 'lifecycle-test',
        type: 'decision',
        participants: [branch1.id],
        trigger: { type: 'manual' },
      });

      expect(syncPoint.status).toBe('pending');

      await network.triggerSync(syncPoint.id);

      expect(syncPoint.status).toBe('resolved');
      expect(syncPoint.lastSyncAt).toBeDefined();
    });

    it('should fail sync for non-existent sync point', async () => {
      const result = await network.triggerSync('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SyncPoint not found');
    });
  });
});

describe('River Network - Decision and Dependency (决策与依赖）', () => {
  let network: RiverNetwork;
  let branch1: any;
  let branch2: any;

  beforeEach(() => {
    network = new RiverNetwork();
    branch1 = network.createBranch({
      name: 'frontend',
      role: 'dev',
      responsibilities: ['UI开发'],
      subscribeTo: ['backend'],
    });
    branch2 = network.createBranch({
      name: 'backend',
      role: 'dev',
      responsibilities: ['API开发'],
    });
  });

  afterEach(() => {
    network.clear();
  });

  describe('Decision Publishing', () => {
    it('should publish decision and store in branch', () => {
      const decision = network.publishDecision(branch1.id, {
        agent: 'dev',
        topic: '技术栈选择',
        content: { framework: 'React', language: 'TypeScript' },
        impact: [],
      });

      expect(decision).toBeDefined();
      expect(decision.id).toBeDefined();
      expect(decision.branch).toBe(branch1.id);
      expect(decision.topic).toBe('技术栈选择');
      expect(decision.content.framework).toBe('React');

      const retrieved = branch1.getRelatedDecisions('技术栈选择');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toEqual(decision);
    });
  });

  describe('Dependency Declaration', () => {
    it('should declare dependency on another branch', () => {
      const dependency = network.declareDependency(branch1.id, {
        agent: 'dev',
        branch: branch1.id,
        dependsOn: branch2.id,
        topic: 'API接口定义',
        required: true,
        status: 'pending',
      });

      expect(dependency).toBeDefined();
      expect(dependency.branch).toBe(branch1.id);
      expect(dependency.dependsOn).toBe(branch2.id);
      expect(dependency.topic).toBe('API接口定义');
      expect(dependency.required).toBe(true);
    });

    it('should check dependency status', () => {
      network.declareDependency(branch1.id, {
        agent: 'dev',
        branch: branch1.id,
        dependsOn: branch2.id,
        topic: 'API定义',
        required: true,
        status: 'pending',
      });

      const status = network.checkDependencies(branch1.id);

      expect(status.length).toBeGreaterThan(0);
      expect(status[0].dependency.topic).toBe('API定义');
    });
  });
});

describe('River Network - Main Flow and Branch Sync (主流与支流同步）', () => {
  let network: RiverNetwork;
  let branch: any;

  beforeEach(() => {
    network = new RiverNetwork();
    branch = network.createBranch({
      name: 'feature-branch',
      role: 'dev',
      responsibilities: ['Feature development'],
    });
  });

  afterEach(() => {
    network.clear();
  });

  describe('Main Flow Broadcasting', () => {
    it('should add memory to main flow', () => {
      const mainFlow = network.getMainFlow();

      mainFlow.addMemory({
        type: 'global',
        content: { project: 'ShadowFlow' },
      });

      const memories = mainFlow.getMemories();
      expect(memories).toHaveLength(1);
      expect(memories[0].content.project).toBe('ShadowFlow');
    });

    it('should broadcast to all branches', (done) => {
      const branch1 = network.createBranch({
        name: 'b1',
        role: 'dev',
        responsibilities: [],
      });
      const branch2 = network.createBranch({
        name: 'b2',
        role: 'dev',
        responsibilities: [],
      });

      let receivedCount = 0;

      branch1.onMessage(() => receivedCount++ });
      branch2.onMessage(() => receivedCount++ });

      network.getMainFlow().broadcast('Global announcement');

      setTimeout(() => {
        expect(receivedCount).toBe(2);
        done();
      }, 100);
    });
  });

  describe('Data Synchronization', () => {
    it('should merge branch memories to main flow', () => {
      // Add memories to branch
      branch.pour({ type: 'context', content: { source: 'branch' }, metadata: {} });
      branch.pour({ type: 'execution', content: { source: 'branch' }, metadata: {} });

      // Merge
      const result = network.mergeBranch(branch.id);

      expect(result.success).toBe(true);
      expect(result.mergedCount).toBe(2);

      // Verify main flow has merged memories
      const mainFlow = network.getMainFlow();
      const mainMemories = mainFlow.getMemories();
      expect(mainMemories.length).toBeGreaterThanOrEqual(2);
    });

    it('should track merged branch status', () => {
      branch.pour({ type: 'context', content: {}, metadata: {} });

      network.mergeBranch(branch.id);

      const retrieved = network.getBranch(branch.id);
      expect(retrieved?.status).toBe('merged');
    });
  });

  describe('Snapshot and Restore', () => {
    it('should create and restore main flow snapshot', () => {
      const mainFlow = network.getMainFlow();

      // Add some data
      mainFlow.addMemory({ type: 'test', content: { version: 1 } });
      mainFlow.addMemory({ type: 'test', content: { version: 2 } });

      // Create snapshot
      const snapshot = mainFlow.createSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.memories).toHaveLength(2);
      expect(snapshot.timestamp).toBeInstanceOf(Date);

      // Modify state
      mainFlow.addMemory({ type: 'test', content: { version: 3 } });

      expect(mainFlow.getMemories()).toHaveLength(3);

      // Restore snapshot
      mainFlow.restoreSnapshot(snapshot);

      expect(mainFlow.getMemories()).toHaveLength(2);
      expect(mainFlow.getMemories()[0].content.version).toBe(1);
    });
  });
});

describe('River Network - Integration Scenarios (集成场景）', () => {
  let network: RiverNetwork;

  beforeEach(() => {
    network = new RiverNetwork();
  });

  afterEach(() => {
    network.clear();
  });

  it('should simulate frontend-backend collaboration', async () => {
    // Setup
    const mainFlow = network.getMainFlow();
    mainFlow.addMemory({
      type: 'knowledge',
      content: {
        projectType: 'web-app',
        techStack: {
          frontend: { language: 'TypeScript', framework: 'React' },
          backend: { language: 'TypeScript', framework: 'NestJS' },
        },
      },
    });

    const frontend = network.createBranch({
      name: 'frontend',
      role: 'dev',
      responsibilities: ['UI组件', '页面逻辑'],
      subscribeTo: ['backend'],
      syncWith: ['backend'],
    });

    const backend = network.createBranch({
      name: 'backend',
      role: 'dev',
      responsibilities: ['API接口', '业务逻辑'],
      subscribeTo: ['frontend'],
      syncWith: ['frontend'],
    });

    // Frontend declares dependency
    network.declareDependency(frontend.id, {
      agent: 'dev',
      branch: frontend.id,
      dependsOn: backend.id,
      topic: 'API接口定义',
      required: true,
      status: 'pending',
    });

    // Frontend publishes API expectations
    network.publishDecision(frontend.id, {
      agent: 'dev',
      topic: 'API期望',
      content: {
        endpoints: [
          { method: 'GET', path: '/api/users', response: 'User[]' },
          { method: 'POST', path: '/api/users', body: 'CreateUserDTO' },
        ],
      },
      impact: [backend.id],
    });

    // Backend publishes API design
    network.publishDecision(backend.id, {
      agent: 'dev',
      topic: 'API接口定义',
      content: {
        endpoints: [
          {
            method: 'GET',
            path: '/api/users',
            response: { type: 'User[]', fields: ['id', 'name', 'email'] },
          },
          {
            method: 'POST',
            path: '/api/users',
            body: { type: 'CreateUserDTO', fields: ['name', 'email', 'password'] },
          },
        ],
      },
      impact: [frontend.id],
    });

    // Check dependency satisfaction
    const deps = network.checkDependencies(frontend.id);
    const apiDep = deps.find((d: any) => d.dependency.topic === 'API接口定义');

    expect(apiDep).toBeDefined();
    expect(apiDep?.status).toBe('satisfied');

    // Verify both branches have decisions
    const frontendDecisions = frontend.getRelatedDecisions();
    const backendDecisions = backend.getRelatedDecisions();

    expect(frontendDecisions.length).toBeGreaterThan(0);
    expect(backendDecisions.length).toBeGreaterThan(0);
  });

  it('should detect and resolve conflicts in parallel development', async () => {
    const branch1 = network.createBranch({
      name: 'dev1',
      role: 'dev',
      responsibilities: [],
    });

    const branch2 = network.createBranch({
      name: 'dev2',
      role: 'dev',
      responsibilities: [],
    });

    const syncPoint = network.createSyncPoint({
      name: 'conflict-sync',
      type: 'decision',
      participants: [branch1.id, branch2.id],
      trigger: { type: 'manual' },
    });

    // Add conflicting decisions
    network.publishDecision(branch1.id, {
      agent: 'dev',
      topic: '数据模型',
      content: {
        field: 'username',
        type: 'string',
        maxLength: 50,
      },
      impact: [branch2.id],
    });

    network.publishDecision(branch2.id, {
      agent: 'dev',
      topic: '数据模型',
      content: {
        field: 'username',
        type: 'string',
        maxLength: 100,
      },
      impact: [branch1.id],
    });

    // Trigger sync
    const result = await network.triggerSync(syncPoint.id);

    expect(result.conflicts.length).toBeGreaterThan(0);

    // Verify conflict was detected and resolved
    const semanticConflict = result.conflicts.find((c: Conflict) => c.type === 'semantic-conflict');
    expect(semanticConflict).toBeDefined();

    expect(semanticConflict?.status).toBe('resolved');
    expect(semanticConflict?.resolution?.strategy).toBe('auto');
  });

  it('should merge branches after successful sync', async () => {
    const branch1 = network.createBranch({
      name: 'feature-1',
      role: 'dev',
      responsibilities: [],
    });

    const branch2 = network.createBranch({
      name: 'feature-2',
      role: 'dev',
      responsibilities: [],
    });

    const syncPoint = network.createSyncPoint({
      name: 'merge-sync',
      type: 'decision',
      participants: [branch1.id, branch2.id],
      trigger: { type: 'manual' },
    });

    // Add non-conflicting decisions
    network.publishDecision(branch1.id, {
      agent: 'dev',
      topic: '独立任务',
      content: { task: 'A' },
      impact: [],
    });

    network.publishDecision(branch2.id, {
      agent: 'dev',
      topic: '独立任务',
      content: { task: 'B' },
      impact: [],
    });

    // Sync (should succeed)
    const result = await network.triggerSync(syncPoint.id);
    expect(result.success).toBe(true);
    expect(result.agreement).toBeDefined();

    // Merge branches
    const merge1 = network.mergeBranch(branch1.id);
    const merge2 = network.mergeBranch(branch2.id);

    expect(merge1.success).toBe(true);
    expect(merge2.success).toBe(true);

    // Verify both are merged
    const mainFlow = network.getMainFlow();
    const mainMemories = mainFlow.getMemories();
    expect(mainMemories.length).toBeGreaterThanOrEqual(2);
  });
});
