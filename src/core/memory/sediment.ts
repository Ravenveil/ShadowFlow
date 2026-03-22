/**
 * 河流式记忆系统 - 沉淀层
 *
 * 借鉴 Claude Code Auto Memory 机制
 * - 200行入口限制
 * - 按需加载主题文件
 * - 自动沉淀条件判断
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';

// ==================== 类型定义 ====================

/**
 * 模式类型
 */
export type PatternType =
  | 'user_correction'   // 用户纠正过的输出
  | 'successful_pattern' // 成功模式（出现>3次）
  | 'solution_pattern';  // 失败后找到的解决方案

/**
 * 模式（沉淀物）
 */
export interface IPattern {
  /** 唯一ID */
  id: string;

  /** 模式类型 */
  type: PatternType;

  /** 模式内容（可以是任意数据） */
  content: any;

  /** 沉淀原因 */
  reason: string;

  /** 统计信息 */
  stats: {
    /** 出现次数 */
    occurrences: number;

    /** 成功率 */
    successRate: number;

    /** 上次使用时间 */
    lastUsedAt: Date;

    /** 创建时间 */
    createdAt: Date;
  };

  /** 重要性评分 (0-1) */
  importance: number;

  /** 标签 */
  tags?: string[];

  /** 关联节点 */
  relatedNodes?: string[];
}

/**
 * 沉淀层配置
 */
export interface ISedimentConfig {
  /** 记忆文件路径 */
  memoryPath: string;

  /** 主题目录 */
  topicDir: string;

  /** 最大入口行数 */
  maxEntryLines: number;

  /** 成功模式最小出现次数 */
  minSuccessOccurrences: number;

  /** 重要性阈值 */
  importanceThreshold: number;
}

/**
 * 自动沉淀判断结果
 */
export interface ISedimentResult {
  /** 是否应该沉淀 */
  shouldSettle: boolean;

  /** 沉淀原因 */
  reason?: string;

  /** 重要性评分 */
  importance: number;
}

// ==================== 沉淀层类 ====================

/**
 * 沉淀层 - 负责长期记忆的沉淀与提取
 *
 * 特性：
 * 1. 200行入口限制 - 自动加载前200行，其余按需
 * 2. Auto Memory - 自动判断哪些模式值得沉淀
 * 3. 主题文件组织 - 按类别存储在不同文件
 */
export class SedimentLayer {
  private config: ISedimentConfig;
  private cache: Map<string, IPattern>;
  private entryLines: IPattern[];
  private loadedTopics: Set<string>;

  constructor(config?: Partial<ISedimentConfig>) {
    this.config = {
      memoryPath: config?.memoryPath ?? '.claude/projects/E--VScode-AgentGraph/memory',
      topicDir: config?.topicDir ?? '.claude/projects/E--VScode-AgentGraph/memory/topics',
      maxEntryLines: config?.maxEntryLines ?? 200,
      minSuccessOccurrences: config?.minSuccessOccurrences ?? 3,
      importanceThreshold: config?.importanceThreshold ?? 0.5,
    };
    this.cache = new Map();
    this.entryLines = [];
    this.loadedTopics = new Set();
    this.ensureDirectories();
    this.loadEntryLines();
  }

  // ==================== 核心操作 ====================

  /**
   * 从沉淀层取水（读取学习到的模式）
   *
   * @param options 查询选项
   * @returns 匹配的模式列表
   */
  dredge(options?: {
    type?: PatternType;
    tags?: string[];
    relatedNode?: string;
    minImportance?: number;
  }): IPattern[] {
    let results = [...this.entryLines];

    // 按需加载主题文件
    if (options?.type || options?.tags) {
      const topicFile = this.getTopicFile(options.type, options.tags);
      if (topicFile && !this.loadedTopics.has(topicFile)) {
        this.loadTopicFile(topicFile);
      }
    }

    // 应用过滤条件
    if (options?.type) {
      results = results.filter(p => p.type === options.type);
    }
    if (options?.tags && options.tags.length > 0) {
      results = results.filter(p =>
        p.tags?.some(tag => options.tags!.includes(tag))
      );
    }
    if (options?.relatedNode) {
      results = results.filter(p =>
        p.relatedNodes?.includes(options.relatedNode!)
      );
    }
    if (options?.minImportance) {
      results = results.filter(p => p.importance >= options.minImportance!);
    }

    // 更新使用统计
    results.forEach(p => this.updateUsageStats(p.id));

    return results;
  }

  /**
   * 向沉淀层注水（记录学习）
   *
   * @param pattern 模式对象
   * @returns 是否成功沉淀
   */
  settle(pattern: IPattern | Partial<IPattern>): boolean {
    const fullPattern = this.ensurePattern(pattern);

    // 检查是否应该沉淀
    const result = this.evaluateSettle(fullPattern);
    if (!result.shouldSettle) {
      return false;
    }

    // 更新重要性评分
    fullPattern.importance = Math.max(fullPattern.importance, result.importance);

    // 检查是否已存在
    const existing = this.findSimilarPattern(fullPattern);
    if (existing) {
      this.updateExistingPattern(existing, fullPattern);
    } else {
      this.addNewPattern(fullPattern);
    }

    // 异步持久化
    this.persistAsync(fullPattern);

    return true;
  }

  /**
   * 自动沉淀条件判断
   *
   * @param pattern 模式对象
   * @returns 沉淀判断结果
   */
  evaluateSettle(pattern: Partial<IPattern>): ISedimentResult {
    // 规则1: 用户纠正过的输出 - 自动沉淀
    if (pattern.type === 'user_correction') {
      return {
        shouldSettle: true,
        reason: '用户纠正过的输出',
        importance: pattern.importance ?? 0.8,
      };
    }

    // 规则2: 成功模式（出现>3次）- 自动沉淀
    if (pattern.stats?.occurrences && pattern.stats.occurrences >= this.config.minSuccessOccurrences) {
      return {
        shouldSettle: true,
        reason: `成功模式（出现${pattern.stats.occurrences}次）`,
        importance: pattern.importance ?? 0.6 + (pattern.stats.occurrences * 0.05),
      };
    }

    // 规则3: 失败后找到的解决方案 - 自动沉淀
    if (pattern.type === 'solution_pattern' && pattern.reason?.includes('失败')) {
      return {
        shouldSettle: true,
        reason: '失败后找到的解决方案',
        importance: pattern.importance ?? 0.7,
      };
    }

    // 默认：基于重要性评分
    const importance = pattern.importance ?? 0;
    if (importance >= this.config.importanceThreshold) {
      return {
        shouldSettle: true,
        reason: `重要性评分${importance.toFixed(2)}达到阈值`,
        importance,
      };
    }

    return {
      shouldSettle: false,
      importance,
    };
  }

  // ==================== 管理操作 ====================

  /**
   * 清理过期的沉淀物
   */
  cleanup(): number {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90天前
    let removed = 0;

    for (const [id, pattern] of this.cache) {
      if (pattern.stats.lastUsedAt < cutoff && pattern.importance < 0.3) {
        this.cache.delete(id);
        removed++;
      }
    }

    // 更新入口行
    this.entryLines = this.entryLines.filter(p => this.cache.has(p.id));

    return removed;
  }

  /**
   * 获取沉淀层统计信息
   */
  getStats(): {
    totalPatterns: number;
    entryPatterns: number;
    byType: Record<PatternType, number>;
    avgImportance: number;
  } {
    const allPatterns = Array.from(this.cache.values());
    const byType = {
      user_correction: 0,
      successful_pattern: 0,
      solution_pattern: 0,
    };

    let totalImportance = 0;

    for (const p of allPatterns) {
      byType[p.type]++;
      totalImportance += p.importance;
    }

    return {
      totalPatterns: allPatterns.length,
      entryPatterns: this.entryLines.length,
      byType,
      avgImportance: allPatterns.length > 0
        ? totalImportance / allPatterns.length
        : 0,
    };
  }

  // ==================== 私有方法 ====================

  private ensureDirectories(): void {
    if (!existsSync(this.config.memoryPath)) {
      mkdirSync(this.config.memoryPath, { recursive: true });
    }
    if (!existsSync(this.config.topicDir)) {
      mkdirSync(this.config.topicDir, { recursive: true });
    }
  }

  private loadEntryLines(): void {
    const mainFile = join(this.config.memoryPath, 'MEMORY.md');

    if (!existsSync(mainFile)) {
      return;
    }

    const content = readFileSync(mainFile, 'utf-8');
    const lines = content.split('\n').slice(0, this.config.maxEntryLines);

    this.entryLines = lines
      .filter(line => line.trim().startsWith('- '))
      .map(line => this.parsePatternLine(line))
      .filter((p): p is IPattern => p !== null);

    // 将入口模式加入缓存
    this.entryLines.forEach(p => this.cache.set(p.id, p));
  }

  private parsePatternLine(line: string): IPattern | null {
    try {
      // 简单解析：假设格式为 "- [id] type: reason (importance: X)"
      const match = line.match(/^\-\s+\[([^\]]+)\]\s+(\w+):\s+(.+)\s+\(importance:\s+([\d.]+)\)/);
      if (!match) return null;

      return {
        id: match[1],
        type: match[2] as PatternType,
        reason: match[3],
        stats: {
          occurrences: 1,
          successRate: 1.0,
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
        importance: parseFloat(match[4]),
      };
    } catch {
      return null;
    }
  }

  private getTopicFile(type?: PatternType, tags?: string[]): string | null {
    if (!type && (!tags || tags.length === 0)) {
      return null;
    }

    if (type) {
      return join(this.config.topicDir, `${type}.md`);
    }

    if (tags && tags.length > 0) {
      return join(this.config.topicDir, `${tags[0]}.md`);
    }

    return null;
  }

  private loadTopicFile(filename: string): void {
    if (!existsSync(filename) || this.loadedTopics.has(filename)) {
      return;
    }

    try {
      const content = readFileSync(filename, 'utf-8');
      const patterns = this.parseTopicFile(content);

      patterns.forEach(p => {
        if (!this.cache.has(p.id)) {
          this.cache.set(p.id, p);
        }
      });

      this.loadedTopics.add(filename);
    } catch {
      // 静默失败
    }
  }

  private parseTopicFile(content: string): IPattern[] {
    // 实现主题文件解析逻辑
    // 这里简化处理，实际应根据文件格式解析
    return [];
  }

  private ensurePattern(pattern: IPattern | Partial<IPattern>): IPattern {
    return {
      id: pattern.id ?? this.generateId(),
      type: pattern.type ?? 'successful_pattern',
      content: pattern.content,
      reason: pattern.reason ?? '',
      stats: pattern.stats ?? {
        occurrences: 1,
        successRate: 1.0,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      },
      importance: pattern.importance ?? 0.5,
      tags: pattern.tags ?? [],
      relatedNodes: pattern.relatedNodes ?? [],
    };
  }

  private findSimilarPattern(pattern: IPattern): IPattern | null {
    for (const [id, existing] of this.cache) {
      if (this.isSimilar(existing, pattern)) {
        return existing;
      }
    }
    return null;
  }

  private isSimilar(a: IPattern, b: IPattern): boolean {
    // 简单相似度判断：类型相同 + 内容相似
    if (a.type !== b.type) {
      return false;
    }

    const contentA = JSON.stringify(a.content);
    const contentB = JSON.stringify(b.content);

    // 简单字符串比较
    return contentA === contentB;
  }

  private updateExistingPattern(existing: IPattern, update: IPattern): void {
    existing.stats.occurrences += update.stats.occurrences;
    existing.stats.lastUsedAt = update.stats.lastUsedAt;
    existing.importance = Math.max(existing.importance, update.importance);

    if (update.reason) {
      existing.reason = update.reason;
    }

    if (update.tags) {
      existing.tags = [...new Set([...(existing.tags ?? []), ...update.tags])];
    }
  }

  private addNewPattern(pattern: IPattern): void {
    this.cache.set(pattern.id, pattern);

    // 如果入口未满，添加到入口
    if (this.entryLines.length < this.config.maxEntryLines) {
      this.entryLines.push(pattern);
    }
  }

  private updateUsageStats(patternId: string): void {
    const pattern = this.cache.get(patternId);
    if (pattern) {
      pattern.stats.lastUsedAt = new Date();
      pattern.stats.occurrences++;
    }
  }

  private persistAsync(pattern: IPattern): void {
    // 异步持久化，不阻塞主流程
    setImmediate(() => this.persist(pattern));
  }

  private persist(pattern: IPattern): void {
    // 将模式写入主题文件
    const topicFile = this.getTopicFile(pattern.type, pattern.tags);
    if (topicFile) {
      const dir = dirname(topicFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const line = this.formatPatternLine(pattern);
      const content = existsSync(topicFile)
        ? readFileSync(topicFile, 'utf-8')
        : '';

      writeFileSync(topicFile, content + line + '\n');
    }
  }

  private formatPatternLine(pattern: IPattern): string {
    const dateStr = pattern.stats.createdAt.toISOString().split('T')[0];
    return `- [${pattern.id}] ${pattern.type}: ${pattern.reason} (importance: ${pattern.importance.toFixed(2)}) [${dateStr}]`;
  }

  private generateId(): string {
    return `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ==================== 单例导出 ====================

let instance: SedimentLayer | null = null;

/**
 * 获取沉淀层单例
 */
export function getSedimentLayer(): SedimentLayer {
  if (!instance) {
    instance = new SedimentLayer();
  }
  return instance;
}

/**
 * 重置沉淀层单例（主要用于测试）
 */
export function resetSedimentLayer(): void {
  instance = null;
}
