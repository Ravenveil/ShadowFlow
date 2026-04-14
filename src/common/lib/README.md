# ShadowFlow 工作流自动生成算法

ShadowFlow 的核心模块，提供基于任务特征自动生成工作流的能力。

## 特性

- **智能分析**: 自动提取任务特征（复杂度、类型、规模、质量要求等）
- **规则引擎**: 可配置的 YAML 规则系统，支持复杂条件和动作
- **灵活生成**: 基于特征和规则动态生成工作流
- **高度可扩展**: 支持自定义规则、节点模板和工作流模式

## 快速开始

### 安装

```bash
npm install @shadowflow/generator
```

### 基础使用

```typescript
import { TaskAnalyzer, WorkflowGenerator } from '@shadowflow/generator';

// 1. 创建分析器并分析任务
const analyzer = new TaskAnalyzer();
const features = await analyzer.analyze('实现一个用户认证模块');

// 2. 创建生成器并生成工作流
const generator = new WorkflowGenerator();
const workflow = await generator.generate(features);

console.log(workflow.nodes);  // 节点列表
console.log(workflow.edges);   // 边列表
console.log(workflow.metadata.confidence);  // 置信度
```

### 便捷函数

```typescript
import { generateWorkflow } from '@shadowflow/generator';

// 一行代码生成工作流
const workflow = await generateWorkflow(
  await createTaskAnalyzer().analyze('实现一个 RESTful API')
);
```

## 核心组件

### TaskAnalyzer（任务分析器）

分析任务描述，提取任务特征：

```typescript
const analyzer = new TaskAnalyzer({
  use_llm: true,           // 使用 LLM 辅助分析
  llm_depth: 'standard',   // LLM 分析深度
  verbose: false           // 是否输出详细日志
});

const features = await analyzer.analyze('实现一个用户认证模块');
```

#### 任务特征

```typescript
{
  complexity: {
    component: 0.7,      // 组件复杂度
    coordinative: 0.5,   // 协调复杂度
    dynamic: 0.3         // 动态复杂度
  },
  type: 'coding',        // 任务类型
  scale: {
    estimated_subtasks: 5,
    estimated_duration: 30,
    estimated_tokens: 10000,
    estimated_files: 3
  },
  flags: {
    needs_tdd: true,
    needs_review: true,
    needs_parallel: false,
    needs_design: true,
    needs_decompose: true
  },
  quality_requirement: 'high',
  tech_stack: {
    languages: ['typescript'],
    frameworks: ['express'],
    libraries: ['jest']
  }
}
```

### RuleEngine（规则引擎）

解析和执行规则：

```typescript
import { RuleEngine } from '@shadowflow/generator';

const engine = new RuleEngine({
  rule_files: [
    './config/rules/complexity-rules.yaml',
    './config/rules/type-rules.yaml',
    './config/rules/quality-rules.yaml'
  ],
  conflict_resolution: 'highest_priority'
});

// 执行规则
const { workflow, report } = await engine.execute(features);
```

#### 规则格式

```yaml
- id: my_rule
  name: 我的规则
  priority: 50
  category: custom

  condition:
    type: compare
    field: overall_complexity
    operator: gt
    value: 0.7

  action:
    type: add_nodes
    nodes:
      - id: extra_node
        type: code
        position: { x: 250, y: 350 }
```

### WorkflowGenerator（工作流生成器）

根据特征生成工作流：

```typescript
const generator = new WorkflowGenerator({
  rule_engine: {
    rule_files: ['./config/rules/*.yaml']
  },
  auto_layout: true,
  confidence_threshold: 0.5,
  validate: true
});

const workflow = await generator.generate(features);
```

## 配置选项

### TaskAnalyzer 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| use_llm | boolean | true | 是否使用 LLM 辅助分析 |
| llm_depth | 'quick' \| 'standard' \| 'deep' | 'standard' | LLM 分析深度 |
| verbose | boolean | false | 是否输出详细日志 |
| custom_rules | Rule[] | [] | 自定义规则列表 |

### WorkflowGenerator 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| rule_engine | RuleEngineConfig | - | 规则引擎配置 |
| auto_layout | boolean | true | 是否启用自动布局 |
| confidence_threshold | number | 0.5 | 置信度阈值 |
| validate | boolean | true | 是否验证工作流 |

## 规则文件

规则文件位于 `config/rules/` 目录：

- `complexity-rules.yaml` - 复杂度规则
- `type-rules.yaml` - 类型规则
- `quality-rules.yaml` - 质量规则
- `parallel-rules.yaml` - 并行规则

详见 [规则配置文档](../../config/rules/README.md)

## API 参考

### TaskAnalyzer

```typescript
class TaskAnalyzer {
  constructor(options?: AnalyzeOptions)

  // 分析任务描述
  async analyze(taskDescription: string): Promise<TaskFeatures>

  // 分析并获取报告
  async analyzeWithReport(taskDescription: string): Promise<AnalyzerReport>

  // 清除缓存
  clearCache(): void
}
```

### WorkflowGenerator

```typescript
class WorkflowGenerator {
  constructor(config?: WorkflowGeneratorConfig)

  // 生成工作流
  async generate(features: TaskFeatures): Promise<GeneratedWorkflow>

  // 更新配置
  updateConfig(config: Partial<WorkflowGeneratorConfig>): void

  // 获取节点模板
  getNodeTemplate(type: string): NodeTemplate | undefined

  // 注册节点模板
  registerNodeTemplate(type: string, template: NodeTemplate): void
}
```

### RuleEngine

```typescript
class RuleEngine {
  constructor(config?: RuleEngineConfig)

  // 执行规则
  async execute(
    features: TaskFeatures,
    workflow?: GeneratedWorkflow
  ): Promise<{ workflow: GeneratedWorkflow; report: RuleEngineReport }>

  // 添加规则
  addRule(rule: Rule): void

  // 删除规则
  removeRule(ruleId: string): boolean

  // 获取规则
  getRule(ruleId: string): Rule | undefined

  // 获取所有规则
  getAllRules(): Rule[]

  // 获取按类别分组的规则
  getRulesByCategory(category: Rule['category']): Rule[]
}
```

## 示例

### TDD 工作流

```typescript
const features = await analyzer.analyze(`
  实现一个用户认证模块
  需要编写单元测试
  采用测试驱动开发
`);

const workflow = await generator.generate(features);
// 生成: receive -> understand -> test -> code -> validate -> loop -> report
```

### 并行执行工作流

```typescript
const features = await analyzer.analyze(`
  为多个模块编写单元测试
  需要 5 个测试文件
  可以并行执行
`);

const workflow = await generator.generate(features);
// 生成包含 parallel 节点和多个执行节点的工作流
```

### 关键质量要求工作流

```typescript
const features = await analyzer.analyze(`
  实现支付处理功能
  安全性要求极高
  需要安全审计
`);

const workflow = await generator.generate(features);
// 生成包含 review、security、performance_test 节点的工作流
```

## 贡献

欢迎贡献代码、报告问题或提出建议！

## 许可证

MIT License
