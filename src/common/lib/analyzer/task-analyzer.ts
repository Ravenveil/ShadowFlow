/**
 * 任务特征提取器 (TaskAnalyzer)
 *
 * 负责分析任务描述，提取任务的各种特征，包括：
 * - 复杂度评估（组件/协调/动态）
 * - 任务类型识别
 * - 特征标记（TDD/审核/并行等）
 * - 规模估算
 */

import {
  TaskFeatures,
  ComplexityScore,
  TaskType,
  QualityRequirement,
  AnalyzeOptions,
  AnalyzerReport,
} from '../types/analyzer.js';

/**
 * 关键词映射表 - 用于快速识别任务类型
 */
const TYPE_KEYWORDS: Record<TaskType, string[]> = {
  coding: [
    '实现', '编写', '开发', '创建', '添加', '重构', '修复', 'implement',
    'write', 'develop', 'create', 'add', 'refactor', 'fix', 'code',
    'function', 'class', 'module', 'component', 'api', 'endpoint'
  ],
  analysis: [
    '分析', '调研', '评估', '研究', 'compare', 'investigate', 'evaluate',
    'study', 'analyze', 'audit', 'review', 'assessment'
  ],
  documentation: [
    '文档', '说明', '手册', '教程', 'readme', 'guide', 'tutorial',
    'document', 'manual', 'explain', 'documentation'
  ],
  review: [
    '审核', '审查', '检查', 'review', 'check', 'inspect', 'verify',
    'code review', 'audit', 'quality check'
  ],
  testing: [
    '测试', '单元测试', '集成测试', 'test', 'unittest', 'integration',
    'test case', 'spec', 'e2e', 'testing', 'test coverage'
  ],
  debugging: [
    '调试', 'bug', '错误', '异常', 'fix bug', 'debug', 'error', 'exception',
    'troubleshoot', 'issue', 'problem', 'crash'
  ]
};

/**
 * TDD 关键词
 */
const TDD_KEYWORDS = [
  'tdd', 'test-driven', '测试驱动', '单元测试', 'test-first',
  '先写测试', 'test coverage', '测试覆盖'
];

/**
 * 质量关键词
 */
const QUALITY_KEYWORDS: Record<QualityRequirement, string[]> = {
  low: ['快速', '简单', '临时', 'quick', 'simple', 'temp', 'temporary'],
  normal: [],
  high: ['高质量', '严谨', '严格', 'high quality', 'strict', 'thorough', 'comprehensive'],
  critical: ['关键', '核心', '重要', '安全', 'critical', 'core', 'essential', 'security', 'vital']
};

/**
 * 并行任务关键词
 */
const PARALLEL_KEYWORDS = [
  '并行', '同时', 'concurrent', 'parallel', 'simultaneous',
  '多线程', 'multithread', 'async', '异步'
];

/**
 * 复杂度评估关键词
 */
const COMPLEXITY_KEYWORDS = {
  high: [
    '复杂', '模块化', '架构', '架构设计', '微服务', 'distributed',
    'complex', 'modular', 'architecture', 'microservice', 'multi-module',
    'cross-platform', '跨平台'
  ],
  medium: [
    '中等', 'multi', '多', 'several', '多个'
  ],
  low: [
    '简单', '单个', 'simple', 'single', 'basic', '基础'
  ]
};

/**
 * 设计阶段关键词
 */
const DESIGN_KEYWORDS = [
  '设计', 'design', '架构', 'architecture', 'schema', 'model',
  'uml', 'flowchart', '流程图', '原型', 'prototype'
];

/**
 * 安全审计关键词
 */
const SECURITY_KEYWORDS = [
  '安全', 'security', '漏洞', 'vulnerability', '注入', 'injection',
  '加密', 'encryption', '认证', 'auth', 'authorization', 'xss', 'csrf'
];

/**
 * 规模估算映射
 */
const SCALE_ESTIMATORS = {
  duration: {
    small: 5,
    medium: 30,
    large: 120,
    very_large: 480
  },
  subtasks: {
    small: 1,
    medium: 3,
    large: 8,
    very_large: 20
  },
  tokens: {
    small: 2000,
    medium: 10000,
    large: 50000,
    very_large: 200000
  },
  files: {
    small: 1,
    medium: 3,
    large: 8,
    very_large: 20
  }
};

/**
 * 任务分析结果
 */
interface AnalysisResult {
  /** 检测到的关键词 */
  keywords: {
    type: TaskType[];
    features: string[];
    quality: QualityRequirement[];
  };

  /** 任务规模等级 */
  scale_level: 'small' | 'medium' | 'large' | 'very_large';

  /** 提取的实体 */
  entities: {
    files?: string[];
    functions?: string[];
    classes?: string[];
    apis?: string[];
  };

  /** 原始文本长度 */
  text_length: number;

  /** 句子数量 */
  sentence_count: number;
}

/**
 * 任务特征提取器
 */
export class TaskAnalyzer {
  private options: AnalyzeOptions;
  private cache: Map<string, { features: TaskFeatures; timestamp: number }>;
  private cache_ttl: number = 3600000; // 1小时缓存

  constructor(options: AnalyzeOptions = {}) {
    this.options = {
      use_llm: true,
      llm_depth: 'standard',
      custom_rules: [],
      verbose: false,
      ...options
    };
    this.cache = new Map();
  }

  /**
   * 分析任务描述并提取特征
   */
  async analyze(taskDescription: string): Promise<TaskFeatures> {
    const startTime = Date.now();

    // 检查缓存
    const cacheKey = this.getCacheKey(taskDescription);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cache_ttl) {
      if (this.options.verbose) {
        console.log('[TaskAnalyzer] Using cached analysis');
      }
      return cached.features;
    }

    // 1. 基础文本分析
    const basicAnalysis = this.basicAnalyze(taskDescription);

    // 2. 复杂度评估
    const complexity = this.assessComplexity(taskDescription, basicAnalysis);

    // 3. 类型判断
    const type = this.inferType(taskDescription, basicAnalysis);

    // 4. 规模估算
    const scale = this.estimateScale(taskDescription, basicAnalysis, complexity);

    // 5. 特征标记识别
    const flags = this.identifyFlags(taskDescription, basicAnalysis);

    // 6. 质量要求判断
    const quality_requirement = this.assessQuality(taskDescription, basicAnalysis);

    // 7. 技术栈提取
    const tech_stack = this.extractTechStack(taskDescription);

    // 8. 域特定特征
    const domain_features = this.extractDomainFeatures(taskDescription, type);

    const features: TaskFeatures = {
      complexity,
      type,
      scale,
      flags,
      quality_requirement,
      tech_stack,
      domain_features
    };

    // 应用自定义规则（如果有）
    if (this.options.custom_rules) {
      this.applyCustomRules(features, taskDescription);
    }

    // 缓存结果
    this.cache.set(cacheKey, {
      features,
      timestamp: Date.now()
    });

    const duration = Date.now() - startTime;
    if (this.options.verbose) {
      console.log(`[TaskAnalyzer] Analysis completed in ${duration}ms`);
    }

    return features;
  }

  /**
   * 生成分析报告
   */
  async analyzeWithReport(taskDescription: string): Promise<AnalyzerReport> {
    const startTime = Date.now();
    const methods: string[] = [];

    methods.push('basic_text_analysis');

    const features = await this.analyze(taskDescription);

    const report: AnalyzerReport = {
      input: taskDescription,
      features,
      duration_ms: Date.now() - startTime,
      methods,
      llm_calls: this.options.use_llm ? 1 : 0,
      cached: this.cache.has(this.getCacheKey(taskDescription))
    };

    return report;
  }

  /**
   * 基础文本分析
   */
  private basicAnalyze(text: string): AnalysisResult {
    const normalized = text.toLowerCase();

    // 检测任务类型关键词
    const typeKeywords: TaskType[] = [];
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          typeKeywords.push(type as TaskType);
          break;
        }
      }
    }

    // 检测特征关键词
    const featureKeywords: string[] = [];
    if (this.containsAny(normalized, TDD_KEYWORDS)) featureKeywords.push('tdd');
    if (this.containsAny(normalized, PARALLEL_KEYWORDS)) featureKeywords.push('parallel');
    if (this.containsAny(normalized, DESIGN_KEYWORDS)) featureKeywords.push('design');
    if (this.containsAny(normalized, SECURITY_KEYWORDS)) featureKeywords.push('security');

    // 检测质量要求关键词
    const qualityKeywords: QualityRequirement[] = [];
    for (const [level, keywords] of Object.entries(QUALITY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          qualityKeywords.push(level as QualityRequirement);
          break;
        }
      }
    }

    // 判断规模等级
    let scale_level: AnalysisResult['scale_level'] = 'medium';
    const highScaleCount = (normalized.match(/\d+\s*(个|file|module|function)/gi) || []).length;
    if (highScaleCount === 0 || this.containsAny(normalized, COMPLEXITY_KEYWORDS.low)) {
      scale_level = 'small';
    } else if (highScaleCount > 3 || this.containsAny(normalized, COMPLEXITY_KEYWORDS.high)) {
      scale_level = 'very_large';
    } else if (highScaleCount > 1 || this.containsAny(normalized, COMPLEXITY_KEYWORDS.medium)) {
      scale_level = 'large';
    }

    // 提取实体
    const entities = this.extractEntities(text);

    // 计算文本统计
    const text_length = text.length;
    const sentence_count = text.split(/[.。!?！?？]/).filter(s => s.trim().length > 0).length;

    return {
      keywords: {
        type: typeKeywords,
        features: featureKeywords,
        quality: qualityKeywords
      },
      scale_level,
      entities,
      text_length,
      sentence_count
    };
  }

  /**
   * 复杂度评估
   */
  private assessComplexity(text: string, analysis: AnalysisResult): ComplexityScore {
    const normalized = text.toLowerCase();

    // 组件复杂度
    const componentComplexity = this.scoreComponentComplexity(analysis);

    // 协调复杂度
    const coordinativeComplexity = this.scoreCoordinativeComplexity(text, analysis);

    // 动态复杂度
    const dynamicComplexity = this.scoreDynamicComplexity(text, analysis);

    return {
      component: Math.min(1, Math.max(0, componentComplexity)),
      coordinative: Math.min(1, Math.max(0, coordinativeComplexity)),
      dynamic: Math.min(1, Math.max(0, dynamicComplexity))
    };
  }

  /**
   * 评估组件复杂度
   */
  private scoreComponentComplexity(analysis: AnalysisResult): number {
    let score = 0;

    // 基于实体数量
    const entityCount = Object.values(analysis.entities).flat().length;
    score += Math.min(entityCount * 0.1, 0.4);

    // 基于文本长度
    if (analysis.text_length > 500) score += 0.2;
    if (analysis.text_length > 1000) score += 0.2;

    // 基于句子数量
    if (analysis.sentence_count > 5) score += 0.1;
    if (analysis.sentence_count > 10) score += 0.1;

    return score;
  }

  /**
   * 评估协调复杂度
   */
  private scoreCoordinativeComplexity(text: string, analysis: AnalysisResult): number {
    let score = 0;

    // 跨文件操作
    const fileCount = analysis.entities.files?.length || 0;
    if (fileCount > 1) score += 0.2;
    if (fileCount > 3) score += 0.2;

    // 协作关键词
    if (/集成|整合|coordinate|integrate|collaborate/i.test(text)) score += 0.2;

    // 并行关键词
    if (analysis.keywords.features.includes('parallel')) score += 0.2;

    // 依赖关键词
    if (/依赖|dependency|requires|depends on/i.test(text)) score += 0.2;

    return score;
  }

  /**
   * 评估动态复杂度
   */
  private scoreDynamicComplexity(text: string, analysis: AnalysisResult): number {
    let score = 0;

    // 条件逻辑
    if (/条件|判断|if.*else|switch|条件分支/i.test(text)) score += 0.2;

    // 循环
    if (/循环|遍历|loop|iterate|for.*while/i.test(text)) score += 0.2;

    // 异步操作
    if (/异步|async|await|promise|回调|callback/i.test(text)) score += 0.2;

    // 状态管理
    if (/状态|state|store|redux|context/i.test(text)) score += 0.2;

    // 动态特性
    if (/动态|dynamic|runtime|运行时/i.test(text)) score += 0.2;

    return score;
  }

  /**
   * 推断任务类型
   */
  private inferType(text: string, analysis: AnalysisResult): TaskType {
    const types = analysis.keywords.type;

    if (types.length === 0) {
      return 'coding'; // 默认为编码任务
    }

    // 优先级: debugging > testing > coding > review > analysis > documentation
    const priority: TaskType[] = ['debugging', 'testing', 'coding', 'review', 'analysis', 'documentation'];

    for (const type of priority) {
      if (types.includes(type)) {
        return type;
      }
    }

    return types[0];
  }

  /**
   * 规模估算
   */
  private estimateScale(
    text: string,
    analysis: AnalysisResult,
    complexity: ComplexityScore
  ): TaskFeatures['scale'] {
    const overallComplexity = (complexity.component + complexity.coordinative + complexity.dynamic) / 3;

    // 结合分析结果和复杂度来确定规模
    let scale_level = analysis.scale_level;

    // 如果复杂度高，提升规模等级
    if (overallComplexity > 0.7 && scale_level !== 'very_large') {
      const levels: Array<'small' | 'medium' | 'large' | 'very_large'> =
        ['small', 'medium', 'large', 'very_large'];
      const currentIndex = levels.indexOf(scale_level);
      scale_level = Math.min(currentIndex + 1, 3) as typeof scale_level;
    }

    const scale = {
      estimated_subtasks: SCALE_ESTIMATORS.subtasks[scale_level],
      estimated_duration: SCALE_ESTIMATORS.duration[scale_level],
      estimated_tokens: SCALE_ESTIMATORS.tokens[scale_level],
      estimated_files: SCALE_ESTIMATORS.files[scale_level]
    };

    // 根据实体数量微调
    const entityCount = Object.values(analysis.entities).flat().length;
    if (entityCount > 0) {
      scale.estimated_files = Math.max(scale.estimated_files, entityCount);
      scale.estimated_subtasks = Math.max(scale.estimated_subtasks, entityCount);
    }

    return scale;
  }

  /**
   * 识别特征标记
   */
  private identifyFlags(text: string, analysis: AnalysisResult): TaskFeatures['flags'] {
    const normalized = text.toLowerCase();

    return {
      needs_tdd: analysis.keywords.features.includes('tdd') ||
        /测试|test/i.test(text) && analysis.keywords.type.includes('coding'),
      needs_review: analysis.keywords.features.includes('review') ||
        /审核|审查|review|check/i.test(text),
      needs_parallel: analysis.keywords.features.includes('parallel'),
      needs_negotiation: /协商|沟通|讨论|negotiate|discuss|communicate/i.test(text),
      needs_design: analysis.keywords.features.includes('design') ||
        /设计|架构|design|architecture/i.test(text),
      needs_decompose: analysis.scale_level !== 'small' &&
        (analysis.entities.files?.length || 0) > 1,
      needs_security: analysis.keywords.features.includes('security') ||
        /安全|security|认证|授权|auth/i.test(text),
      needs_integration: /集成|整合|integration|integrate/i.test(text),
      needs_doc: analysis.keywords.type.includes('documentation') ||
        /文档|document|readme|comment/i.test(text),
      needs_refactor: /重构|refactor|优化|optimize|improve/i.test(text)
    };
  }

  /**
   * 评估质量要求
   */
  private assessQuality(text: string, analysis: AnalysisResult): QualityRequirement {
    const qualities = analysis.keywords.quality;

    if (qualities.includes('critical')) {
      return 'critical';
    }
    if (qualities.includes('high')) {
      return 'high';
    }
    if (qualities.includes('low')) {
      return 'low';
    }

    // 默认根据复杂度判断
    const overallComplexity = analysis.scale_level === 'very_large' ? 0.9 :
                             analysis.scale_level === 'large' ? 0.6 :
                             analysis.scale_level === 'medium' ? 0.4 : 0.2;

    if (overallComplexity > 0.7) return 'high';
    if (overallComplexity > 0.4) return 'normal';
    return 'low';
  }

  /**
   * 提取技术栈信息
   */
  private extractTechStack(text: string): TaskFeatures['tech_stack'] {
    const techPatterns = {
      languages: [
        /typescript|javascript|ts|js/gi,
        /python|py/gi,
        /java/gi,
        /go|golang/gi,
        /rust|rs/gi,
        /c\+\+|cpp/gi,
        /c\#/gi,
        /swift/gi,
        /kotlin/gi,
        /ruby/gi,
        /php/gi,
        /scala/gi,
        /dart/gi
      ],
      frameworks: [
        /react|reactjs/gi,
        /vue/gi,
        /angular/gi,
        /svelte/gi,
        /nextjs|next\.js/gi,
        /nuxt/gi,
        /express/gi,
        /fastapi/gi,
        /django/gi,
        /flask/gi,
        /spring|springboot/gi,
        /rails/gi,
        /laravel/gi,
        /vite/gi,
        /webpack/gi
      ],
      libraries: [
        /lodash|underscore/gi,
        /moment/gi,
        /axios/gi,
        /jquery/gi,
        /redux|zustand/gi,
        /tailwindcss/gi,
        /bootstrap/gi,
        /materialui|mui/gi,
        /antd|antdesign/gi,
        /testinglibrary|jest|mocha|cypress/gi
      ]
    };

    const normalized = text.toLowerCase();
    const extractMatches = (patterns: RegExp[]): string[] => {
      const matches = new Set<string>();
      for (const pattern of patterns) {
        const found = text.match(pattern);
        if (found) {
          found.forEach(m => matches.add(m.toLowerCase()));
        }
      }
      return Array.from(matches);
    };

    return {
      languages: extractMatches(techPatterns.languages),
      frameworks: extractMatches(techPatterns.frameworks),
      libraries: extractMatches(techPatterns.libraries)
    };
  }

  /**
   * 提取域特定特征
   */
  private extractDomainFeatures(text: string, type: TaskType): Record<string, any> {
    const features: Record<string, any> = {};

    // 编码任务特有特征
    if (type === 'coding') {
      features.is_api_task = /api|接口|endpoint|route/gi.test(text);
      features.is_ui_task = /ui|界面|界面|component|组件/gi.test(text);
      features.is_db_task = /数据库|database|db|sql|mongodb/gi.test(text);
    }

    // 分析任务特有特征
    if (type === 'analysis') {
      features.is_performance_analysis = /性能|performance|optimize|优化/gi.test(text);
      features.is_security_analysis = /安全|security|漏洞|vulnerability/gi.test(text);
    }

    // 调试任务特有特征
    if (type === 'debugging') {
      features.is_crash_bug = /crash|崩溃|fatal/gi.test(text);
      features.is_performance_bug = /slow|性能|超时|timeout/gi.test(text);
      features.is_logic_bug = /逻辑|不正确|错误行为/gi.test(text);
    }

    return features;
  }

  /**
   * 应用自定义规则
   */
  private applyCustomRules(features: TaskFeatures, text: string): void {
    if (!this.options.custom_rules || this.options.custom_rules.length === 0) {
      return;
    }

    for (const rule of this.options.custom_rules) {
      if (this.matchesCondition(rule, features, text)) {
        this.applyRuleAction(rule, features);
      }
    }
  }

  /**
   * 检查规则条件是否匹配
   */
  private matchesCondition(rule: any, features: TaskFeatures, text: string): boolean {
    // 简化版规则匹配，实际应用中需要完整的条件解析器
    return false;
  }

  /**
   * 应用规则动作
   */
  private applyRuleAction(rule: any, features: TaskFeatures): void {
    // 根据规则类型修改特征
  }

  /**
   * 提取实体（文件、函数等）
   */
  private extractEntities(text: string): AnalysisResult['entities'] {
    const entities: AnalysisResult['entities'] = {};

    // 提取文件名
    const filePattern = /['"`]([a-zA-Z0-9_\-./]+\.(ts|js|py|java|go|rs|cpp|h))['"`]/g;
    const files = text.match(filePattern)?.map(m => m.replace(/['"`]/g, '')) || [];
    if (files.length > 0) entities.files = [...new Set(files)];

    // 提取函数名
    const functionPattern = /(?:function|def|func)\s+(\w+)/g;
    const functions = text.match(functionPattern)?.map(m => m.split(/\s+/)[1]) || [];
    if (functions.length > 0) entities.functions = [...new Set(functions)];

    // 提取类名
    const classPattern = /class\s+(\w+)/g;
    const classes = text.match(classPattern)?.map(m => m.split(/\s+/)[1]) || [];
    if (classes.length > 0) entities.classes = [...new Set(classes)];

    return entities;
  }

  /**
   * 检查文本是否包含任意关键词
   */
  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(text: string): string {
    return text.trim().substring(0, 100);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * 创建默认的分析器实例
 */
export function createTaskAnalyzer(options?: AnalyzeOptions): TaskAnalyzer {
  return new TaskAnalyzer(options);
}
