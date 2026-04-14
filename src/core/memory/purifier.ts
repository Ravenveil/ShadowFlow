/**
 * 自净化层（Purifier）
 *
 * 参考 Mem0 的自改进引擎实现，为河流式记忆系统提供：
 * - 冲突检测与解决
 * - 重复合并（语义相似度检测）
 * - 衰减机制（重要性衰减）
 * - 重要性评分动态更新
 *
 * @module memory/purifier
 */

import {
  IMemoryChunk,
  IMemorySnapshot,
  MemoryType,
} from '../types/memory';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 冲突类型
 */
export type ConflictType =
  | 'content_conflict'    // 内容冲突：同一ID不同内容
  | 'semantic_conflict';  // 语义冲突：不同ID但相似内容

/**
 * 冲突检测结果
 */
export interface ConflictDetection {
  /** 是否检测到冲突 */
  hasConflict: boolean;

  /** 冲突详情 */
  conflicts: Conflict[];
}

/**
 * 冲突详情
 */
export interface Conflict {
  /** 冲突类型 */
  type: ConflictType;

  /** 涉及的记忆块 */
  chunks: [IMemoryChunk, IMemoryChunk];

  /** 相似度分数 */
  similarity: number;

  /** 推荐解决方案 */
  resolution: ConflictResolution;
}

/**
 * 冲突解决方案
 */
export interface ConflictResolution {
  /** 解决策略 */
  strategy: 'keep_first' | 'keep_second' | 'merge' | 'keep_both';

  /** 推荐保留的记忆块 */
  recommendedChunk?: IMemoryChunk;

  /** 合并后的内容（如果策略是 merge） */
  mergedContent?: any;
}

/**
 * 重复合并结果
 */
export interface MergeResult {
  /** 原始记忆块数量 */
  originalCount: number;

  /** 合并后记忆块数量 */
  mergedCount: number;

  /** 减少的数量 */
  reducedCount: number;

  /** 被合并的映射：旧ID -> 新ID */
  mergeMap: Map<string, string>;

  /** 合并详情 */
  details: MergeDetail[];
}

/**
 * 合并详情
 */
export interface MergeDetail {
  /** 被保留的记忆块 */
  kept: IMemoryChunk;

  /** 被合并的记忆块列表 */
  merged: IMemoryChunk[];

  /** 相似度分数 */
  similarity: number;
}

/**
 * 重要性调整原因
 */
export type ImportanceAdjustmentReason =
  | 'user_correction'      // 用户明确纠正
  | 'successful_reuse'     // 成功复用
  | 'long_term_unused';    // 长期未用

/**
 * 重要性调整记录
 */
export interface ImportanceAdjustment {
  /** 记忆块ID */
  memoryId: string;

  /** 调整前的重要性 */
  oldValue: number;

  /** 调整后的重要性 */
  newValue: number;

  /** 调整原因 */
  reason: ImportanceAdjustmentReason;

  /** 调整时间 */
  timestamp: Date;

  /** 元数据 */
  metadata?: {
    /** 如果是用户纠正，记录纠正前的内容 */
    previousContent?: any;
    /** 如果是成功复用，记录复用场景 */
    reuseContext?: string;
    /** 如果是长期未用，记录未使用天数 */
    unusedDays?: number;
  };
}

/**
 * 衰减结果
 */
export interface DecayResult {
  /** 处理的记忆块数量 */
  processedCount: number;

  /** 被衰减的记忆块 */
  decayedChunks: Array<{
    id: string;
    oldImportance: number;
    newImportance: number;
    daysElapsed: number;
  }>;

  /** 被移除的记忆块（重要性低于阈值） */
  removedIds: string[];
}

/**
 * 净化配置
 */
export interface PurifierConfig {
  /** 语义相似度阈值（超过此值的记忆会被合并） */
  similarityThreshold: number;

  /** 衰减因子：每天的衰减率（0.99 表示每天衰减 1%） */
  decayFactor: number;

  /** 移除阈值：重要性低于此值的记忆会被移除 */
  removalThreshold: number;

  /** 长期未用阈值：多少天未使用算作长期 */
  longTermUnusedThreshold: number;

  /** 是否启用冲突检测 */
  enableConflictDetection: boolean;

  /** 是否启用重复合并 */
  enableDuplicateMerge: boolean;

  /** 是否启用衰减机制 */
  enableDecay: boolean;
}

/**
 * 默认配置
 */
export const defaultPurifierConfig: PurifierConfig = {
  similarityThreshold: 0.9,
  decayFactor: 0.99,
  removalThreshold: 0.1,
  longTermUnusedThreshold: 30,
  enableConflictDetection: true,
  enableDuplicateMerge: true,
  enableDecay: true,
};

// ============================================================================
// 辅助工具类
// ============================================================================

/**
 * 语义相似度计算器
 */
class SemanticSimilarityCalculator {
  /**
   * 计算两个记忆块的语义相似度
   * @param a 记忆块 A
   * @param b 记忆块 B
   * @returns 相似度分数 [0, 1]
   */
  static calculate(a: IMemoryChunk, b: IMemoryChunk): number {
    // 1. 类型相同，相似度基础分更高
    let score = a.type === b.type ? 0.3 : 0;

    // 2. 内容相似度
    const contentSimilarity = this.calculateContentSimilarity(a.content, b.content);
    score += contentSimilarity * 0.5;

    // 3. 元数据相似度
    const metadataSimilarity = this.calculateMetadataSimilarity(a.metadata, b.metadata);
    score += metadataSimilarity * 0.1;

    // 4. 时序相似度（时间接近的记忆可能相关）
    const temporalSimilarity = this.calculateTemporalSimilarity(a, b);
    score += temporalSimilarity * 0.1;

    return Math.min(score, 1);
  }

  /**
   * 计算内容相似度
   */
  private static calculateContentSimilarity(a: any, b: any): number {
    if (a === b) return 1;

    const strA = JSON.stringify(a);
    const strB = JSON.stringify(b);

    // 简单的字符串相似度（基于编辑距离的简化版）
    return this.calculateStringSimilarity(strA, strB);
  }

  /**
   * 计算字符串相似度（简化版 Jaccard 相似度）
   */
  private static calculateStringSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    if (setA.size === 0 && setB.size === 0) return 1;

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return union.size === 0 ? 1 : intersection.size / union.size;
  }

  /**
   * 计算元数据相似度
   */
  private static calculateMetadataSimilarity(
    a: IMemoryChunk['metadata'],
    b: IMemoryChunk['metadata']
  ): number {
    let similarity = 0;
    let factors = 0;

    // 相同来源节点的相似度更高
    if (a.sourceNode === b.sourceNode) {
      similarity += 0.5;
    }
    factors++;

    // Token 数量接近程度
    const tokenDiff = Math.abs(a.tokens - b.tokens);
    const avgTokens = (a.tokens + b.tokens) / 2;
    if (avgTokens > 0) {
      similarity += Math.max(0, 1 - tokenDiff / avgTokens) * 0.3;
    }
    factors++;

    // 重要性接近程度
    const importanceDiff = Math.abs(a.importance - b.importance);
    similarity += (1 - importanceDiff) * 0.2;
    factors++;

    return factors === 0 ? 0 : similarity / factors;
  }

  /**
   * 计算时序相似度
   */
  private static calculateTemporalSimilarity(a: IMemoryChunk, b: IMemoryChunk): number {
    const timeDiff = Math.abs(a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime());
    const oneDay = 24 * 60 * 60 * 1000;

    // 时间差越小，相似度越高
    // 1 天内 = 1, 7 天内 = 0.7, 30 天内 = 0.4, 超过 30 天 = 0.2
    if (timeDiff < oneDay) return 1;
    if (timeDiff < 7 * oneDay) return 0.7;
    if (timeDiff < 30 * oneDay) return 0.4;
    return 0.2;
  }
}

/**
 * 重要性调整策略
 */
class ImportanceAdjustmentStrategy {
  /**
   * 用户纠正调整
   */
  static userCorrection(current: number): number {
    return Math.min(1, current + 0.3);
  }

  /**
   * 成功复用调整
   */
  static successfulReuse(current: number): number {
    return Math.min(1, current + 0.1);
  }

  /**
   * 长期未用调整
   */
  static longTermUnused(current: number): number {
    return Math.max(0, current - 0.05);
  }
}

// ============================================================================
// 自净化引擎
// ============================================================================

/**
 * 自净化引擎
 *
 * 提供：
 * 1. 冲突检测与解决
 * 2. 重复合并
 * 3. 衰减机制
 * 4. 重要性评分更新
 */
export class Purifier {
  private config: PurifierConfig;
  private adjustmentHistory: ImportanceAdjustment[] = [];

  constructor(config: Partial<PurifierConfig> = {}) {
    this.config = { ...defaultPurifierConfig, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): PurifierConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PurifierConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取调整历史
   */
  getAdjustmentHistory(): ImportanceAdjustment[] {
    return [...this.adjustmentHistory];
  }

  /**
   * 清除调整历史
   */
  clearAdjustmentHistory(): void {
    this.adjustmentHistory = [];
  }

  // ========================================================================
  // 冲突检测与解决
  // ========================================================================

  /**
   * 检测冲突
   * @param chunks 记忆块列表
   * @returns 冲突检测结果
   */
  detectConflicts(chunks: IMemoryChunk[]): ConflictDetection {
    if (!this.config.enableConflictDetection) {
      return { hasConflict: false, conflicts: [] };
    }

    const conflicts: Conflict[] = [];
    const idMap = new Map<string, IMemoryChunk>();

    // 1. 检测 ID 冲突（同一 ID 不同内容）
    for (const chunk of chunks) {
      const existing = idMap.get(chunk.id);
      if (existing) {
        // 检查内容是否真的不同
        if (JSON.stringify(existing.content) !== JSON.stringify(chunk.content)) {
          conflicts.push({
            type: 'content_conflict',
            chunks: [existing, chunk],
            similarity: SemanticSimilarityCalculator.calculate(existing, chunk),
            resolution: this.resolveConflict(existing, chunk),
          });
        }
      } else {
        idMap.set(chunk.id, chunk);
      }
    }

    // 2. 检测语义冲突（不同 ID 但相似内容）
    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const a = chunks[i];
        const b = chunks[j];

        // 跳过相同 ID
        if (a.id === b.id) continue;

        // 计算相似度
        const similarity = SemanticSimilarityCalculator.calculate(a, b);

        // 超过阈值且不是同一来源的，视为语义冲突
        if (similarity >= this.config.similarityThreshold) {
          // 如果来源不同，可能是真正的冲突
          if (a.sourceNode !== b.sourceNode) {
            conflicts.push({
              type: 'semantic_conflict',
              chunks: [a, b],
              similarity,
              resolution: this.resolveConflict(a, b),
            });
          }
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * 解决冲突
   */
  private resolveConflict(
    a: IMemoryChunk,
    b: IMemoryChunk
  ): ConflictResolution {
    // 策略：重要性高的优先
    if (b.metadata.importance > a.metadata.importance) {
      return {
        strategy: 'keep_second',
        recommendedChunk: b,
      };
    }

    if (a.metadata.importance > b.metadata.importance) {
      return {
        strategy: 'keep_first',
        recommendedChunk: a,
      };
    }

    // 重要性相同，按时间戳
    if (b.metadata.updatedAt > a.metadata.updatedAt) {
      return {
        strategy: 'keep_second',
        recommendedChunk: b,
      };
    }

    return {
      strategy: 'keep_first',
      recommendedChunk: a,
    };
  }

  /**
   * 自动解决冲突
   * @param chunks 记忆块列表
   * @returns 解决冲突后的记忆块列表
   */
  autoResolveConflicts(chunks: IMemoryChunk[]): IMemoryChunk[] {
    const detection = this.detectConflicts(chunks);

    if (!detection.hasConflict) {
      return chunks;
    }

    const resolvedMap = new Map<string, IMemoryChunk>();
    const idsToRemove = new Set<string>();

    for (const conflict of detection.conflicts) {
      const resolution = conflict.resolution;

      if (resolution.strategy === 'keep_first') {
        resolvedMap.set(conflict.chunks[0].id, conflict.chunks[0]);
        idsToRemove.add(conflict.chunks[1].id);
      } else if (resolution.strategy === 'keep_second') {
        resolvedMap.set(conflict.chunks[1].id, conflict.chunks[1]);
        idsToRemove.add(conflict.chunks[0].id);
      } else if (resolution.strategy === 'merge' && resolution.mergedContent) {
        const merged = {
          ...conflict.chunks[0],
          content: resolution.mergedContent,
          metadata: {
            ...conflict.chunks[0].metadata,
            updatedAt: new Date(),
            importance: Math.max(
              conflict.chunks[0].metadata.importance,
              conflict.chunks[1].metadata.importance
            ),
          },
        };
        resolvedMap.add(merged.id, merged);
        idsToRemove.add(conflict.chunks[1].id);
      }
    }

    // 返回未涉及冲突的记忆块 + 解决后的记忆块
    return chunks.filter(c => !idsToRemove.has(c.id));
  }

  // ========================================================================
  // 重复合并
  // ========================================================================

  /**
   * 合并重复记忆
   * @param chunks 记忆块列表
   * @returns 合并结果
   */
  mergeDuplicates(chunks: IMemoryChunk[]): MergeResult {
    if (!this.config.enableDuplicateMerge || chunks.length === 0) {
      return {
        originalCount: chunks.length,
        mergedCount: chunks.length,
        reducedCount: 0,
        mergeMap: new Map(),
        details: [],
      };
    }

    const mergedChunks: IMemoryChunk[] = [];
    const mergedIndices = new Set<number>();
    const mergeMap = new Map<string, string>();
    const details: MergeDetail[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (mergedIndices.has(i)) continue;

      const keepChunk = chunks[i];
      const similarIndices: number[] = [];

      // 查找相似的记忆块
      for (let j = i + 1; j < chunks.length; j++) {
        if (mergedIndices.has(j)) continue;

        const similarity = SemanticSimilarityCalculator.calculate(keepChunk, chunks[j]);

        if (similarity >= this.config.similarityThreshold) {
          similarIndices.push(j);
        }
      }

      if (similarIndices.length === 0) {
        mergedChunks.push(keepChunk);
      } else {
        // 合并记忆块
        const merged = this.mergeChunks(keepChunk, similarIndices.map(idx => chunks[idx]));
        mergedChunks.push(merged);

        // 记录合并映射
        for (const idx of similarIndices) {
          mergedIndices.add(idx);
          mergeMap.set(chunks[idx].id, keepChunk.id);
        }

        // 记录合并详情
        details.push({
          kept: merged,
          merged: similarIndices.map(idx => chunks[idx]),
          similarity: this.config.similarityThreshold,
        });
      }
    }

    return {
      originalCount: chunks.length,
      mergedCount: mergedChunks.length,
      reducedCount: chunks.length - mergedChunks.length,
      mergeMap,
      details,
    };
  }

  /**
   * 合并多个记忆块为一个
   */
  private mergeChunks(base: IMemoryChunk, others: IMemoryChunk[]): IMemoryChunk {
    // 合并重要性（取最大值）
    const maxImportance = Math.max(
      base.metadata.importance,
      ...others.map(c => c.metadata.importance)
    );

    // 合并内容（简单策略：保留 importance 最高的）
    const allChunks = [base, ...others];
    const sortedByImportance = allChunks.sort(
      (a, b) => b.metadata.importance - a.metadata.importance
    );

    return {
      ...base,
      content: sortedByImportance[0].content,
      metadata: {
        ...base.metadata,
        updatedAt: new Date(),
        importance: maxImportance,
        tokens: Math.max(base.metadata.tokens, ...others.map(c => c.metadata.tokens)),
      },
    };
  }

  // ========================================================================
  // 衰减机制
  // ========================================================================

  /**
   * 应用衰减机制
   * @param chunks 记忆块列表
   * @returns 衰减结果
   */
  applyDecay(chunks: IMemoryChunk[]): DecayResult {
    if (!this.config.enableDecay) {
      return {
        processedCount: chunks.length,
        decayedChunks: [],
        removedIds: [],
      };
    }

    const now = new Date();
    const decayedChunks: DecayResult['decayedChunks'] = [];
    const removedIds: string[] = [];

    const result = chunks.map(chunk => {
      // 计算经过的天数
      const daysElapsed = Math.floor(
        (now.getTime() - chunk.metadata.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysElapsed <= 0) {
        return chunk;
      }

      // 应用衰减公式：importance *= decayFactor ^ daysElapsed
      const oldImportance = chunk.metadata.importance;
      const newImportance = oldImportance * Math.pow(this.config.decayFactor, daysElapsed);

      if (newImportance < this.config.removalThreshold) {
        removedIds.push(chunk.id);
        return null;
      }

      if (newImportance < oldImportance) {
        decayedChunks.push({
          id: chunk.id,
          oldImportance,
          newImportance,
          daysElapsed,
        });
      }

      return {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          importance: newImportance,
        },
      };
    });

    return {
      processedCount: chunks.length,
      decayedChunks,
      removedIds,
    };
  }

  /**
   * 获取需要衰减的记忆块（不移除，只返回预测）
   */
  predictDecay(chunks: IMemoryChunk[]): {
    toDecay: Array<{ id: string; current: number; predicted: number }>;
    toRemove: string[];
  } {
    const now = new Date();
    const toDecay: Array<{ id: string; current: number; predicted: number }> = [];
    const toRemove: string[] = [];

    for (const chunk of chunks) {
      const daysElapsed = Math.floor(
        (now.getTime() - chunk.metadata.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysElapsed <= 0) continue;

      const predicted = chunk.metadata.importance * Math.pow(this.config.decayFactor, daysElapsed);

      if (predicted < this.config.removalThreshold) {
        toRemove.push(chunk.id);
      } else if (predicted < chunk.metadata.importance) {
        toDecay.push({
          id: chunk.id,
          current: chunk.metadata.importance,
          predicted,
        });
      }
    }

    return { toDecay, toRemove };
  }

  // ========================================================================
  // 重要性评分更新
  // ========================================================================

  /**
   * 用户明确纠正
   */
  userCorrection(
    chunk: IMemoryChunk,
    previousContent?: any
  ): IMemoryChunk {
    const oldImportance = chunk.metadata.importance;
    const newImportance = ImportanceAdjustmentStrategy.userCorrection(oldImportance);

    const adjustment: ImportanceAdjustment = {
      memoryId: chunk.id,
      oldValue: oldImportance,
      newValue: newImportance,
      reason: 'user_correction',
      timestamp: new Date(),
      metadata: { previousContent },
    };

    this.adjustmentHistory.push(adjustment);

    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        importance: newImportance,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * 成功复用
   */
  successfulReuse(
    chunk: IMemoryChunk,
    reuseContext?: string
  ): IMemoryChunk {
    const oldImportance = chunk.metadata.importance;
    const newImportance = ImportanceAdjustmentStrategy.successfulReuse(oldImportance);

    const adjustment: ImportanceAdjustment = {
      memoryId: chunk.id,
      oldValue: oldImportance,
      newValue: newImportance,
      reason: 'successful_reuse',
      timestamp: new Date(),
      metadata: { reuseContext },
    };

    this.adjustmentHistory.push(adjustment);

    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        importance: newImportance,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * 长期未用
   */
  longTermUnused(
    chunk: IMemoryChunk,
    unusedDays?: number
  ): IMemoryChunk {
    const oldImportance = chunk.metadata.importance;
    const newImportance = ImportanceAdjustmentStrategy.longTermUnused(oldImportance);

    const adjustment: ImportanceAdjustment = {
      memoryId: chunk.id,
      oldValue: oldImportance,
      newValue: newImportance,
      reason: 'long_term_unused',
      timestamp: new Date(),
      metadata: { unusedDays },
    };

    this.adjustmentHistory.push(adjustment);

    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        importance: newImportance,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * 批量长期未用检查
   * @param chunks 记忆块列表
   * @returns 需要调整的记忆块列表
   */
  checkLongTermUnused(chunks: IMemoryChunk[]): {
    unusedChunks: Array<{
      chunk: IMemoryChunk;
      unusedDays: number;
    }>;
  } {
    const now = new Date();
    const unusedChunks: Array<{
      chunk: IMemoryChunk;
      unusedDays: number;
    }> = [];

    for (const chunk of chunks) {
      const daysSinceLastUpdate = Math.floor(
        (now.getTime() - chunk.metadata.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastUpdate >= this.config.longTermUnusedThreshold) {
        unusedChunks.push({
          chunk,
          unusedDays: daysSinceLastUpdate,
        });
      }
    }

    return { unusedChunks };
  }

  // ========================================================================
  // 完整净化流程
  // ========================================================================

  /**
   * 执行完整的净化流程
   * @param snapshot 记忆快照
   * @returns 净化后的快照
   */
  async purify(snapshot: IMemorySnapshot): Promise<IMemorySnapshot> {
    const result = { ...snapshot };

    // 1. 对每种类型的记忆进行处理
    for (const type of ['context', 'execution', 'working', 'knowledge'] as MemoryType[]) {
      const chunks = [...result.memoryPool[type]];

      // 2. 冲突检测与解决
      const resolvedChunks = this.autoResolveConflicts(chunks);

      // 3. 重复合并
      const mergeResult = this.mergeDuplicates(resolvedChunks);

      // 4. 衰减机制
      const decayResult = this.applyDecay(mergeResult.mergedCount === chunks.length
        ? resolvedChunks
        : resolvedChunks.map(c => {
            const mergedId = mergeResult.mergeMap.get(c.id);
            if (mergedId) {
              const kept = mergeResult.details.find(d => d.kept.id === mergedId);
              return kept ? kept.kept : c;
            }
            return c;
          }).filter(c => c !== null) as IMemoryChunk[]
      );

      // 5. 移除被标记删除的记忆块
      result.memoryPool[type] = (result.memoryPool[type] as any[])
        .filter((c: IMemoryChunk) => !decayResult.removedIds.includes(c.id))
        .map((c: IMemoryChunk) => {
          const decayed = decayResult.decayedChunks.find(d => d.id === c.id);
          if (decayed) {
            return {
              ...c,
              metadata: {
                ...c.metadata,
                importance: decayed.newImportance,
              },
            };
          }
          return c;
        });
    }

    // 更新快照时间戳
    result.timestamp = new Date();

    return result;
  }

  /**
   * 增量净化（只处理新增或修改的记忆块）
   * @param snapshot 当前快照
   * @param newChunks 新增或修改的记忆块
   * @returns 净化后的快照
   */
  async purifyIncremental(
    snapshot: IMemorySnapshot,
    newChunks: IMemoryChunk[]
  ): Promise<IMemorySnapshot> {
    const result = { ...snapshot };

    for (const newChunk of newChunks) {
      const type = newChunk.type;
      const existing = result.memoryPool[type] as IMemoryChunk[];
      const existingIndex = existing.findIndex(c => c.id === newChunk.id);

      if (existingIndex >= 0) {
        // 更新现有记忆块
        existing[existingIndex] = newChunk;
      } else {
        // 添加新记忆块
        existing.push(newChunk);
      }

      result.memoryPool[type] = existing;
    }

    // 对新增/修改的记忆块类型进行冲突检测和合并
    const affectedTypes = new Set(newChunks.map(c => c.type));

    for (const type of affectedTypes) {
      const chunks = [...result.memoryPool[type] as IMemoryChunk[]];
      const resolvedChunks = this.autoResolveConflicts(chunks);
      const mergeResult = this.mergeDuplicates(resolvedChunks);

      result.memoryPool[type] = mergeResult.mergedCount === chunks.length
        ? resolvedChunks
        : resolvedChunks.map(c => {
            const mergedId = mergeResult.mergeMap.get(c.id);
            if (mergedId) {
              const kept = mergeResult.details.find(d => d.kept.id === mergedId);
              return kept ? kept.kept : c;
            }
            return c;
          }).filter(c => c !== null) as IMemoryChunk[];
    }

    result.timestamp = new Date();

    return result;
  }

  /**
   * 获取净化统计信息
   */
  getStats(): {
    config: PurifierConfig;
    adjustmentHistoryLength: number;
    lastAdjustment: Date | null;
  } {
    const lastAdjustment = this.adjustmentHistory.length > 0
      ? this.adjustmentHistory[this.adjustmentHistory.length - 1].timestamp
      : null;

    return {
      config: this.config,
      adjustmentHistoryLength: this.adjustmentHistory.length,
      lastAdjustment,
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export default Purifier;
