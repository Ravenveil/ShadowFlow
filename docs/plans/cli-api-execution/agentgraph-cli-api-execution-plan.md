# AgentGraph CLI/API 调度层设计计划

> 日期：2026-03-30
> 状态：Draft
> 目的：明确 AgentGraph 作为独立编排层时，如何以自有执行器统一调度本地 CLI 与云端 API，并为后续 Shadow CLI 记忆层集成预留边界

---

## 1. 背景与决策

当前 AgentGraph 已经具备 Phase 1 runtime contract 的基本形态：

- `WorkflowDefinition`
- `RuntimeRequest`
- `RunResult`
- `checkpoint / resume`
- CLI / HTTP API 双入口

但当前节点执行仍主要停留在 contract-level stub 阶段，尚未形成真正的执行层。

本轮设计结论如下：

1. AgentGraph 的编排层必须继续保持为**自有项目主线**。
2. 不引入 CLI-Anything 作为主干依赖，也不围绕其内部实现建模。
3. 当前真正需要解决的问题不是“生成 CLI”，而是“统一调用 CLI 与 API”。
4. 记忆层先使用 Markdown 文件作为临时宿主，后续再接 Shadow CLI。

因此，AgentGraph 下一阶段应新增：

- `CLI Executor`
- `API Executor`
- `Markdown Memory Adapter`

---

## 2. 目标

本阶段的主目标是把 AgentGraph 从“可运行 contract runtime”推进为“可调度真实执行后端的编排层”。

最小闭环如下：

`agentgraph run -> workflow node -> CLI/API executor -> normalized step result -> markdown writeback`

阶段成功标志：

1. AgentGraph 可以真实调用 Claude CLI、Codex CLI 或其他本地 CLI。
2. AgentGraph 可以真实调用 OpenAI / Anthropic 等模型 API。
3. CLI 与 API 的调用结果都能被统一映射到 `StepRecord / ArtifactRef / CheckpointRef`。
4. 产物和中间记忆可先稳定写入 Markdown / JSON 文件。
5. 后续接入 Shadow CLI 时，不需要推翻 workflow contract。

---

## 3. 非目标

为保证边界稳定，本阶段明确不做：

1. 不做 CLI-Anything 集成主线。
2. 不做工具自动生成框架。
3. 不做大型插件市场或 CLI Hub。
4. 不做 Shadow 全量知识底座集成。
5. 不做 GUI 优先联动。
6. 不做复杂 memory river 正式实现。
7. 不做“一次性统一所有工具”的大而全方案。

---

## 4. 核心架构

### 4.1 三层职责

AgentGraph 在本阶段应稳定为以下三层关系：

1. **编排层**
   - workflow 解析
   - 节点调度
   - trace / checkpoint / resume
   - result normalization

2. **执行层**
   - CLI Executor
   - API Executor
   - 后续可扩展其他 executor

3. **记忆/写回层**
   - Markdown Memory Adapter
   - 后续 Shadow CLI Adapter

### 4.2 边界原则

执行层是 AgentGraph 的受控子系统，不是宿主的临时脚本入口。

因此应满足：

1. 编排层只依赖统一 executor 接口，不依赖某个具体 CLI/API 实现。
2. CLI 与 API 的原始响应不能直接泄漏到上层，必须映射成统一结果模型。
3. 记忆写回是 adapter，不进入 runtime contract 核心对象。
4. Shadow 后续只替换 adapter，不替换 execution contract。

---

## 5. 执行层设计

### 5.1 统一执行器抽象

建议新增统一接口：

```python
class BaseExecutor:
    kind: str
    provider: str

    async def execute(self, payload: dict) -> dict:
        ...
```

统一返回值应至少包含：

```json
{
  "message": "...",
  "raw_output": {},
  "artifacts": [],
  "state": {},
  "metadata": {}
}
```

### 5.2 CLI Executor

CLI Executor 用于调度本地 agent CLI：

- Claude CLI
- Codex CLI
- 后续其他本地 agent CLI

#### 建议能力

1. 支持 `command + args`
2. 支持 `stdin = json | text | none`
3. 支持 `stdout = json | text`
4. 支持环境变量注入
5. 支持工作目录配置
6. 返回 `stdout / stderr / exit_code`
7. 将异常转换为结构化执行错误

#### 适用场景

1. 本地代码库改动
2. 本地文件读写
3. 本地已有登录态与工具上下文
4. 真正“能干活”的 agent 执行链

### 5.3 API Executor

API Executor 用于调度云端模型：

- OpenAI API
- Anthropic API
- 后续其他兼容 API

#### 建议能力

1. 统一请求格式
2. 模型名、温度、系统提示等参数透传
3. 支持超时、重试、错误归一化
4. 支持结构化 JSON 输出模式
5. 将 provider 差异折叠到 adapter 内部

#### 适用场景

1. 纯生成类步骤
2. 云端批处理
3. 无需本地工具权限的任务
4. 更稳定可控的服务端调用

---

## 6. Workflow 节点设计

### 6.1 节点目标

workflow 不应直接暴露底层实现细节，但应足够表达执行后端类型。

建议新增一类标准执行节点：

```yaml
nodes:
  - id: coder
    kind: agent
    type: agent.execute
    config:
      executor:
        kind: cli
        provider: codex
      prompt: "修复当前仓库中的测试失败问题"
```

或：

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
      prompt: "为当前任务制定一个执行计划"
```

### 6.2 建议字段

`config.executor` 建议支持：

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

### 6.3 设计要求

1. workflow 层只声明执行方式，不硬编码 provider 内部协议。
2. Claude CLI / Codex CLI 的差异应在 executor 层收敛。
3. API provider 差异应在 adapter 层收敛。
4. `agent.execute` 节点未来应成为主流执行节点，而不是临时扩展点。

---

## 7. 记忆与写回设计

### 7.1 临时策略：Markdown Memory

在 Shadow CLI 尚未具备前，先使用本地 Markdown / JSON 目录承接：

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

建议含义：

1. `docs/`
   - 最终文档产物
   - 供人查看和后续归档

2. `memory/`
   - 中间摘要、计划、复盘、上下文快照
   - 先作为“轻量记忆河”替代层

3. `checkpoint-store/`
   - resume 所需的 checkpoint JSON
   - 与 contract 中 `CheckpointRef` 对齐

4. `runs/`
   - 每次运行的完整摘要与元信息

### 7.2 后续接入 Shadow CLI 的方式

Markdown Memory Adapter 必须被视为临时适配层。

后续替换原则：

1. `MarkdownWritebackAdapter` -> `ShadowCliWritebackAdapter`
2. workflow schema 不变
3. runtime contract 不变
4. executor 层不变

也就是说，Shadow 接入应发生在 writeback adapter，而不是 runtime 核心对象。

---

## 8. Phase 1 实施范围

### 8.1 第一阶段必须完成

1. 定义统一 executor 抽象
2. 落一个最小 `CLI Executor`
3. 落一个最小 `API Executor`
4. 新增 `Markdown Memory Adapter`
5. 提供至少一个 CLI workflow 样例
6. 提供至少一个 API workflow 样例
7. 保证结果进入现有 `RunResult` 主线

### 8.2 第一阶段最小试点

建议先打通两条链：

#### 链路 A：CLI

`AgentGraph -> Codex CLI / Claude CLI -> stdout JSON/text -> Artifact/Memory -> Markdown`

#### 链路 B：API

`AgentGraph -> OpenAI API -> structured response -> Artifact/Memory -> Markdown`

---

## 9. 实施顺序

### Step 1

冻结文档方案，作为本轮开发基线。

### Step 2

在 runtime 中明确 executor 边界：

- `BaseExecutor`
- `ExecutorRegistry`
- `CliExecutor`
- `ApiExecutor`

### Step 3

将现有节点执行逻辑从 contract stub 逐步迁移到 executor 分发模型。

### Step 4

实现 Markdown writeback：

- artifact 落盘
- checkpoint 落盘
- run summary 落盘

### Step 5

补齐示例与测试：

1. CLI executor E2E
2. API executor E2E
3. markdown writeback E2E
4. resume 与 writeback 共存回归

### Step 6

在此基础上再讨论 Shadow CLI 接口，而不是提前耦合。

---

## 10. 风险与控制

### 10.1 主要风险

1. runtime contract 与 executor 实现发生耦合回流
2. CLI provider 差异过大导致节点 schema 失控
3. API provider 的请求格式不统一
4. Markdown 临时方案被误用成长期架构

### 10.2 控制策略

1. 所有 provider 差异收敛在 executor adapter 内部
2. workflow 仅暴露最小必要字段
3. Markdown adapter 文档上明确标记为过渡层
4. 任何 Shadow 集成都走 adapter，不直接改 runtime contract

---

## 11. 推荐的近期文档与评审动作

为了避免方案再次发散，建议后续按以下顺序推进：

1. 先以本文件作为开发主计划
2. 再补一份 `Executor Contract Spec`
3. 再补一份 `Markdown Writeback Spec`
4. 开始实现后，用 gstack 或同类评审方式做一次：
   - runtime boundary review
   - design review
   - integration review

这里的 gstack 更适合用于：

1. 审查 executor 边界是否干净
2. 审查 workflow schema 是否过度暴露实现细节
3. 审查 Shadow 后续集成位是否留对

而不是替代主设计本身。

---

## 12. 最终判断

AgentGraph 的下一阶段不应再围绕“生成更多 CLI”展开，而应围绕：

**如何把 CLI 与 API 统一纳入自有编排层。**

本阶段的核心判断是：

1. 编排层必须是 AgentGraph 自己的。
2. 调度层也应由 AgentGraph 自己掌控。
3. CLI 是强执行后端，API 是稳定执行后端。
4. Markdown 是过渡记忆层，Shadow CLI 是后续正式记忆层。

当这条主线成立后，AgentGraph 才真正从“contract runtime”进入“可调度真实 agent 的编排引擎”阶段。

