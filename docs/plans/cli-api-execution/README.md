# AgentGraph CLI/API 调度层主计划

> 日期：2026-03-30
> 状态：Main Plan
> 作用：作为 `CLI/API 调度层` 主题的唯一主入口，统一概念判断、执行范围与实施顺序

---

## 1. 一句话目标

把 AgentGraph 从一个主要停留在 contract stub 的编排 runtime，推进为一个能够**统一调度本地 CLI 与云端 API**、并将结果写回临时记忆层的独立编排引擎。

最小闭环是：

`agentgraph run -> workflow -> executor -> CLI/API -> normalized result -> markdown writeback`

---

## 2. 核心判断

这轮工作的核心判断只有四个：

1. **编排层必须是 AgentGraph 自己的**
   AgentGraph 的核心价值在于 workflow、step、trace、checkpoint、resume 和结果结构，而不是某个特定模型或某个特定工具。

2. **执行层也必须由 AgentGraph 自己掌控**
   我们现在真正需要解决的问题，不是“生成更多 CLI”，而是“统一调用 CLI 与 API”。

3. **CLI 与 API 不是二选一**
   CLI 是强执行后端，适合真正干活的 agent；API 是稳定执行后端，适合服务化、批处理和云端调用。

4. **记忆层先简化，边界必须为 Shadow 预留**
   在 Shadow CLI 尚未可用前，先用 Markdown / JSON 落地，后续再替换为 Shadow CLI adapter。

5. **AgentGraph CLI 与 Shadow CLI 必须明确分工**
   AgentGraph CLI 继续做，但定位应是开发者 / 运维 / 编排 CLI；用户型工作台 CLI 应由 Shadow CLI 承接。

相关边界文档：

- [AgentGraph CLI 与 Shadow CLI 边界 v1](agentgraph-shadow-cli-boundary-v1.md)
- [AgentGraph 与 Claw 集成边界 v1](claw-integration-boundary-v1.md)
- [AgentGraph 工作流治理主链 v1](workflow-governance-chain-v1.md)

---

## 3. 当前阶段真正要做什么

这轮不是做“大平台扩张”，而是做一条真实可跑的主链路。

本阶段要完成：

1. `CLI Executor`
2. `API Executor`
3. `Markdown Writeback Adapter`
4. 至少一条 CLI 试点 workflow
5. 至少一条 API 试点 workflow
6. executor + writeback + checkpoint 的测试与验证闭环

完成后，AgentGraph 才算从“有 contract”进入“有执行力”。

---

## 4. 本阶段明确不做什么

为了控制边界，本阶段不做：

1. 不接 CLI-Anything 主线
2. 不做工具自动生成框架
3. 不做插件市场或 CLI Hub
4. 不做 Shadow 正式记忆集成
5. 不做 GUI 优先联动
6. 不做复杂 memory river 正式实现
7. 不做一次性统一所有工具的大而全方案

---

## 5. 架构总览

本阶段的结构应该稳定成三层：

### 5.1 编排层

由 AgentGraph runtime 继续负责：

1. workflow 解析
2. node 调度
3. run / step / trace
4. checkpoint / resume
5. artifact / final_output

### 5.2 执行层

由 AgentGraph 自己新增并掌控：

1. `CLI Executor`
2. `API Executor`
3. `ExecutorRegistry`

### 5.3 写回层

由 adapter 承接：

1. `MarkdownWritebackAdapter`
2. 后续 `ShadowCliWritebackAdapter`

原则是：

- runtime contract 不直接依赖具体 provider
- provider 差异收敛在 executor adapter 内部
- 宿主差异收敛在 writeback adapter 内部

---

## 6. 为什么 CLI 重要

CLI 的价值不是“它也能调模型”，而是它更接近一个真正能干活的 agent 外壳。

CLI 更强的地方在于：

1. 本地文件系统访问
2. 本地命令与工具调用
3. 已有登录态和本机环境
4. 工作目录与项目上下文天然可用

所以如果目标是：

- 改代码
- 看文件
- 跑测试
- 生成补丁
- 在本地仓库中持续执行

那么 CLI 通常优先于纯 API。

---

## 7. 为什么 API 仍然必须做

API 是稳定后端，不该被放弃。

API 的价值在于：

1. 协议稳定
2. 适合服务端和云环境
3. 易于监控、限流和重试
4. 更适合统一 provider 的接入方式

所以长期不是 CLI 替代 API，而是：

- CLI 负责强执行
- API 负责稳定执行

---

## 8. 最小节点协议

建议新增标准执行节点：`agent.execute`

CLI 例子：

```yaml
nodes:
  - id: coder
    kind: agent
    type: agent.execute
    config:
      executor:
        kind: cli
        provider: codex
        command: ["codex"]
        stdin: json
        parse: text
      prompt: "修复测试失败"
```

API 例子：

```yaml
nodes:
  - id: planner
    kind: agent
    type: agent.execute
    config:
      executor:
        kind: api
        provider: openai
        model: gpt-5
      prompt: "给当前任务生成执行计划"
```

`config.executor` 建议最小字段：

```json
{
  "kind": "cli | api",
  "provider": "codex | claude | openai | anthropic",
  "command": [],
  "stdin": "json | text | none",
  "parse": "json | text",
  "cwd": ".",
  "env": {},
  "model": "optional",
  "timeout_seconds": 120
}
```

---

## 9. 记忆与写回策略

在 Shadow CLI 尚未具备前，先采用本地目录落地：

```text
.agentgraph-runtime/
  docs/
  memory/
  graph/
  checkpoint-store/
    checkpoints/
    records/
  runs/
```

含义：

1. `docs/`
   面向人的最终产物

2. `memory/`
   中间摘要、计划、上下文、任务记忆

3. `checkpoint-store/`
   resume 所需 JSON

4. `runs/`
   run 级摘要与元信息

这不是最终架构，只是过渡层。  
后续替换原则：

1. workflow schema 不变
2. runtime contract 不变
3. executor 层不变
4. 仅将 `MarkdownWritebackAdapter` 替换为 `ShadowCliWritebackAdapter`

---

## 10. 第一阶段实施顺序

### Step 1：冻结文档

以本文件作为唯一主计划，后续开发与评审都围绕这份文档。

### Step 2：落 executor 边界

新增：

1. `BaseExecutor`
2. `ExecutorRegistry`
3. `CliExecutor`
4. `ApiExecutor`

### Step 3：迁移节点执行路径

将现有 runtime 里偏 stub 的节点执行逻辑，逐步切到 executor 分发模型。

### Step 4：落 Markdown writeback

实现：

1. artifact 落盘
2. checkpoint 落盘
3. run summary 落盘

### Step 5：补样例与测试

至少补四类验证：

1. CLI executor E2E
2. API executor E2E
3. markdown writeback E2E
4. resume + writeback 回归

---

## 11. 第一阶段里程碑

### Milestone 1：执行器边界成立

完成标准：

1. 节点支持 `executor.kind`
2. 现有 contract 测试不破坏

### Milestone 2：CLI 路径跑通

完成标准：

1. 能真实调 Codex CLI 或 Claude CLI
2. 能把结果映射成 `StepRecord`
3. 能产出 artifact 或 memory note

### Milestone 3：API 路径跑通

完成标准：

1. 能真实调 OpenAI API 或 Anthropic API
2. 输出与 CLI 路径共享同一 `RunResult`

### Milestone 4：Markdown 闭环成立

完成标准：

1. artifact 可落盘
2. checkpoint 可落盘
3. resume 可与落盘 checkpoint 共存

---

## 12. 风险与控制

### 风险

1. runtime contract 与 executor 实现耦合回流
2. provider 差异过大导致 schema 发散
3. Markdown 过渡层被误用为长期方案

### 控制

1. provider 差异只收敛在 executor adapter 内部
2. workflow 只暴露最小必要字段
3. Markdown adapter 文档上始终标记为过渡层
4. 任何 Shadow 集成都走 adapter，不直接改 runtime contract

---

## 13. 后续文档关系

本目录下文件建议这样使用：

1. `README.md`
   唯一主计划，后续开工默认看它

2. `agentgraph-cli-api-concept-draft.md`
   概念稿，保留思想与产品哲学

3. `agentgraph-cli-api-execution-draft.md`
   执行稿，保留阶段任务与里程碑细节

4. `agentgraph-cli-api-execution-plan.md`
   详细设计稿，保留边界、节点、adapter、风控等完整说明

5. `agent-definition-layering-v1.md`
   固定 `Tool / Skill / Role / Agent / Template` 的分层关系

6. `original-architecture-recap-v1.md`
   回忆 Shadow / AgentGraph 原始设计脉络，帮助回到 AG 主线

7. `agent-spec-and-template-schema-v1.md`
   高层 schema 设计稿，定义 `Tool / Skill / Role / Agent / WorkflowTemplate`

8. `agent-spec-field-contract-v1.md`
   高层 schema 的字段级契约，作为实现与后续扩展的字段基线

9. `agentgraph-gstack-inspiration-v1.md`
   从 `gstack.md` 抽取对 AG 有价值的产品逻辑启发，固定角色化、技能化与引导式装配的方向

10. `agentgraph-shadow-wave-positioning-v1.md`
   记录 AgentGraph、Shadow 与 Wave 之间的定位判断：我们不做 Wave，而是让自己的 CLI / agent 工作流能够舒服地运行在 Wave 这类终端工作台中

11. `shadowflow-shadow-cli-shadow-ui-boundary-v1.md`
   改名为 `ShadowFlow` 后的职责边界文档，明确 `ShadowFlow / Shadow CLI / Shadow UI` 三层分工，并固定“ShadowFlow 聚焦引擎、用户侧 CLI 统一由 Shadow CLI 承接”的新边界

12. `shadowflow-engine-scope-v1.md`
   ShadowFlow 作为引擎的正式范围定义，明确当前该做的引擎能力和不该继续承担的产品壳能力

13. `shadowflow-engine-task-list-v1.md`
   基于引擎范围定义拆出的 P0/P1 任务清单，作为后续实现推进的执行入口

14. `shadowflow-workflow-assembly-contract-v1.md`
   把 ShadowFlow 从 pattern recommendation 推进为 workflow assembly 系统，明确 block catalog、assembly spec、constraint 与 recipe 的关系

15. `shadowflow-language-strategy-v1.md`
   明确 ShadowFlow 当前继续使用 Python 的判断，以及未来 Rust kernel / TypeScript 产品层的职责边界

16. `shadowflow-towow-spontaneous-assembly-v1.md`
   评估 ToWow/通爻在“自发协作 / 自发装配”上的启发，并判断它如何接到 ShadowFlow 的 assembly 主线

---

## 14. 最终结论

这轮工作的真正目标不是“接更多模型”，也不是“引更多外部项目”。

真正目标是：

**让 AgentGraph 自己掌控 CLI 与 API 的统一调度层，并用一个可替换的临时记忆层把整条链先跑起来。**

只要这一步做成，后面的 Shadow CLI、长期记忆、更多 provider、更多 workflow 都有了稳定基座。
