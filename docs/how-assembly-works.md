# ShadowFlow 自发装配：工作原理

## 一句话总结

给一个目标，ShadowFlow 自动选出需要哪些构件（block），连成工作流，绑定 LLM 后端，输出一个可执行的 WorkflowDefinition。

---

## 完整数据流

```
                         用户输入
                            │
                     "规划并执行任务"
                            │
                            ▼
                ┌─────────────────────┐
                │  ActivationSelector  │   ← Phase 1：选哪些 block
                │  (tag 匹配 + 覆盖集) │
                └─────────┬───────────┘
                          │
              candidates: [plan, execute]
                          │
                          ▼
                ┌─────────────────────┐
                │  ConnectionResolver  │   ← Phase 1：怎么连
                │  (v1 线性链)         │
                └─────────┬───────────┘
                          │
              links: plan → execute → END
                          │
                          ▼
                ┌─────────────────────┐
                │  WorkflowAssemblySpec│   ← 装配清单（blocks + links + goal）
                └─────────┬───────────┘
                          │
                   --compile 模式
                          │
                          ▼
                ┌─────────────────────┐
                │  默认 Agent 绑定     │   ← 自动创建 agent + role
                │  --provider claude   │      绑定到每个 agent-kind block
                │  --executor-kind cli │
                └─────────┬───────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  AssemblyCompiler    │   ← Phase 0：编译
                │  .compile()          │
                └─────────┬───────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  WorkflowDefinition  │   ← 可执行的工作流
                │  (nodes + edges +    │
                │   executor config)   │
                └──────────────────────┘
```

---

## Block 是什么

Block 是 ShadowFlow 的基本构件，像积木一样。每个 block 声明：
- **block_id**：唯一标识（如 `plan`、`review`、`execute`）
- **kind**：类型（`worker` / `control` / `delegation` / `persistence`）
- **capabilities**：能力声明，系统用来做匹配（如 `["planning", "task_decomposition"]`）
- **local_activation.tags**：搜索关键词，中英双语（如 `["plan", "planning", "规划", "计划"]`）

查看所有 block：
```bash
shadowflow registry list --kind blocks --registry-root example_registry
```

内置 8 个 block：

| block_id | kind | capabilities | 用途 |
|----------|------|-------------|------|
| plan | worker | planning, task_decomposition | 任务规划 |
| review | worker | review, quality_check | 质量审查 |
| execute | worker | execution, action | 任务执行 |
| parallel | control | parallelism, fan_out | 并行分发 |
| barrier | control | synchronization, fan_in | 并行汇聚 |
| delegate | delegation | delegation, sub_workflow | 子流程委托 |
| artifact | persistence | artifact_emit, persistence | 产物输出 |
| checkpoint | persistence | checkpoint_write, state_persistence | 状态保存 |

---

## 激活选择器怎么选 block

`ActivationSelector.select(goal, catalog)` 分两步：

### 第 1 步：Tag 匹配（哪些 block 跟目标相关）

把目标文本拆成 token，跟每个 block 的 tags 做匹配：
- **英文**：单词级匹配（`"plan"` 匹配 tag `"plan"`）
- **中文**：子串匹配（`"规划并执行任务"` 包含 tag `"规划"` 和 `"执行"`）

```
目标："规划并执行任务"
  → plan block：tags 里有 "规划" ✓
  → execute block：tags 里有 "执行" ✓
  → review block：tags 里没有匹配 ✗
```

### 第 2 步：贪心最小覆盖集（选最少的 block 覆盖所有能力）

tag 匹配到的 block 的 capabilities 合起来就是"需要的能力集合"。然后贪心选最少的 block 子集来覆盖它们。

```
匹配到的 block：plan (capabilities: planning, task_decomposition)
               execute (capabilities: execution, action)
需要的能力：{planning, task_decomposition, execution, action}
覆盖：plan 覆盖前两个，execute 覆盖后两个 → complete=True
```

### 未匹配（OOD）处理

如果目标跟任何 tag 都不匹配：
```
目标："quantum entanglement"
  → 没有 block 的 tag 能匹配
  → complete=False, missing=["unknown"], fallback="surface_to_user"
```

---

## 连接解析器怎么连 block

`ConnectionResolver.resolve(candidates)` 把选出的 block 串成一条链：

```
candidates: [plan, execute]
  → plan → execute → END
```

v1 只支持线性链。v2 会引入基于 capability 依赖的拓扑推断（fan-out/fan-in）。

---

## --compile 做了什么：默认 Agent 绑定

ShadowFlow 里，每个 `worker`/`delegation` 类型的 block 编译时需要绑定一个 Agent。Agent 决定：
- **用哪个 LLM**（Claude / OpenAI / Gemini / Ollama）
- **怎么调用**（CLI 命令行 / API 接口）

`--compile` 模式自动创建一个默认 Agent：

```
Default Agent
├── role: Default Worker（通用角色）
├── executor:
│   ├── kind: cli 或 api（由 --executor-kind 决定）
│   └── provider: claude / openai / gemini / ollama（由 --provider 决定）
└── 绑定到所有 agent-kind block
```

### 支持的 Provider

| provider | executor-kind | 说明 |
|----------|---------------|------|
| claude | cli | Claude Code 命令行调用 |
| claude | api | Claude API 调用 |
| openai | api | OpenAI / Codex API 调用 |
| gemini | api | Gemini API 调用 |
| ollama | cli | 本地 Ollama 命令行调用 |

### 示例

```bash
# Claude CLI 执行
shadowflow assemble --goal "规划并执行任务" --compile --provider claude --executor-kind cli

# OpenAI API 执行
shadowflow assemble --goal "plan and review" --compile --provider openai --executor-kind api

# Gemini API 执行
shadowflow assemble --goal "plan and execute" --compile --provider gemini --executor-kind api
```

---

## 不加 --compile 时输出什么

只输出装配结果（AssemblySpec），不编译：

```bash
shadowflow assemble --goal "plan and execute"
```

输出：
```json
{
  "complete": true,
  "missing_capabilities": [],
  "candidates": [
    {"block_id": "plan", "matched_capabilities": ["planning", "task_decomposition"]},
    {"block_id": "execute", "matched_capabilities": ["execution", "action"]}
  ],
  "assembly": {
    "assembly_id": "assembled",
    "goal": "plan and execute",
    "blocks": [
      {"id": "plan", "ref": "plan"},
      {"id": "execute", "ref": "execute"}
    ],
    "links": [
      {"from": "plan", "to": "execute"},
      {"from": "execute", "to": "END"}
    ]
  }
}
```

这个 AssemblySpec 可以手动绑定不同的 agent 后再编译——适合需要精细控制的场景（比如 plan 用 Claude，execute 用 Codex）。

---

## 反馈闭环（Phase 2 已就绪）

当 RuntimeService 执行编译后的 workflow 时：

```
执行 plan node → ExecutionFeedbackRecord（含 reward_hints）
执行 execute node → ExecutionFeedbackRecord（含 reward_hints）
        ↓
export_activation_training_dataset()
        ↓
ActivationTrainingSample
  ├── assembly_block_id: "plan"     ← 哪个 block
  ├── assembly_goal: "规划并执行任务"  ← 什么目标
  ├── reward_hints:                  ← 执行效果
  │   ├── artifact_count: 1.0
  │   ├── continued_flow: 1.0
  │   └── ...
  └── signals: {...}                 ← 详细信号
```

这些训练样本是 Phase 3（Graph-RL）的输入数据。系统用它们学习"什么目标应该激活什么 block"。

---

## 架构层次

```
┌─────────────────────────────────────────────┐
│              Phase 3: Graph-RL              │  ← 未来：学习驱动
│         (Contextual Bandit → GNN)           │
├─────────────────────────────────────────────┤
│        Phase 2: 反馈信号标准化 ✅           │  ← 训练数据管线
│   (ActivationTrainingSample + wire-back)    │
├─────────────────────────────────────────────┤
│     Phase 1: 局部激活 + 连接解析 ✅        │  ← 选 block + 连线
│  (ActivationSelector + ConnectionResolver)  │
├─────────────────────────────────────────────┤
│          Phase 0: 积木本体 ✅               │  ← block 定义 + 编译
│  (WorkflowBlockSpec + AssemblyCompiler)     │
├─────────────────────────────────────────────┤
│              Runtime 执行层                  │  ← 实际运行 workflow
│         (RuntimeService + Executors)         │
└─────────────────────────────────────────────┘
```

---

## 快速上手

```bash
# 1. 看看有哪些 block
shadowflow registry list --kind blocks --registry-root example_registry

# 2. 试试目标激活
shadowflow assemble --goal "规划并执行任务"

# 3. 一键编译成可执行 workflow
shadowflow assemble --goal "规划并执行任务" --compile --provider claude --executor-kind cli

# 4. OOD 目标会返回错误
shadowflow assemble --goal "量子纠缠"  # exit code 1, missing_capabilities: ["unknown"]
```
