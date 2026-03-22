# AgentGraph 节点实现详细设计

> 本文档详细描述节点执行器、图形界面、自动生成算法和自定义节点机制

---

## 一、节点执行器设计

### 1.1 执行器架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Node Executor 架构                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ NodeLoader  │───▶│ NodeRegistry│───▶│ NodeExecutor│            │
│  │ 节点加载器  │    │ 节点注册表  │    │ 节点执行器  │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    Executor Context                              │ │
│  │  - workflow_state: 工作流全局状态                                 │ │
│  │  - task_context: 当前任务上下文                                   │ │
│  │  - agent_pool: 可用 Agent 池                                      │ │
│  │  - mcp_registry: MCP 工具注册表                                  │ │
│  │  - event_bus: 事件总线                                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 节点执行器基类

```typescript
// base-node-executor.ts
import { INode, NodeContext, NodeResult } from './types';

export abstract class BaseNodeExecutor {
  protected node: INode;

  constructor(node: INode) {
    this.node = node;
  }

  /**
   * 验证输入
   */
  protected validateInputs(inputs: Record<string, any>): void {
    for (const port of this.node.inputs) {
      if (port.required && !(port.name in inputs)) {
        if (port.defaultValue !== undefined) {
          inputs[port.name] = port.defaultValue;
        } else {
          throw new Error(`Missing required input: ${port.name}`);
        }
      }
    }
  }

  /**
   * 执行节点 - 子类实现
   */
  abstract execute(context: NodeContext): Promise<NodeResult>;

  /**
   * 包装执行结果
   */
  protected success(outputs: Record<string, any>): NodeResult {
    return { success: true, outputs };
  }

  /**
   * 包装错误结果
   */
  protected failure(error: Error): NodeResult {
    return { success: false, outputs: {}, error };
  }
}
```

### 1.3 内置节点执行器实现

#### 1.3.1 Receive 节点

```typescript
// executors/receive-executor.ts
export class ReceiveExecutor extends BaseNodeExecutor {
  async execute(context: NodeContext): Promise<NodeResult> {
    const { raw_input } = context.inputs;
    const parser = context.config.parser || 'auto';

    // 解析输入
    let parsed_task;
    switch (parser) {
      case 'json':
        parsed_task = JSON.parse(raw_input);
        break;
      case 'yaml':
        parsed_task = parseYaml(raw_input);
        break;
      case 'text':
        parsed_task = { description: raw_input };
        break;
      case 'auto':
      parsed_task = this.autoDetect(raw_input);
        break;
    }

    // 提取实体（可选）
    if (context.config.extract_entities) {
      parsed_task.entities = await this.extractEntities(parsed_task);
    }

    return this.success({
      raw_input,
      parsed_task
    });
  }

  private autoDetect(input: any): any {
    // 自动检测输入类型
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        return { type: 'json', data: parsed };
      } catch {
        return { type: 'text', description: input };
      }
    }
    return { type: 'object', data: input };
  }
}
```

#### 1.3.2 Understand 节点

```typescript
// executors/understand-executor.ts
export class UnderstandExecutor extends BaseNodeExecutor {
  async execute(context: NodeContext): Promise<NodeResult> {
    const task = context.inputs.task;
    const depth = context.config.depth || 'medium';

    // 构建理解提示
    const understanding = await this.analyzeTask(task, depth);

    // 如果需要澄清问题
    if (context.config.ask_clarifying_questions && understanding.ambiguities.length > 0) {
      understanding.clarifying_questions = this.generateQuestions(understanding.ambiguities);
    }

    return this.success({
      understanding,
      complexity: understanding.complexity,
      required_capabilities: understanding.required_capabilities
    });
  }

  private async analyzeTask(task: any, depth: string) {
    // 深度分析任务
    const analysisPrompt = this.buildAnalysisPrompt(task, depth);

    // 调用 LLM
    const response = await context.state.llmClient.chat(analysisPrompt);

    return this.parseAnalysis(response);
  }
}
```

#### 1.3.3 Review 节点

```typescript
// executors/review-executor.ts
export class ReviewExecutor extends BaseNodeExecutor {
  async execute(context: NodeContext): Promise<NodeResult> {
    const artifact = context.inputs.artifact;
    const criteria = context.inputs.criteria || this.getDefaultCriteria(artifact);
    const strictness = context.config.strictness || 'normal';

    // 执行审核
    const reviewResult = await this.performReview(artifact, criteria, strictness);

    // 根据严格度和结果决定是否通过
    const threshold = this.getThreshold(strictness);
    const approved = reviewResult.score >= threshold;

    return this.success({
      approved,
      score: reviewResult.score,
      issues: reviewResult.issues,
      suggestions: reviewResult.suggestions,
      revised_content: approved ? null : await this.suggestRevisions(artifact, reviewResult.issues)
    });
  }

  private getThreshold(strictness: string): number {
    return { loose: 0.5, normal: 0.7, strict: 0.9 }[strictness];
  }
}
```

#### 1.3.4 Parallel 节点

```typescript
// executors/parallel-executor.ts
export class ParallelExecutor extends BaseNodeExecutor {
  async execute(context: NodeContext): Promise<NodeResult> {
    const tasks = context.inputs.tasks;
    const maxConcurrent = context.config.max_concurrent || 5;

    // 并行执行任务
    const results = await this.executeInParallel(tasks, maxConcurrent, context);

    return this.success({
      results,
      success_count: results.filter(r => r.success).length,
      failure_count: results.filter(r => !r.success).length
    });
  }

  private async executeInParallel(
    tasks: any[],
    maxConcurrent: number,
    context: NodeContext
  ): Promise<any[]> {
    const results: any[] = [];

    // 使用并发控制
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(task => this.executeSubtask(task, context))
      );
      results.push(...batchResults);
    }

    return results;
  }
}
```

---

## 二、图形界面设计

### 2.1 技术栈

```
前端框架: React 18 + TypeScript
图形库: ReactFlow 11.x
状态管理: Zustand 4.x
样式: Tailwind CSS 3.x
UI 组件: shadcn/ui
国际化: react-i18next
```

### 2.2 组件结构

```
src/
├── components/
│   ├── Canvas/
│   │   ├── WorkflowCanvas.tsx      # 主画布组件
│   │   ├── NodeRenderer.tsx        # 节点渲染器
│   │   └── EdgeRenderer.tsx        # 边渲染器
│   │
│   ├── Panel/
│   │   ├── NodePanel.tsx           # 左侧节点面板
│   │   ├── ConfigPanel.tsx         # 右侧配置面板
│   │   └── CategorySection.tsx     # 分类区块
│   │
│   ├── Node/
│   │   ├── BaseNode.tsx            # 基础节点组件
│   │   ├── InputNode.tsx           # 输入节点
│   │   ├── PlanningNode.tsx        # 规划节点
│   │   ├── ExecuteNode.tsx         # 执行节点
│   │   └── ...
│   │
│   └── Dialog/
│       ├── NodeConfigDialog.tsx    # 节点配置弹窗
│       └── CustomNodeDialog.tsx    # 自定义节点弹窗
│
├── hooks/
│   ├── useWorkflow.ts            # 工作流状态管理
│   ├── useNodes.ts               # 节点管理
│   └── useAutoLayout.ts           # 自动布局
│
├── stores/
│   ├── workflowStore.ts          # 工作流状态
│   └── nodeRegistryStore.ts       # 节点注册表
│
└── utils/
    ├── nodeUtils.ts               # 节点工具函数
    └── validation.ts               # 验证函数
```

### 2.3 核心组件代码

#### 2.3.1 节点面板

```tsx
// components/Panel/NodePanel.tsx
import { useTranslation } from 'react-i18next';
import { CategorySection } from './CategorySection';
import { nodeRegistry } from '@/stores/nodeRegistryStore';

export function NodePanel() {
  const { t } = useTranslation();

  const categories = [
    { id: 'input', icon: '📥', color: 'blue' },
    { id: 'planning', icon: '📋', color: 'purple' },
    { id: 'execution', icon: '⚡', color: 'orange' },
    { id: 'review', icon: '✅', color: 'green' },
    { id: 'decision', icon: '🔀', color: 'yellow' },
    { id: 'coordinate', icon: '🔗', color: 'cyan' },
    { id: 'output', icon: '📤', color: 'gray' },
  ];

  return (
    <div className="w-64 border-r bg-card p-4 overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{t('nodes.title')}</h2>
        <p className="text-sm text-muted">{t('nodes.subtitle')}</p>
      </div>

      <div className="space-y-4">
        {categories.map(cat => (
          <CategorySection
            key={cat.id}
            category={cat.id}
            icon={cat.icon}
            color={cat.color}
            nodes={nodeRegistry.getNodesByCategory(cat.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

#### 2.3.2 分类区块

```tsx
// components/Panel/CategorySection.tsx
import { useTranslation } from 'react-i18next';
import { DraggableNode } from './DraggableNode';

interface Props {
  category: NodeCategory;
  icon: string;
  color: string;
  nodes: INode[];
}

export function CategorySection({ category, icon, color, nodes }: Props) {
  const { t } = useTranslation();

  return (
    <div className="border-b pb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="font-medium">{t(`categories.${category}`)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {nodes.map(node => (
          <DraggableNode key={node.id} node={node} color={color} />
        ))}
      </div>
    </div>
  );
}
```

#### 2.3.3 可拖拽节点

```tsx
// components/Panel/DraggableNode.tsx
import { useDrag } from 'react-dnd';

interface Props {
  node: INode;
  color: string;
}

export function DraggableNode({ node, color }: Props) {
  const { t } = useTranslation();

  const [{ isDragging }, drag] = useDrag({
    type: 'NODE',
    item: { nodeType: node.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  return (
    <div
      ref={drag}
      className={cn(
        "p-2 rounded-md cursor-grab border transition-all",
        `border-${color}-300 bg-${color}-50`,
        "hover:shadow-md",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2">
        <span>{node.icon}</span>
        <span className="text-sm font-medium">
          {node.name[t('language')] || node.name.en}
        </span>
      </div>
    </div>
  );
}
```

#### 2.3.4 工作流画布

```tsx
// components/Canvas/WorkflowCanvas.tsx
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
} from 'reactflow';

import 'reactflow/dist/style.css';

export function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
    }, eds));
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const nodeType = event.dataTransfer.getData('application/reactflow');
    const position = screenToFlowPosition(
      event.clientX,
      event.clientY
    );

    const newNode = createNodeFromType(nodeType, position);
    setNodes((nds) => [...nds, newNode]);
  }, []);

  return (
    <div className="flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

### 2.4 节点类型定义

```tsx
// 自定义节点类型
const nodeTypes = {
  // 输入节点
  receive: ({ data }) => (
    <BaseNode data={data} color="blue">
      <Handle type="source" position={Position.Bottom} />
    </BaseNode>
  ),

  // 规划节点
  analyze: ({ data }) => (
    <PlanningNode data={data}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </PlanningNode>
  ),

  // 执行节点
  code: ({ data }) => (
    <ExecuteNode data={data}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </ExecuteNode>
  ),

  // 决策节点（多输出）
  branch: ({ data }) => (
    <DecisionNode data={data}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} id="true" />
      <Handle type="source" position={Position.Right} id="false" />
    </DecisionNode>
  ),

  // 并行节点
  parallel: ({ data }) => (
    <CoordinateNode data={data}>
      <Handle type="target" position={Position.Top} />
      {/* 动态生成多个输出 Handle */}
      {data.outputs?.map((_, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`output-${i}`}
          style={{ left: `${(i + 1) * 20}%` }}
        />
      ))}
    </CoordinateNode>
  ),
};
```

---

## 三、自动生成算法

### 3.1 任务特征提取

```typescript
// lib/task-analyzer.ts
interface TaskFeatures {
  // 复杂度
  complexity: {
    component: number;      // 组件复杂度 (0-1)
    coordinative: number;   // 协调复杂度 (0-1)
    dynamic: number;        // 动态复杂度 (0-1)
  };

  // 任务类型
  type: 'coding' | 'analysis' | 'documentation' | 'review' | 'testing';

  // 规模
  estimated_subtasks: number;
  estimated_duration: number;  // 分钟
  estimated_tokens: number;

  // 特征
  needs_tdd: boolean;
  needs_review: boolean;
  needs_parallel: boolean;
  needs_negotiation: boolean;
  needs_design: boolean;
  needs_decompose: boolean;

  // 质量要求
  quality_requirement: 'low' | 'normal' | 'high' | 'critical';
}

export class TaskAnalyzer {
  async analyze(taskDescription: string): Promise<TaskFeatures> {
    // 1. 基础分析
    const basicAnalysis = await this.basicAnalyze(taskDescription);

    // 2. 复杂度评估
    const complexity = this.assessComplexity(basicAnalysis);

    // 3. 类型判断
    const type = this.inferType(basicAnalysis);

    // 4. 特征识别
    const features = await this.identifyFeatures(taskDescription, basicAnalysis);

    return {
      complexity,
      type,
      ...features
    };
  }

  private assessComplexity(analysis: any): ComplexityScore {
    return {
      component: this.scoreComponentComplexity(analysis),
      coordinative: this.scoreCoordinativeComplexity(analysis),
      dynamic: this.scoreDynamicComplexity(analysis)
    };
  }

  private scoreComponentComplexity(analysis: any): number {
    let score = 0;

    // 文件数量
    if (analysis.file_count > 10) score += 0.3;
    else if (analysis.file_count > 5) score += 0.2;
    else if (analysis.file_count > 1) score += 0.1;

    // 代码行数
    if (analysis.estimated_loc > 500) score += 0.3;
    else if (analysis.estimated_loc > 100) score += 0.2;

    // 依赖数量
    if (analysis.dependencies > 5) score += 0.2;

    return Math.min(score, 1);
  }

  private scoreCoordinativeComplexity(analysis: any): number {
    let score = 0;

    // 跨文件修改
    if (analysis.cross_file) score += 0.3;

    // 需要协作
    if (analysis.needs_collaboration) score += 0.3;

    // 有依赖关系
    if (analysis.dependencies > 0) score += 0.2;

    // 需要同步
    if (analysis.needs_sync) score += 0.2;

    return Math.min(score, 1);
  }
}
```

### 3.2 工作流生成器

```typescript
// lib/workflow-generator.ts
import { TaskFeatures } from './task-analyzer';

interface GeneratedWorkflow {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  metadata: {
    generated_at: Date;
    based_on_features: TaskFeatures;
    confidence: number;
  };
}

export class WorkflowGenerator {
  /**
   * 根据任务特征生成工作流
   */
  generate(features: TaskFeatures): GeneratedWorkflow {
    const nodes: NodeDefinition[] = [];
    const edges: EdgeDefinition[] = [];

    // ===== 1. 输入阶段（必选）=====
    nodes.push(this.createNode('receive', { x: 250, y: 50 }));
    nodes.push(this.createNode('understand', {
      x: 250,
      y: 150,
      config: { depth: features.complexity.component > 0.5 ? 'deep' : 'medium' }
    }));
    edges.push(this.createEdge('receive', 'understand'));

    let currentNode = 'understand';

    // ===== 2. 规划阶段（复杂度 > 0.3 时添加）=====
    if (this.overallComplexity(features.complexity) > 0.3) {
      nodes.push(this.createNode('analyze', { x: 250, y: 250 }));
      edges.push(this.createEdge(currentNode, 'analyze'));
      currentNode = 'analyze';

      if (features.needs_design) {
        nodes.push(this.createNode('design', { x: 250, y: 350 }));
        edges.push(this.createEdge(currentNode, 'design'));
        currentNode = 'design';
      }

      if (features.needs_decompose && features.estimated_subtasks > 1) {
        nodes.push(this.createNode('decompose', {
          x: 250,
          y: 450,
          config: { strategy: features.needs_parallel ? 'parallel' : 'sequential' }
        }));
        edges.push(this.createEdge(currentNode, 'decompose'));
        currentNode = 'decompose';
      }
    }

    // ===== 3. 执行阶段 =====
    if (features.type === 'coding') {
      // TDD 模式
      if (features.needs_tdd) {
        nodes.push(this.createNode('test', {
          x: 250,
          y: 550,
          config: { test_type: 'write' }
        }));
        edges.push(this.createEdge(currentNode, 'test'));

        nodes.push(this.createNode('code', { x: 250, y: 650 }));
        edges.push(this.createEdge('test', 'code'));

        nodes.push(this.createNode('validate', {
          x: 250,
          y: 750,
          config: { test_type: 'run' }
        }));
        edges.push(this.createEdge('code', 'validate'));

        // TDD 循环
        nodes.push(this.createNode('loop', {
          x: 250,
          y: 850,
          config: {
            condition: 'test_failed',
            max_iterations: 3
          }
        }));
        edges.push(this.createEdge('validate', 'loop'));
        edges.push(this.createEdge('loop', 'code', { label: 'retry' }));

        currentNode = 'loop';
      } else {
        nodes.push(this.createNode('code', { x: 250, y: 550 }));
        edges.push(this.createEdge(currentNode, 'code'));
        currentNode = 'code';
      }
    } else if (features.type === 'documentation' || features.type === 'analysis') {
      nodes.push(this.createNode('generate', { x: 250, y: 550 }));
      edges.push(this.createEdge(currentNode, 'generate'));
      currentNode = 'generate';
    }

    // ===== 4. 并行执行（如果需要）=====
    if (features.needs_parallel && features.estimated_subtasks > 1) {
      // 插入并行节点
      const parallelY = nodes[nodes.length - 1].position.y + 100;
      nodes.push(this.createNode('parallel', {
        x: 250,
        y: parallelY,
        config: { max_concurrent: Math.min(features.estimated_subtasks, 5) }
      }));

      // 替换最后的边
      const lastEdge = edges.pop();
      edges.push(this.createEdge(lastEdge.source, 'parallel'));

      // 并行执行节点
      for (let i = 0; i < features.estimated_subtasks; i++) {
        const execX = 100 + i * 150;
        const execNode = this.createNode(
          features.type === 'coding' ? 'code' : 'generate',
          { x: execX, y: parallelY + 100, id: `exec_${i + 1}` }
        );
        nodes.push(execNode);
        edges.push(this.createEdge('parallel', `exec_${i + 1}`));
      }

      // 汇聚节点
      const aggregateY = parallelY + 200;
      nodes.push(this.createNode('aggregate', { x: 250, y: aggregateY }));
      for (let i = 0; i < features.estimated_subtasks; i++) {
        edges.push(this.createEdge(`exec_${i + 1}`, 'aggregate'));
      }

      currentNode = 'aggregate';
    }

    // ===== 5. 审核阶段 =====
    if (features.quality_requirement === 'high' || features.quality_requirement === 'critical') {
      nodes.push(this.createNode('review', {
        x: 250,
        y: nodes[nodes.length - 1].position.y + 100,
        config: {
          strictness: features.quality_requirement === 'critical' ? 'strict' : 'normal',
          auto_fix: features.quality_requirement !== 'critical'
        }
      }));
      edges.push(this.createEdge(currentNode, 'review'));

      // 审核回环（如果需要人工确认）
      if (features.quality_requirement === 'critical') {
        nodes.push(this.createNode('branch', {
          x: 250,
          y: nodes[nodes.length - 1].position.y + 100,
          config: {
            condition: 'review_approved',
            true_branch: 'report',
            false_branch: currentNode
          }
        }));
        edges.push(this.createEdge('review', 'branch'));
        edges.push(this.createEdge('branch', currentNode, { label: 'rejected' }));
        currentNode = 'branch';
      } else {
        currentNode = 'review';
      }

      // 安全审计（如果是代码）
      if (features.type === 'coding') {
        nodes.push(this.createNode('security', {
          x: 250,
          y: nodes[nodes.length - 1].position.y + 100
        }));
        edges.push(this.createEdge(currentNode, 'security'));
        currentNode = 'security';
      }
    }

    // ===== 6. 输出阶段（必选）=====
    nodes.push(this.createNode('report', {
      x: 250,
      y: nodes[nodes.length - 1].position.y + 100
    }));
    edges.push(this.createEdge(currentNode, 'report'));

    return {
      nodes,
      edges,
      metadata: {
        generated_at: new Date(),
        based_on_features: features,
        confidence: this.calculateConfidence(features)
      }
    };
  }

  private overallComplexity(complexity: ComplexityScore): number {
    return (complexity.component + complexity.coordinative + complexity.dynamic) / 3;
  }
}
```

### 3.3 生成规则配置

```yaml
# config/generation-rules.yaml
rules:
  # 复杂度规则
  - name: "simple_task"
    condition: "complexity < 0.3"
    nodes:
      - receive
      - understand
      - code
      - report

  - name: "medium_task"
    condition: "complexity >= 0.3 AND complexity < 0.7"
    nodes:
      - receive
      - understand
      - analyze
      - code
      - report

  - name: "complex_task"
    condition: "complexity >= 0.7"
    nodes:
      - receive
      - understand
      - analyze
      - design
      - decompose
      - parallel
      - aggregate
      - report

  # 类型规则
  - name: "tdd_workflow"
    condition: "type == 'coding' AND needs_tdd"
    insert_after: "understand"
    nodes:
      - test: { test_type: write }
      - code
      - validate: { test_type: run }
      - loop: { condition: test_failed, max_iterations: 3 }
    edges:
      - [validate, loop]
      - [loop, code, retry]

  # 质量规则
  - name: "strict_review"
    condition: "quality_requirement == 'critical'"
    insert_after: "code"
    nodes:
      - review: { strictness: strict }
      - branch: { condition: review_approved }
      - security
```

---

## 四、自定义节点机制

### 4.1 自定义节点结构

```
custom-nodes/
├── my-node/
│   ├── node.yaml           # 节点定义
│   ├── executor.ts         # 执行器实现
│   ├── icon.svg            # 图标（可选）
│   └── README.md           # 文档（可选）
```

### 4.2 节点定义规范

```yaml
# node.yaml
id: "my-custom-node"
type: "custom"
category: "execution"

# 多语言支持
name:
  en: "My Custom Node"
  zh: "自定义节点"

description:
  en: "Does something custom"
  zh: "执行自定义操作"

# 图标（emoji 或 URL）
icon: "🔧"

# 输入端口
inputs:
  - name: "input_data"
    type: "any"
    required: true
    description:
      en: "Input data to process"
      zh: "要处理的输入数据"

# 输出端口
outputs:
  - name: "output_data"
    type: "any"
    description:
      en: "Processed output"
      zh: "处理后的输出"

# 配置 Schema
configSchema:
  type: object
  properties:
    param1:
      type: string
      default: "default_value"
      description:
        en: "First parameter"
        zh: "第一个参数"
    param2:
      type: number
      default: 10

# 依赖（可选）
dependencies:
  npm:
    - "lodash@^4.0.0"
  mcp:
    - "filesystem"
    - "github"

# 权限要求（可选）
permissions:
  filesystem:
    read: ["./src/**"]
    write: ["./output/**"]
  network:
    allowed_hosts:
      - "api.example.com"
```

### 4.3 执行器实现

```typescript
// executor.ts
import { BaseNodeExecutor, NodeContext, NodeResult } from 'agentgraph';

export default class MyCustomNodeExecutor extends BaseNodeExecutor {
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input_data } = context.inputs;
    const { param1, param2 } = context.config;

    try {
      // 1. 验证输入
      this.validateInputs(context.inputs);

      // 2. 执行自定义逻辑
      const output_data = await this.processData(input_data, param1, param2);

      // 3. 返回结果
      return this.success({ output_data });

    } catch (error) {
      return this.failure(error);
    }
  }

  private async processData(data: any, param1: string, param2: number): Promise<any> {
    // 自定义处理逻辑
    return {
      original: data,
      processed: true,
      metadata: {
        param1,
        param2,
        timestamp: new Date().toISOString()
      }
    };
  }
}
```

### 4.4 节点注册

```typescript
// 用户注册自定义节点
import { NodeRegistry } from 'agentgraph';
import MyCustomNode from './custom-nodes/my-node';

// 方式 1: 编程注册
NodeRegistry.register({
  node: MyCustomNode.nodeDefinition,
  executor: MyCustomNode.executor
});

// 方式 2: 配置文件注册
// agentgraph.config.ts
export default {
  customNodes: [
    './custom-nodes/my-node',
    './custom-nodes/another-node'
  ]
};
```

### 4.5 CLI 创建自定义节点

```bash
# 创建新节点
agentgraph node create my-custom-node

# 生成的文件结构
custom-nodes/my-custom-node/
├── node.yaml           # 节点定义（已填充模板）
├── executor.ts         # 执行器模板
└── README.md           # 文档模板

# 验证节点定义
agentgraph node validate my-custom-node

# 测试节点
agentgraph node test my-custom-node --input '{"input_data": "test"}'
```

---

## 五、完整使用示例

### 5.1 用户拖拽创建工作流

```typescript
// 1. 用户从面板拖拽节点
const workflow = useWorkflowStore();

// 2. 添加节点到画布
workflow.addNode('receive', { x: 100, y: 100 });
workflow.addNode('understand', { x: 100, y: 200 });
workflow.addNode('code', { x: 100, y: 300 });
workflow.addNode('review', { x: 100, y: 400 });
workflow.addNode('report', { x: 100, y: 500 });

// 3. 连接节点
workflow.addEdge('receive', 'understand');
workflow.addEdge('understand', 'code');
workflow.addEdge('code', 'review');
workflow.addEdge('review', 'report');

// 4. 配置节点
workflow.updateNodeConfig('review', {
  strictness: 'strict'
});

// 5. 导出工作流
const workflowYaml = workflow.exportToYaml();
```

### 5.2 系统自动生成工作流

```typescript
// 1. 分析任务
const analyzer = new TaskAnalyzer();
const features = await analyzer.analyze(`
  实现一个用户认证模块，  包含登录、注册、密码重置功能
  需要写单元测试
  代码质量要求高
`);

// 2. 生成工作流
const generator = new WorkflowGenerator();
const workflow = generator.generate(features);

// 3. 在 UI 中显示
setNodes(workflow.nodes);
setEdges(workflow.edges);

// 4. 用户可以微调
// ... 拖拽调整节点位置、修改配置等

// 5. 执行工作流
await executor.execute(workflow);
```

---

## 六、总结

| 模块 | 核心功能 | 关键技术 |
|------|---------|---------|
| **节点执行器** | 执行每个节点的逻辑 | TypeScript 类继承、验证机制 |
| **图形界面** | 拖拽式工作流设计 | ReactFlow、Zustand、i18n |
| **自动生成** | 基于任务特征组装工作流 | 特征提取、规则引擎 |
| **自定义节点** | 用户扩展节点类型 | YAML 定义、TypeScript 执行器 |

### 设计亮点

1. **7 大类 25+ 节点** - 覆盖所有工作流场景
2. **三层能力** - 拖拽、自动生成、自定义
3. **多语言支持** - 中英文完整支持
4. **类型安全** - TypeScript 全栈类型检查
5. **可扩展** - 自定义节点机制
