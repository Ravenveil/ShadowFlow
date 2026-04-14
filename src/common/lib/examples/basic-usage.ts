/**
 * ShadowFlow 工作流自动生成算法使用示例
 *
 * 演示如何使用任务分析器和工作流生成器
 */

import {
  TaskAnalyzer,
  WorkflowGenerator,
  createTaskAnalyzer,
  createWorkflowGenerator,
  generateWorkflow,
  TaskFeatures,
  GeneratedWorkflow
} from '../index.js';

/**
 * 示例 1: 基础使用 - 简单的编码任务
 */
async function example1_SimpleCodingTask() {
  console.log('\n=== 示例 1: 简单编码任务 ===\n');

  // 创建分析器
  const analyzer = createTaskAnalyzer();

  // 分析任务
  const taskDescription = '实现一个计算两个数之和的函数';
  const features: TaskFeatures = await analyzer.analyze(taskDescription);

  console.log('任务特征:', features);

  // 创建生成器
  const generator = createWorkflowGenerator();

  // 生成工作流
  const workflow: GeneratedWorkflow = await generator.generate(features);

  console.log('生成的节点:', workflow.nodes.map(n => n.type));
  console.log('生成的边:', workflow.edges.map(e => `${e.source} -> ${e.target}`));
  console.log('置信度:', workflow.metadata.confidence);
}

/**
 * 示例 2: TDD 模式
 */
async function example2_TDDWorkflow() {
  console.log('\n=== 示例 2: TDD 工作流 ===\n');

  const analyzer = createTaskAnalyzer();
  const generator = createWorkflowGenerator();

  const taskDescription = `
    实现一个用户认证模块
    需要编写单元测试
    采用测试驱动开发
    包括登录和注册功能
  `;

  const features = await analyzer.analyze(taskDescription);
  const workflow = await generator.generate(features);

  console.log('任务类型:', features.type);
  console.log('需要 TDD:', features.flags.needs_tdd);
  console.log('工作流节点:', workflow.nodes.map(n => ({ id: n.id, type: n.type })));
}

/**
 * 示例 3: 并行执行
 */
async function example3_ParallelExecution() {
  console.log('\n=== 示例 3: 并行执行工作流 ===\n');

  const analyzer = createTaskAnalyzer();
  const generator = createWorkflowGenerator();

  const taskDescription = `
    为多个模块编写单元测试
    需要 5 个测试文件
    可以并行执行
  `;

  const features = await analyzer.analyze(taskDescription);
  const workflow = await generator.generate(features);

  console.log('需要并行:', features.flags.needs_parallel);
  console.log('估算子任务数:', features.scale.estimated_subtasks);
  console.log('工作流包含的节点类型:', [
    ...new Set(workflow.nodes.map(n => n.type))
  ]);
}

/**
 * 示例 4: 高质量要求（关键任务）
 */
async function example4_CriticalQuality() {
  console.log('\n=== 示例 4: 关键质量要求工作流 ===\n');

  const analyzer = createTaskAnalyzer();
  const generator = createWorkflowGenerator();

  const taskDescription = `
    实现支付处理功能
    安全性要求极高
    需要安全审计
    代码质量要求严格
  `;

  const features = await analyzer.analyze(taskDescription);
  const workflow = await generator.generate(features);

  console.log('质量要求:', features.quality_requirement);
  console.log('需要安全审计:', features.flags.needs_security);
  console.log('工作流节点:', workflow.nodes.map(n => ({
    id: n.id,
    type: n.type,
    config: n.config
  })));
}

/**
 * 示例 5: 文档生成任务
 */
async function example5_DocumentationGeneration() {
  console.log('\n=== 示例 5: 文档生成工作流 ===\n');

  const analyzer = createTaskAnalyzer();
  const generator = createWorkflowGenerator();

  const taskDescription = `
    为 API 编写完整的文档
    包括概览、端点说明、示例代码
    需要生成多个章节
  `;

  const features = await analyzer.analyze(taskDescription);
  const workflow = await generator.generate(features);

  console.log('任务类型:', features.type);
  console.log('工作流节点:', workflow.nodes.map(n => n.type));
  console.log('应用的规则:', workflow.metadata.applied_rules);
}

/**
 * 示例 6: 使用自定义规则
 */
async function example6_CustomRules() {
  console.log('\n=== 示例 6: 使用自定义规则 ===\n');

  const analyzer = createTaskAnalyzer({
    use_llm: false,
    verbose: true
  });

  const generator = createWorkflowGenerator({
    rule_engine: {
      rule_files: [
        'E:/VScode/ShadowFlow/config/rules/complexity-rules.yaml',
        'E:/VScode/ShadowFlow/config/rules/type-rules.yaml',
        'E:/VScode/ShadowFlow/config/rules/quality-rules.yaml',
        'E:/VScode/ShadowFlow/config/rules/parallel-rules.yaml'
      ],
      conflict_resolution: 'highest_priority',
      use_default_rules: false
    },
    validate: true
  });

  const taskDescription = '实现一个复杂的电商平台后端服务';
  const features = await analyzer.analyze(taskDescription);
  const workflow = await generator.generate(features);

  console.log('复杂度:', features.complexity);
  console.log('工作流节点数:', workflow.nodes.length);
  console.log('工作流边数:', workflow.edges.length);
}

/**
 * 示例 7: 使用便捷函数
 */
async function example7_ConvenienceFunction() {
  console.log('\n=== 示例 7: 使用便捷函数 ===\n');

  const taskDescription = '开发一个简单的博客系统';

  // 一行代码生成工作流
  const workflow = await generateWorkflow(await createTaskAnalyzer().analyze(taskDescription));

  console.log('工作流生成完成!');
  console.log('节点:', workflow.nodes.map(n => n.type).join(' -> '));
  console.log('置信度:', workflow.metadata.confidence.toFixed(2));
}

/**
 * 示例 8: 获取详细分析报告
 */
async function example8_AnalyzerReport() {
  console.log('\n=== 示例 8: 获取分析报告 ===\n');

  const analyzer = createTaskAnalyzer({ verbose: true });

  const taskDescription = '实现一个 RESTful API 用于用户管理';
  const report = await analyzer.analyzeWithReport(taskDescription);

  console.log('分析耗时:', report.duration_ms, 'ms');
  console.log('分析方法:', report.methods);
  console.log('LLM 调用次数:', report.llm_calls);
  console.log('是否使用缓存:', report.cached);
  console.log('\n任务特征:', report.features);
}

/**
 * 示例 9: 工作流验证
 */
async function example9_WorkflowValidation() {
  console.log('\n=== 示例 9: 工作流验证 ===\n');

  const analyzer = createTaskAnalyzer();
  const generator = createWorkflowGenerator({ validate: true });

  const taskDescription = '实现一个复杂的数据处理管道';
  const features = await analyzer.analyze(taskDescription);

  try {
    const workflow = await generator.generate(features);
    console.log('工作流验证通过!');
    console.log('节点数:', workflow.nodes.length);
    console.log('边数:', workflow.edges.length);
  } catch (error) {
    console.error('工作流验证失败:', error);
  }
}

/**
 * 示例 10: 运行所有示例
 */
async function runAllExamples() {
  try {
    await example1_SimpleCodingTask();
    await example2_TDDWorkflow();
    await example3_ParallelExecution();
    await example4_CriticalQuality();
    await example5_DocumentationGeneration();
    await example6_CustomRules();
    await example7_ConvenienceFunction();
    await example8_AnalyzerReport();
    await example9_WorkflowValidation();

    console.log('\n=== 所有示例执行完成 ===\n');
  } catch (error) {
    console.error('示例执行出错:', error);
  }
}

// 如果直接运行此文件，执行所有示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_SimpleCodingTask,
  example2_TDDWorkflow,
  example3_ParallelExecution,
  example4_CriticalQuality,
  example5_DocumentationGeneration,
  example6_CustomRules,
  example7_ConvenienceFunction,
  example8_AnalyzerReport,
  example9_WorkflowValidation,
  runAllExamples
};
