# ShadowFlow Workflow Assembly Contract v1

> 日期：2026-04-01
> 状态：Draft
> 目的：把 `ShadowFlow` 的高层工作流能力从“模板推荐系统”推进为“积木式自由装配系统”，让用户可以按目标自由组装 workflow，而不是只能在少数 preset 之间做选择

---

## 1. 一句话结论

`ShadowFlow` 的高层本体不应是 `pattern recommendation`，而应是：

**workflow assembly。**

也就是：

- `pattern` 只是现成 recipe
- `template` 只是可导入蓝图
- 真正的主入口应该是可自由组合的 assembly blocks

一句话说：

**模板是成品，积木才是本体。**

---

## 2. 为什么现在要把方向定成 Assembly

从我们之前的调研和设计文档看，最初目标一直都不是“推荐几个固定 workflow”，而是：

1. 调研多种工作流模式
2. 把这些模式拆成可重组的构件
3. 允许用户根据目标自由装配
4. 系统只负责校验、编译、执行、追踪

这条线在这些文档里都能看到：

- `Spec-Driven`
- `Collaborative`
- `Swarm`
- `Check-Balance`
- `TDD`
- `Quick Lane`
- `Meta-Workflow`

它们的意义不是“以后系统只能从中选一个”，而是：

**它们应该成为可拆解、可组合、可复用的模式来源。**

所以如果系统只停留在：

- `task-kind -> pattern`
- `preset recommendation`
- `wizard 选模板`

那其实还没有回到我们最初的目标。

---

## 3. 核心判断

### 3.1 Pattern 不应是本体

`pattern` 更适合被定义成：

- 官方 recipe
- 最佳实践模板
- 用户导入模板
- scaffold 起点

而不是工作流系统的唯一主入口。

### 3.2 Assembly 才是本体

真正的本体应该是：

- block catalog
- assembly graph
- assembly constraints
- compile pipeline

也就是系统首先要回答：

1. 有哪些积木
2. 积木怎么拼
3. 哪些拼法合法
4. 最终如何编译成 runtime workflow

### 3.3 Pattern = 预组装好的 Recipe

推荐的结构不是：

- `pattern` 对立于 `自由组装`

而是：

- `assembly` 是底层积木系统
- `pattern` 是积木预组装好的 recipe

也就是说，pattern 只是 assembly 的一种序列化产物。

### 3.4 Recommendation 只是辅助层

后续系统当然仍然可以支持：

- `task-kind -> pattern`
- `goal -> assembly suggestion`
- `meta-workflow selector`

但这些都只能是辅助层，不应成为主模型。

---

## 4. 我们当初调研过的模式，应该怎样被重新理解

下面这些模式，不应被当成“固定模板集合”，而应被当成“可拆解的模式来源”：

1. `Spec-Driven`
2. `Collaborative`
3. `Swarm`
4. `Check-Balance`
5. `TDD`
6. `Quick Lane`
7. `Meta-Workflow`

它们分别可以拆成不同的 block 组合：

### 4.1 Spec-Driven

可拆成：

- `analyze`
- `specify`
- `plan`
- `taskify`
- `implement`
- `verify`

### 4.2 Collaborative

可拆成：

- `propose`
- `negotiate`
- `consensus`
- `accept/reject loop`

### 4.3 Swarm

可拆成：

- `decompose`
- `parallel`
- `worker lane`
- `aggregate`

### 4.4 Check-Balance

可拆成：

- `plan`
- `review`
- `reject / rework`
- `approve`
- `assign`
- `execute`

### 4.5 TDD

可拆成：

- `understand`
- `write_test`
- `implement`
- `run_test`
- `validate`
- `retry loop`

所以真正的目标不是“再多做几个模式”，而是：

**把这些模式背后的结构，拆成 assembly blocks。**

---

## 5. Workflow Assembly 的核心对象

建议把高层对象重新分成两层：

## 5.1 资源层

定义“拿什么拼”

1. `ToolSpec`
2. `SkillSpec`
3. `RoleSpec`
4. `AgentSpec`

这层已经有一定基础了。

## 5.2 装配层

定义“怎么拼”

1. `WorkflowBlockSpec`
2. `WorkflowAssemblySpec`
3. `AssemblyConstraintSpec`
4. `AssemblyCompileResult`

---

## 6. Workflow Block Catalog v1

建议把第一版积木明确分成四类。

## 6.1 Worker Blocks

面向实际执行单元：

1. `receive`
2. `analyze`
3. `plan`
4. `research`
5. `review`
6. `execute`
7. `verify`
8. `report`
9. `publish`

这些 block 最终通常会编译成 `agent.execute` 或其他 worker node。

## 6.2 Control Blocks

面向流程控制：

1. `branch`
2. `parallel`
3. `barrier`
4. `loop`
5. `retry_gate`
6. `approval_gate`

这类 block 主要编译成 control nodes 和 route edges。

## 6.3 Delegation Blocks

面向子任务派生：

1. `delegate`
2. `spawn_child`
3. `subworkflow`
4. `handoff`

这类 block 会直接接到我们这轮已经落地的 child run / delegated node 语义上。

## 6.4 Persistence / Materialization Blocks

面向产物与恢复：

1. `artifact`
2. `checkpoint`
3. `writeback`
4. `memory_note`

这类 block 主要与 runtime contract、adapter、projection 对齐。

---

## 7. WorkflowBlockSpec v1

建议每个积木至少有下面这些字段：

```yaml
block_id: "review_gate"
kind: "control"
type: "approval_gate"
label: "Review Gate"
inputs: ["draft"]
outputs: ["approved_draft", "review_feedback"]
uses:
  agents: ["reviewer"]
  roles: ["reviewer"]
  tools: []
policy:
  side_effects: "read_only"
  requires_confirmation: true
compile:
  node_type: "agent.execute"
  route_strategy: "review_gate"
metadata: {}
```

核心思想是：

- block 不是最终 runtime node
- block 是高层装配件
- compile 阶段才把它翻译成具体 `WorkflowDefinition`

---

## 8. WorkflowAssemblySpec v1

建议新增一个正式对象，描述“用户如何装配工作流”：

```yaml
assembly_id: "feature-delivery-lane"
name: "Feature Delivery Lane"
goal: "Ship a safe feature implementation"

blocks:
  - id: "plan"
    ref: "plan"
    agent: "task_planner"

  - id: "review_gate"
    ref: "approval_gate"
    agent: "pr_reviewer"

  - id: "delegate_impl"
    ref: "delegate"
    config:
      child_template: "implementation_lane"

links:
  - from: "plan"
    to: "review_gate"
  - from: "review_gate"
    to: "delegate_impl"

overlays:
  - "checkpointed"
  - "artifact_writeback"

metadata: {}
```

这里要强调：

**assembly 的输入是 blocks + links，而不是直接写底层 nodes + edges。**

---

## 9. Pattern 在新体系里的位置

建议把 `pattern` 正式重新定义为：

```yaml
pattern_id: "planner-coder-reviewer"
kind: "recipe"
assembly:
  ...
defaults:
  ...
recommendations:
  task_kinds: ["build", "code", "delivery"]
```

也就是说：

- pattern 只是预组装好的 assembly
- 用户可以直接用
- 也可以再拆开、替换、叠加、改造

这样就不会把系统锁死在“只能推荐 preset”的路径上。

---

## 10. Compile 主链应该怎么改

当前主链大体是：

`Tool / Skill / Role / Agent / WorkflowTemplate -> compile -> WorkflowDefinition`

建议下一步升级成：

`Tool / Skill / Role / Agent / BlockCatalog / WorkflowAssembly -> compile -> WorkflowDefinition -> RuntimeRequest -> RunResult`

也就是：

1. 资源层负责定义执行资源
2. block 层负责定义积木能力
3. assembly 层负责定义组合方式
4. compile 层负责把高层装配翻译成 runtime graph

---

## 11. 与当前 ShadowFlow 进度的关系

这点很关键。

我们最近做的 runtime 工作，其实没有偏，反而正好是在为 assembly 铺路。

已经具备的底座：

1. runtime contract 固化
2. graph projection 初步成形
3. `task_tree` / lineage 已开始成立
4. child run / delegated node 已经落地
5. parallel / barrier 已有正式运行时语义

这意味着：

**我们现在缺的已经不是执行底座，而是装配层。**

换句话说：

- runtime 已开始能执行“自由组装出来的 graph”
- 但 high-level 还没有把“积木式 assembly”正式建模出来

---

## 12. 当前真正缺的 4 件事

### 12.1 缺 Block Catalog

目前系统还没有把：

- review
- delegate
- approval_gate
- aggregate
- retry_loop

这些东西正式定义成积木。

### 12.2 缺 Assembly Schema

目前用户还是更容易通过：

- template
- preset
- workflow yaml

去表达，而不是通过统一的 block assembly 去表达。

### 12.3 缺 Composition Contract

我们还没有正式定义：

1. 哪些 block 可以相连
2. 哪些 block 可以嵌套
3. 哪些 block 可以 overlay
4. child run block 如何与 stage/lane 对齐

### 12.4 缺 Meta-Workflow 的位置重定义

推荐系统以后当然可以保留，但它的位置应该变成：

- assembly assistant
- pattern suggester
- scaffold helper

而不是 workflow system 的本体。

---

## 13. 推荐实施顺序

### Phase 1: 文档与对象固化

1. 固化 `WorkflowBlockSpec`
2. 固化 `WorkflowAssemblySpec`
3. 固化 `PatternRecipeSpec`

### Phase 2: 第一版 Block Catalog

先落最小可用积木：

1. `plan`
2. `review`
3. `execute`
4. `parallel`
5. `barrier`
6. `delegate`
7. `artifact`
8. `checkpoint`

### Phase 3: Assembly Compiler

把 `WorkflowAssemblySpec` 编译成：

1. `WorkflowTemplateSpec`
2. 或直接 `WorkflowDefinition`

建议先走：

`assembly -> template -> workflow definition`

这样能最大限度复用现有 compile 主线。

### Phase 4: Pattern 降级为 Recipe

把现有：

- `single-reviewer`
- `planner-coder-reviewer`
- `research-review-publish`

都改成 recipe 示例，而不是系统唯一入口。

### Phase 5: Meta-Workflow 回归辅助层

最后再补：

- `task-kind -> recipe`
- `goal -> assembly suggestion`
- `overlay recommendation`

这时推荐会变得更合理，因为它是建立在 assembly 本体之上的。

---

## 14. 对外表达应该怎么改

后续产品叙事建议从：

- “我们支持多种 workflow pattern”

改成：

- “我们支持积木式 workflow assembly，pattern 只是内置 recipe”

这样更贴近你们最初的设计方向，也能解释为什么系统里会有：

- role
- agent
- stage
- lane
- delegate
- parallel
- review gate

这些被拆得很细的对象。

---

## 15. 当前结论

如果回到最初目标看，下一步最重要的不是继续扩 runtime，也不是继续增加 preset，而是：

**把 ShadowFlow 从 pattern recommendation 系统，推进成 workflow assembly 系统。**

这件事一旦成立，后面的：

- pattern
- template
- wizard
- recommendation
- imported workflow

都会自然有位置。

如果这件事不成立，那么系统再做多少 preset，也还是停留在“模板平台”，而不是“工作流元平台”。

---

## 16. 外部参照与差异判断

围绕“积木式自由装配”这条线，外部已经有一些相近方向，但多数仍停留在：

- 可视化节点编辑器
- 模板 + 节点拖拽
- workflow builder
- pattern / flow 示例库

还较少有系统把：

- `assembly blocks`
- `assembly constraints`
- `recipe as serialized assembly`

明确写成核心本体。

### 16.1 较接近的方向

1. **Flowise AgentFlow V2**  
   官方文档明确强调使用更细粒度、原生的 standalone nodes 来设计整个 workflow。  
   参考：<https://docs.flowiseai.com/using-flowise/agentflowv2>

2. **Langflow**  
   强调通过连接组件节点来构建 flow，本质上是组件化装配思路。  
   参考：<https://docs.langflow.org/>

3. **n8n AI Workflow**  
   明确把 AI workflow 看成由多个 building blocks 组合而成，偏 workflow builder。  
   参考：<https://docs.n8n.io/advanced-ai/intro-tutorial/>

4. **Dify Workflow / Agent Node / Orchestrate Node**  
   也是典型节点式编排，支持 agent、orchestrate、parallel 等控制块。  
   参考：<https://docs.dify.ai/en/guides/workflow/node/agent>  
   参考：<https://docs.dify.ai/versions/legacy/en/user-guide/build-app/flow-app/orchestrate-node>

5. **LangGraph Subgraphs**  
   更偏低层 graph runtime，已经支持 subgraph modular composition。  
   参考：<https://docs.langchain.com/oss/python/langgraph/use-subgraphs>

### 16.2 更偏研究/探索的方向

1. **FlowForge**  
   关注 multi-agent workflow 的设计空间探索和交互式引导。  
   参考：<https://arxiv.org/abs/2507.15559>

2. **A2Flow**  
   把 workflow generation 看成一组可复用 abstraction operators 的组合问题。  
   参考：<https://arxiv.org/abs/2511.20693>

3. **MermaidFlow**  
   偏 agentic workflow 的图演化生成。  
   参考：<https://arxiv.org/abs/2505.22967>

### 16.3 对我们的启发

这些外部系统说明两点：

1. “节点/积木化”方向是成立的，不是空想
2. 但多数系统仍然把重点放在 builder / 模板 / 可视化编辑，而不是把 assembly 明确抬成第一性对象

这正是 `ShadowFlow` 可以走出的差异点：

- graph runtime 作为底座
- assembly 作为本体
- pattern/template 作为 recipe
- recommendation 作为辅助层

---

## 17. 自发装配与 LLM 辅助演化

`ShadowFlow` 做成 assembly system 之后，下一层不应只是：

- 推荐一个 preset
- 让用户从几个模板中二选一

而应该逐步支持：

- `goal -> assembly draft`
- `assembly critique`
- `assembly mutation`
- `invalid composition repair`

也就是说：

**LLM 适合做 assembly assistant，但不适合替代 assembly 本体。**

因此，推荐的结构是：

1. block catalog 提供可组合空间
2. assembly spec 提供正式结构
3. constraint validator 保证合法性
4. LLM 在这个空间里提出、调整、修复装配方案

如果没有 typed block 与 assembly constraint，所谓“自发装配”很容易退化成：

- 自然语言幻觉
- 不可执行图
- 不可复用结构

---

## 18. Towow / 通爻 对我们的启发

从 `ToWow` 的公开资料与本地备份仓库看，它最值得借鉴的不是某个固定 workflow，而是：

- `发现层`
- `协商层`
- `价值交互层`

特别是它对于“自发”的理解：

- 不是预设谁参与
- 不是预设结构如何长成
- 而是让相关参与者先被激活，再在协商中形成方案

这对 `ShadowFlow` 的启发不是“替换 runtime”，而是：

1. 在 assembly 前增加 `goal formulation / participant matching / role suggestion`
2. 在 assembly 中允许 `delegate / spawn_child / subworkflow / create_subgoal`
3. 在 runtime 之后把结果再回流为后续 assembly 的反馈信号

所以更准确的关系是：

- `ToWow-like layer` 解决“协作如何浮现”
- `ShadowFlow` 解决“浮现后的结构如何装配、编译、执行、追踪”

这也意味着：

**自发装配不是第一层能力，而是 assembly 稳定之后的上层能力。**
