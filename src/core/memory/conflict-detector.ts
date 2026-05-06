import type {
  Conflict,
  ConflictType,
  ConflictResolution,
  Decision,
  Dependency,
} from '../types/memory';

/**
 * 冲突规则定义
 */
interface ConflictRule {
  id: string;
  type: ConflictType;
  description: string;
  detector: (context: ConflictContext) => Conflict | null;
  autoResolvable: boolean;
  resolver?: (conflict: Conflict) => ConflictResolution;
}

/**
 * 冲突检测上下文
 */
interface ConflictContext {
  decisions: Decision[];
  dependencies: Dependency[];
  branches: Set<string>;
}

/**
 * 冲突检测器实现
 * 负责检测支流之间的冲突并提供解决策略
 */
export class ConflictDetector {
  private rules: ConflictRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * 注册冲突检测规则
   */
  registerRule(rule: ConflictRule): void {
    this.rules.push(rule);
  }

  /**
   * 移除规则
   */
  unregisterRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  /**
   * 检测冲突
   */
  detect(context: ConflictContext): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const rule of this.rules) {
      const conflict = rule.detector(context);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * 检测特定类型的冲突
   */
  detectByType(context: ConflictContext, type: ConflictType): Conflict[] {
    return this.detect(context).filter(c => c.type === type);
  }

  /**
   * 自动解决冲突
   */
  autoResolve(conflict: Conflict): ConflictResolution | null {
    const rule = this.rules.find(r => r.type === conflict.type);
    if (!rule || !rule.autoResolvable || !rule.resolver) {
      return null;
    }

    return rule.resolver(conflict);
  }

  /**
   * 检查是否可自动解决
   */
  isAutoResolvable(conflict: Conflict): boolean {
    const rule = this.rules.find(r => r.type === conflict.type);
    return rule?.autoResolvable || false;
  }

  /**
   * 注册默认规则
   */
  private registerDefaultRules(): void {
    // 规则1: 类型不匹配
    this.registerRule({
      id: 'type-mismatch',
      type: 'type-mismatch',
      description: '同一字段的类型定义不一致',
      autoResolvable: true,
      detector: (ctx) => this.detectTypeMismatch(ctx),
      resolver: (conflict) => this.resolveTypeMismatch(conflict),
    });

    // 规则2: 命名冲突
    this.registerRule({
      id: 'naming-collision',
      type: 'naming-collision',
      description: '不同支流使用相同名称但含义不同',
      autoResolvable: false,
      detector: (ctx) => this.detectNamingCollision(ctx),
    });

    // 规则3: 依赖循环
    this.registerRule({
      id: 'dependency-cycle',
      type: 'dependency-cycle',
      description: '支流之间存在循环依赖',
      autoResolvable: false,
      detector: (ctx) => this.detectDependencyCycle(ctx),
    });

    // 规则4: 资源冲突
    this.registerRule({
      id: 'resource-conflict',
      type: 'resource-conflict',
      description: '多个支流尝试修改同一资源',
      autoResolvable: true,
      detector: (ctx) => this.detectResourceConflict(ctx),
      resolver: (conflict) => this.resolveResourceConflict(conflict),
    });

    // 规则5: 语义冲突
    this.registerRule({
      id: 'semantic-conflict',
      type: 'semantic-conflict',
      description: '同一主题的决策内容不一致',
      autoResolvable: true,
      detector: (ctx) => this.detectSemanticConflict(ctx),
      resolver: (conflict) => this.resolveSemanticConflict(conflict),
    });
  }

  /**
   * 检测类型不匹配
   */
  private detectTypeMismatch(context: ConflictContext): Conflict | null {
    // 按字段分组决策
    const decisionsByField = new Map<string, Decision[]>();

    for (const decision of context.decisions) {
      if (decision.content?.field && decision.content?.type) {
        const key = decision.content.field;
        if (!decisionsByField.has(key)) {
          decisionsByField.set(key, []);
        }
        decisionsByField.get(key)!.push(decision);
      }
    }

    // 检查同一字段的类型是否一致
    for (const [field, decisions] of decisionsByField) {
      if (decisions.length < 2) continue;

      const types = new Set(decisions.map(d => d.content.type));
      if (types.size > 1) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'type-mismatch',
          parties: decisions.map(d => d.branch),
          details: {
            field,
            definitions: decisions.map(d => ({
              branch: d.branch,
              type: d.content.type,
            })),
          },
          detectedAt: new Date(),
          status: 'detected',
        };
      }
    }

    return null;
  }

  /**
   * 解决类型不匹配
   */
  private resolveTypeMismatch(conflict: Conflict): ConflictResolution {
    // 策略：优先使用后端的类型定义
    const backendDecision = conflict.details.definitions.find((d: any) =>
      d.branch.toLowerCase().includes('backend') || d.branch.toLowerCase().includes('api')
    );

    return {
      strategy: 'auto',
      result: {
        action: 'adopt-backend-type',
        reason: backendDecision
          ? `以后端 (${backendDecision.branch}) 的类型定义为准`
          : '以第一个决策的类型定义为准',
        adoptedType: backendDecision?.type || conflict.details.definitions[0]?.type,
      },
      resolvedAt: new Date(),
    };
  }

  /**
   * 检测命名冲突
   */
  private detectNamingCollision(context: ConflictContext): Conflict | null {
    // 按名称分组决策
    const decisionsByName = new Map<string, Decision[]>();

    for (const decision of context.decisions) {
      if (decision.content?.name) {
        const name = decision.content.name;
        if (!decisionsByName.has(name)) {
          decisionsByName.set(name, []);
        }
        decisionsByName.get(name)!.push(decision);
      }
    }

    // 检查同名但内容不同的决策
    for (const [name, decisions] of decisionsByName) {
      if (decisions.length < 2) continue;

      // 比较内容是否相同
      const contents = decisions.map(d => JSON.stringify(d.content));
      const uniqueContents = new Set(contents);

      if (uniqueContents.size > 1) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'naming-collision',
          parties: decisions.map(d => d.branch),
          details: {
            name,
            definitions: decisions.map(d => ({
              branch: d.branch,
              content: d.content,
            })),
          },
          detectedAt: new Date(),
          status: 'detected',
        };
      }
    }

    return null;
  }

  /**
   * 检测依赖循环
   */
  private detectDependencyCycle(context: ConflictContext): Conflict | null {
    // 构建依赖图
    const graph = new Map<string, Set<string>>();

    for (const dep of context.dependencies) {
      if (!graph.has(dep.branch)) {
        graph.set(dep.branch, new Set());
      }
      graph.get(dep.branch)!.add(dep.dependsOn);
    }

    // 检测循环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const node of context.branches) {
      if (this.hasCycle(node, graph, visited, recursionStack)) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'dependency-cycle',
          parties: Array.from(recursionStack),
          details: {
            cycle: Array.from(recursionStack),
          },
          detectedAt: new Date(),
          status: 'detected',
        };
      }
    }

    return null;
  }

  /**
   * 检测是否有循环依赖
   */
  private hasCycle(
    node: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>,
    stack: Set<string>
  ): boolean {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    stack.add(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (this.hasCycle(neighbor, graph, visited, stack)) {
          return true;
        }
      }
    }

    stack.delete(node);
    return false;
  }

  /**
   * 检测资源冲突
   */
  private detectResourceConflict(context: ConflictContext): Conflict | null {
    // 按资源ID分组决策
    const decisionsByResource = new Map<string, Decision[]>();

    for (const decision of context.decisions) {
      const resourceId = decision.content?.resourceId || decision.content?.id;
      if (resourceId) {
        if (!decisionsByResource.has(resourceId)) {
          decisionsByResource.set(resourceId, []);
        }
        decisionsByResource.get(resourceId)!.push(decision);
      }
    }

    // 检查同一资源的修改决策
    for (const [resourceId, decisions] of decisionsByResource) {
      if (decisions.length < 2) continue;

      // 检查是否有修改操作
      const modifications = decisions.filter(d =>
        decision.content?.action === 'modify' || decision.content?.action === 'delete'
      );

      if (modifications.length > 1) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'resource-conflict',
          parties: modifications.map(d => d.branch),
          details: {
            resourceId,
            actions: modifications.map(d => ({
              branch: d.branch,
              action: d.content.action,
            })),
          },
          detectedAt: new Date(),
          status: 'detected',
        };
      }
    }

    return null;
  }

  /**
   * 解决资源冲突
   */
  private resolveResourceConflict(conflict: Conflict): ConflictResolution {
    // 策略：优先保留后创建的决策（假设更新更合理）
    return {
      strategy: 'auto',
      result: {
        action: 'keep-newest',
        reason: '保留最新决策的内容',
      },
      resolvedAt: new Date(),
    };
  }

  /**
   * 检测语义冲突
   */
  private detectSemanticConflict(context: ConflictContext): Conflict | null {
    // 按主题分组决策
    const decisionsByTopic = new Map<string, Decision[]>();

    for (const decision of context.decisions) {
      if (!decisionsByTopic.has(decision.topic)) {
        decisionsByTopic.set(decision.topic, []);
      }
      decisionsByTopic.get(decision.topic)!.push(decision);
    }

    // 检查同一主题的决策内容是否一致
    for (const [topic, decisions] of decisionsByTopic) {
      if (decisions.length < 2) continue;

      // 比较内容是否相同
      const contents = decisions.map(d => JSON.stringify(d.content));
      const uniqueContents = new Set(contents);

      if (uniqueContents.size > 1) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'semantic-conflict',
          parties: decisions.map(d => d.branch),
          details: {
            topic,
            proposals: decisions.map(d => ({
              branch: d.branch,
              content: d.content,
            })),
          },
          detectedAt: new Date(),
          status: 'detected',
        };
      }
    }

    return null;
  }

  /**
   * 解决语义冲突
   */
  private resolveSemanticConflict(conflict: Conflict): ConflictResolution {
    // 策略：按优先级选择（优先考虑后端/核心分支）
    const proposals = conflict.details.proposals as Array<{ branch: string; content: any }>;

    let selectedProposal = proposals[0];
    for (const proposal of proposals) {
      const branch = proposal.branch.toLowerCase();
      if (
        branch.includes('backend') ||
        branch.includes('core') ||
        branch.includes('api') ||
        branch.includes('main')
      ) {
        selectedProposal = proposal;
        break;
      }
    }

    return {
      strategy: 'auto',
      result: {
        action: 'use-highest-priority',
        selectedBranch: selectedProposal.branch,
        selectedContent: selectedProposal.content,
      },
      resolvedAt: new Date(),
    };
  }

  /**
   * 获取所有规则
   */
  getRules(): ConflictRule[] {
    return [...this.rules];
  }

  /**
   * 获取指定类型的规则
   */
  getRuleByType(type: ConflictType): ConflictRule | undefined {
    return this.rules.find(r => r.type === type);
  }

  /**
   * 清空所有规则
   */
  clearRules(): void {
    this.rules = [];
  }
}

/**
 * 创建冲突检测器实例
 */
export function createConflictDetector(): ConflictDetector {
  return new ConflictDetector();
}
