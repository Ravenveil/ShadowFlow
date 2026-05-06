/**
 * AI 代码助手示例
 *
 * 展示河流式记忆系统如何在工作流中流转
 *
 * 工作流：需求分析 → 架构设计 → 代码生成 → 测试 → 审核
 */

import {
  RiverMemorySystem,
  getMemorySystem,
  IMemoryChunk,
  IPattern,
} from '../../../src/memory';
import type { IRiverMemoryAccess } from '../../../src/types/node.types';

// ==================== 类型定义 ====================

interface UserRequirement {
  description: string;
  constraints?: string[];
  techStack?: string[];
}

interface RequirementAnalysis {
  coreFeatures: string[];
  constraints: string[];
  suggestedTech: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

interface DesignDecision {
  architecture: string;
  modules: string[];
  interfaces: { name: string; methods: string[] }[];
  dataModels: { name: string; fields: string[] }[];
}

interface GeneratedCode {
  files: { path: string; content: string }[];
  dependencies: string[];
  entryPoint: string;
}

interface TestResult {
  passed: number;
  failed: number;
  coverage: number;
  testFiles: string[];
}

interface ReviewResult {
  score: number;
  approved: boolean;
  issues: string[];
  suggestions: string[];
}

// ==================== 节点定义 ====================

/**
 * 节点基类
 */
abstract class WorkflowNode {
  protected name: string;
  protected memory: IRiverMemoryAccess;

  constructor(name: string, memorySystem: RiverMemorySystem) {
    this.name = name;
    this.memory = memorySystem.getNodeAccess(name);
  }

  abstract execute(): Promise<void>;

  /**
   * 记录日志
   */
  protected log(message: string, data?: any): void {
    console.log(`[${this.name}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * 需求分析节点
 *
 * 🌊 河流操作：
 * - drink(): 读取用户输入
 * - pour(): 输出分析结果
 * - settle(): 沉淀成功的分析模式
 */
class RequirementAnalysisNode extends WorkflowNode {
  private requirement: UserRequirement;

  constructor(requirement: UserRequirement, memorySystem: RiverMemorySystem) {
    super('requirement-analysis', memorySystem);
    this.requirement = requirement;
  }

  async execute(): Promise<RequirementAnalysis> {
    this.log('🥤 开始分析需求...');

    // 🥤 取水 - 获取沉淀层的需求分析模式
    const patterns = this.memory.dredge({ type: 'success_pattern' });
    const analysisPatterns = patterns.filter(p => p.content?.category === 'requirement_analysis');

    // 执行分析
    const analysis: RequirementAnalysis = {
      coreFeatures: this.extractFeatures(this.requirement.description),
      constraints: this.requirement.constraints || [],
      suggestedTech: this.requirement.techStack || ['TypeScript', 'Node.js'],
      estimatedComplexity: this.estimateComplexity(this.requirement.description),
    };

    // 🌊 注水 - 将分析结果汇入河流
    this.memory.pour({
      id: `analysis-${Date.now()}`,
      type: 'context',
      sourceNode: this.name,
      content: {
        type: 'requirement_analysis',
        analysis,
        rawRequirement: this.requirement,
      },
      metadata: {
        createdAt: new Date(),
        importance: 0.9,
      },
    });

    // 🏝️ 沉淀 - 如果分析质量高，沉淀模式
    if (analysis.coreFeatures.length >= 3) {
      this.memory.settle({
        id: `pattern-req-${Date.now()}`,
        type: 'success_pattern',
        content: {
          category: 'requirement_analysis',
          features: analysis.coreFeatures.slice(0, 3),
          techStack: analysis.suggestedTech,
        },
        importance: 0.7,
        reason: '成功识别多个核心功能',
        associatedNodes: [this.name],
      });
    }

    this.log('✅ 需求分析完成', analysis);
    return analysis;
  }

  private extractFeatures(description: string): string[] {
    // 简化的特征提取
    const keywords = ['API', '界面', '登录', '注册', '数据库', '缓存', '认证', '授权'];
    return keywords.filter(k => description.includes(k));
  }

  private estimateComplexity(description: string): 'low' | 'medium' | 'high' {
    const len = description.length;
    if (len < 50) return 'low';
    if (len < 200) return 'medium';
    return 'high';
  }
}

/**
 * 架构设计节点
 *
 * 🌊 河流操作：
 * - drink(): 读取需求分析结果
 * - dredge(): 获取之前的设计模式
 * - pour(): 输出设计决策
 */
class DesignNode extends WorkflowNode {
  constructor(memorySystem: RiverMemorySystem) {
    super('design', memorySystem);
  }

  async execute(): Promise<DesignDecision> {
    this.log('🥤 从河流取水 - 读取需求分析...');

    // 🥤 取水 - 读取上游的需求分析
    const contextMemory = this.memory.drink('context');
    const analysisMemory = contextMemory.find(
      c => c.content?.type === 'requirement_analysis'
    );

    if (!analysisMemory) {
      throw new Error('未找到需求分析结果');
    }

    const analysis = analysisMemory.content.analysis as RequirementAnalysis;

    // 🏝️ 从沉淀层挖掘 - 获取之前成功的设计模式
    const patterns = this.memory.dredge({ type: 'success_pattern' });
    const designPatterns = patterns.filter(p => p.content?.category === 'design');

    this.log(`🏝️ 挖掘到 ${designPatterns.length} 个设计模式`);

    // 执行设计
    const design: DesignDecision = {
      architecture: this.selectArchitecture(analysis),
      modules: this.defineModules(analysis),
      interfaces: this.defineInterfaces(analysis),
      dataModels: this.defineDataModels(analysis),
    };

    // 🌊 注水 - 将设计决策汇入河流
    this.memory.pour({
      id: `design-${Date.now()}`,
      type: 'context',
      sourceNode: this.name,
      content: {
        type: 'design_decision',
        design,
        basedOnAnalysis: analysisMemory.id,
      },
      metadata: {
        createdAt: new Date(),
        importance: 0.85,
      },
    });

    // 🏝️ 沉淀 - 记录设计模式
    this.memory.settle({
      id: `pattern-design-${Date.now()}`,
      type: 'success_pattern',
      content: {
        category: 'design',
        architecture: design.architecture,
        moduleCount: design.modules.length,
      },
      importance: 0.75,
      reason: '成功的设计模式',
      associatedNodes: [this.name],
    });

    this.log('✅ 架构设计完成', design);
    return design;
  }

  private selectArchitecture(analysis: RequirementAnalysis): string {
    const complexity = analysis.estimatedComplexity;
    if (complexity === 'high') return '微服务架构';
    if (complexity === 'medium') return '分层架构';
    return '单体架构';
  }

  private defineModules(analysis: RequirementAnalysis): string[] {
    const modules = ['core'];
    if (analysis.coreFeatures.includes('登录') || analysis.coreFeatures.includes('认证')) {
      modules.push('auth');
    }
    if (analysis.coreFeatures.includes('API')) {
      modules.push('api');
    }
    if (analysis.coreFeatures.includes('数据库')) {
      modules.push('data');
    }
    return modules;
  }

  private defineInterfaces(analysis: RequirementAnalysis): { name: string; methods: string[] }[] {
    return [
      { name: 'IUserService', methods: ['create', 'findByEmail', 'authenticate'] },
      { name: 'IAuthService', methods: ['login', 'logout', 'validateToken'] },
    ];
  }

  private defineDataModels(analysis: RequirementAnalysis): { name: string; fields: string[] }[] {
    return [
      { name: 'User', fields: ['id', 'email', 'password', 'createdAt'] },
    ];
  }
}

/**
 * 代码生成节点
 *
 * 🌊 河流操作：
 * - drink(): 读取设计和需求
 * - pour(): 输出生成的代码
 * - buildDam(): 创建检查点
 */
class CodeGenerationNode extends WorkflowNode {
  constructor(memorySystem: RiverMemorySystem) {
    super('code-generation', memorySystem);
  }

  async execute(): Promise<GeneratedCode> {
    this.log('🥤 从河流取水 - 读取设计决策...');

    // 🥤 取水 - 读取设计决策
    const contextMemory = this.memory.drink('context');
    const designMemory = contextMemory.find(
      c => c.content?.type === 'design_decision'
    );

    if (!designMemory) {
      throw new Error('未找到设计决策');
    }

    const design = designMemory.content.design as DesignDecision;

    // 🚧 建闸 - 代码生成前创建检查点
    const checkpointId = this.memory.buildDam();
    this.log(`🚧 建立检查点: ${checkpointId}`);

    // 执行代码生成
    const code: GeneratedCode = {
      files: this.generateFiles(design),
      dependencies: ['express', 'jsonwebtoken', 'bcrypt'],
      entryPoint: 'src/index.ts',
    };

    // 🌊 注水 - 将生成的代码汇入河流
    this.memory.pour({
      id: `code-${Date.now()}`,
      type: 'execution',
      sourceNode: this.name,
      content: {
        type: 'generated_code',
        files: code.files.map(f => f.path),
        totalLines: code.files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
        dependencies: code.dependencies,
      },
      metadata: {
        createdAt: new Date(),
        importance: 0.8,
      },
    });

    this.log('✅ 代码生成完成', {
      files: code.files.length,
      totalLines: code.files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
    });

    return code;
  }

  private generateFiles(design: DesignDecision): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];

    // 根据设计生成文件
    for (const module of design.modules) {
      files.push({
        path: `src/${module}/${module}.service.ts`,
        content: `// ${module} service\nexport class ${module}Service {\n  // TODO: implement\n}`,
      });
    }

    // 生成入口文件
    files.push({
      path: 'src/index.ts',
      content: `import express from 'express';\n\nconst app = express();\napp.listen(3000);`,
    });

    return files;
  }
}

/**
 * 测试节点
 *
 * 🌊 河流操作：
 * - drink(): 读取生成的代码
 * - openDam(): 如果测试失败，恢复到检查点
 */
class TestNode extends WorkflowNode {
  constructor(memorySystem: RiverMemorySystem) {
    super('test', memorySystem);
  }

  async execute(): Promise<TestResult> {
    this.log('🥤 从河流取水 - 读取生成的代码...');

    // 🥤 取水 - 读取生成的代码
    const execMemory = this.memory.drink('execution');
    const codeMemory = execMemory.find(
      c => c.content?.type === 'generated_code'
    );

    if (!codeMemory) {
      throw new Error('未找到生成的代码');
    }

    // 执行测试
    const result: TestResult = {
      passed: 8,
      failed: 0,
      coverage: 0.85,
      testFiles: ['auth.test.ts', 'user.test.ts'],
    };

    // 如果测试失败，可以开闸恢复
    if (result.failed > 0) {
      this.log('❌ 测试失败，准备开闸恢复...');
      const checkpoints = this.memory.listDams();
      if (checkpoints.length > 0) {
        this.memory.openDam(checkpoints[0].id);
      }
    } else {
      // 🌊 注水 - 记录测试结果
      this.memory.pour({
        id: `test-${Date.now()}`,
        type: 'execution',
        sourceNode: this.name,
        content: {
          type: 'test_result',
          ...result,
        },
        metadata: {
          createdAt: new Date(),
          importance: 0.7,
        },
      });
    }

    this.log('✅ 测试完成', result);
    return result;
  }
}

/**
 * 审核节点
 *
 * 🌊 河流操作：
 * - drink(): 读取所有相关记忆
 * - settle(): 沉淀审核模式
 */
class ReviewNode extends WorkflowNode {
  constructor(memorySystem: RiverMemorySystem) {
    super('review', memorySystem);
  }

  async execute(): Promise<ReviewResult> {
    this.log('🥤 从河流取水 - 读取所有执行记忆...');

    // 🥤 取水 - 读取所有相关记忆
    const allMemory = this.memory.drink();

    // 执行审核
    const result: ReviewResult = {
      score: 0.92,
      approved: true,
      issues: [],
      suggestions: ['考虑添加错误处理中间件'],
    };

    // 🌊 注水 - 记录审核结果
    this.memory.pour({
      id: `review-${Date.now()}`,
      type: 'execution',
      sourceNode: this.name,
      content: {
        type: 'review_result',
        ...result,
      },
      metadata: {
        createdAt: new Date(),
        importance: 0.9,
      },
    });

    // 🏝️ 沉淀 - 如果审核通过，记录成功模式
    if (result.approved) {
      this.memory.settle({
        id: `pattern-review-${Date.now()}`,
        type: 'success_pattern',
        content: {
          category: 'code',
          qualityScore: result.score,
          patterns: ['MVC', 'Dependency Injection'],
        },
        importance: 0.8,
        reason: '高质量代码模式',
        associatedNodes: ['code-generation', this.name],
      });
    }

    this.log('✅ 审核完成', result);
    return result;
  }
}

// ==================== 主程序 ====================

async function main() {
  console.log('🌊 ========================================');
  console.log('   AI 代码助手 - 河流式记忆演示');
  console.log('   ========================================\n');

  // 创建记忆系统
  const memorySystem = getMemorySystem({
    storagePath: './.workflow/memory',
  });

  // 用户需求
  const requirement: UserRequirement = {
    description: '创建一个用户登录API，支持邮箱和密码登录，需要包含JWT认证',
    constraints: ['必须使用TypeScript', '需要单元测试'],
    techStack: ['TypeScript', 'Express', 'JWT'],
  };

  console.log('📝 用户需求:', requirement.description);
  console.log('');

  try {
    // 1. 需求分析
    const analysisNode = new RequirementAnalysisNode(requirement, memorySystem);
    await analysisNode.execute();
    console.log('');

    // 2. 架构设计
    const designNode = new DesignNode(memorySystem);
    await designNode.execute();
    console.log('');

    // 3. 代码生成
    const codeNode = new CodeGenerationNode(memorySystem);
    await codeNode.execute();
    console.log('');

    // 4. 测试
    const testNode = new TestNode(memorySystem);
    await testNode.execute();
    console.log('');

    // 5. 审核
    const reviewNode = new ReviewNode(memorySystem);
    const reviewResult = await reviewNode.execute();
    console.log('');

    // 最终结果
    console.log('🎉 ========================================');
    console.log('   工作流执行完成！');
    console.log('   ========================================');
    console.log('');
    console.log('📊 最终状态:');
    console.log(`   审核得分: ${reviewResult.score}`);
    console.log(`   是否通过: ${reviewResult.approved ? '✅' : '❌'}`);
    console.log(`   建议改进: ${reviewResult.suggestions.join(', ') || '无'}`);

    // 查看河流状态
    console.log('');
    console.log('🌊 河流记忆状态:');
    const snapshot = memorySystem.getSnapshot();
    console.log(`   上下文记忆: ${snapshot.memoryPool.context.length} 条`);
    console.log(`   执行记忆: ${snapshot.memoryPool.execution.length} 条`);
    console.log(`   检查点数量: ${memorySystem.createCheckpoint('manual').id ? '已创建' : '无'}`);

  } catch (error) {
    console.error('❌ 执行失败:', error);
  }
}

// 运行
main();
