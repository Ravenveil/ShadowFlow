# AgentGraph CLI/API 调度层执行稿

> 日期：2026-03-30
> 状态：Execution Draft
> 目的：把 CLI/API 调度层的目标、范围、阶段任务与交付标准收敛成可以开工的执行计划

---

## 1. 执行目标

本轮开发目标不是扩展概念，而是先打通一条真实闭环：

`agentgraph run -> executor -> CLI/API -> normalized result -> markdown writeback`

阶段性交付标准：

1. AgentGraph 能真实调用本地 CLI
2. AgentGraph 能真实调用云端 API
3. 返回结果被统一映射为现有 runtime contract
4. 产物、记忆、checkpoint 可以落地到 Markdown / JSON
5. 后续 Shadow CLI 接入不需要推翻当前 workflow contract

---

## 2. 本阶段要做什么

### 2.1 核心建设项

1. 新增统一执行器抽象
2. 实现 `CLI Executor`
3. 实现 `API Executor`
4. 实现 `Markdown Writeback Adapter`
5. 补一条 CLI 样例链路
6. 补一条 API 样例链路
7. 把测试扩到 executor + writeback 闭环

### 2.2 第一批 provider

CLI 侧优先：

1. Codex CLI
2. Claude CLI

API 侧优先：

1. OpenAI API
2. Anthropic API

---

## 3. 本阶段不做什么

1. 不接 CLI-Anything 主线
2. 不做工具自动生成
3. 不做完整插件市场
4. 不做 Shadow 正式记忆集成
5. 不做 GUI 优先联动
6. 不做复杂 planner/memory 体系扩张

---

## 4. 设计边界

### 4.1 编排层

继续由 AgentGraph runtime 负责：

1. workflow 执行
2. node 调度
3. checkpoint / resume
4. trace / artifacts / run result

### 4.2 执行层

新增 executor 子层，负责：

1. 调 CLI
2. 调 API
3. 统一结果归一化

### 4.3 写回层

本轮先用 Markdown adapter 负责：

1. docs 写回
2. memory 写回
3. checkpoint JSON 落盘

后续这层替换为 Shadow CLI adapter。

---

## 5. 最小节点协议

建议新增标准执行节点 `agent.execute`。

CLI 示例：

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

API 示例：

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

---

## 6. 目录与写回约定

建议临时写回目录：

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

约定：

1. `docs/`
   - 最终文档、报告、面向人的产物

2. `memory/`
   - 中间计划、摘要、任务记忆、上下文沉淀

3. `checkpoint-store/`
   - resume 需要的 checkpoint JSON

4. `runs/`
   - run 级别摘要

---

## 7. 里程碑

### Milestone 1：执行器边界落地

目标：

1. 抽出统一 executor 接口
2. runtime 能按节点配置分发 executor

完成标准：

1. 现有 contract 测试不破坏
2. 节点可声明 `executor.kind`

### Milestone 2：CLI Executor 跑通

目标：

1. 本地调度 Codex CLI / Claude CLI
2. 收集 stdout / stderr / exit code
3. 结果映射到 step output

完成标准：

1. 至少一条 workflow 能真实调用 CLI
2. 可生成 artifact 或 memory note

### Milestone 3：API Executor 跑通

目标：

1. 调 OpenAI / Anthropic API
2. 统一 message / output 结构

完成标准：

1. 至少一条 workflow 能真实调用 API
2. 结果可与 CLI 路径共用同一 `RunResult`

### Milestone 4：Markdown Writeback 完整闭环

目标：

1. artifact 落盘
2. checkpoint 落盘
3. run summary 落盘

完成标准：

1. 能在不依赖 Shadow 的情况下完成完整链路
2. resume 能与落盘 checkpoint 共存

---

## 8. 开发顺序

建议按以下顺序推进：

1. 先冻结文档
2. 再做 executor 抽象
3. 再做 CLI Executor
4. 再做 API Executor
5. 再做 Markdown writeback
6. 最后补测试与样例

原因：

1. CLI 是当前最强需求
2. API 是必须保留的稳定后端
3. Markdown 只是承接层，不应抢在执行层前面

---

## 9. 验证方式

### 9.1 自动化验证

需要补的测试：

1. CLI executor contract test
2. API executor contract test
3. markdown writeback test
4. checkpoint + resume + writeback 回归测试

### 9.2 人工验证

建议至少手动跑两条链：

1. `goal -> Codex CLI -> markdown memory`
2. `goal -> OpenAI API -> markdown artifact`

### 9.3 设计验证

本阶段结束后，建议用 gstack 或同类方式做一次设计审查，重点问三个问题：

1. executor 边界是否干净
2. workflow schema 是否泄露太多 provider 细节
3. Shadow CLI 的未来接入位是否足够自然

---

## 10. 后续演进

当本执行稿完成后，下一步才进入：

1. `ShadowCliWritebackAdapter`
2. 更细的 executor contract spec
3. provider 级配置与鉴权模型
4. 更复杂的多 agent workflow

也就是说，Shadow CLI 应该是下一阶段集成项，而不是本轮阻塞项。

---

## 11. 最终判断

本轮最关键的不是让 AgentGraph “看起来更大”，而是让它真正具备执行能力。

因此第一优先级不是更多文档、更多愿景、更多外部项目整合，而是：

**把 CLI 与 API 纳入一个由 AgentGraph 自己掌控的统一调度层。**

这一步做成以后，AgentGraph 才真正具备继续完善整个项目的基础。

