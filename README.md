# ShadowFlow

A lightweight multi-agent orchestration runtime for contract-first workflows.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)

## What ShadowFlow Is

ShadowFlow 当前阶段的正式定位是：

- 一个独立的 runtime / schema / adapter 项目
- 一个可被 CLI 与 HTTP API 调用的多智能体编排运行时
- 一个对外输出结构化 `run / step / trace / artifact / checkpoint` 结果的黑盒引擎

## Features

- Contract-first workflow schema
- Unified CLI and HTTP runtime entrypoints
- Structured `run -> steps -> final_output -> trace -> artifacts -> checkpoints`
- Canonical YAML / JSON workflow definition
- Basic parallel fan-out + barrier join
- Unified executor layer for `CLI` and `API`
- Built-in provider adapters for `Codex CLI`, `Claude CLI`, `OpenAI Responses API`, and `Anthropic Messages API`
- Markdown writeback backend for `runs / artifacts / checkpoints`
- Reference writeback adapter stubs for `docs / memory / graph`
- Minimal checkpoint store contract with in-memory reference implementation
- Phase 1 examples aligned with runtime contract
- High-level `Tool / Skill / Role / Agent / WorkflowTemplate` schema with template compiler

## Installation

当前阶段推荐使用源码安装，暂未发布到 PyPI。

### From Source

```bash
git clone https://github.com/Ravenveil/ShadowFlow.git
cd ShadowFlow
pip install -e .[dev]
```

安装完成后可验证：

```bash
shadowflow --help
python -m shadowflow.cli --help
```

可选依赖：

```bash
pip install -e .[zerog]    # 0G KV checkpoint store
pip install -e .[server]   # FastAPI HTTP 服务
pip install -e .[memory]   # Redis / SQLite 持久化
pip install -e .[all]      # 全功能
```

## Quick Start

### 1. Create a Workflow

```yaml
workflow_id: "docs-gap-review"
version: "0.1"
name: "Docs Gap Review"
entrypoint: "planner"
nodes:
  - id: "planner"
    kind: "agent"
    type: "planning.analyze"
    config:
      role: "planner"
      prompt: "Analyze documentation gaps."
      message_template: "[planner] analyzed documentation gaps."
      emit:
        gap_count: 2
  - id: "reviewer"
    kind: "agent"
    type: "review.summarize"
    config:
      role: "reviewer"
      prompt: "Summarize the review notes."
      message_template: "[reviewer] produced review notes."
edges:
  - from: "planner"
    to: "reviewer"
    type: "conditional"
    condition: "result.gap_count > 0"
  - from: "reviewer"
    to: "END"
    type: "final"
defaults: {}
metadata: {}
```

### 2. Validate

```bash
shadowflow validate -w workflow.yaml
```

### 3. Run

```bash
shadowflow run -w workflow.yaml -i "{\"goal\":\"Analyze docs gaps\"}"
```

使用 markdown writeback：

```bash
shadowflow run -w workflow.yaml -i "{\"goal\":\"Analyze docs gaps\"}" --writeback markdown --writeback-root ./shadowflow-runtime
```

说明：

- 未显式传 `--writeback-root` / `--root` 时，CLI 会优先读取环境变量 `SHADOWFLOW_RUNTIME_ROOT`
- 若未设置该环境变量，会回退到用户级 runtime 数据目录

### 4. Export Workflow Graph

```bash
shadowflow graph -w workflow.yaml
```

### 5. Compile a High-Level Template

```bash
shadowflow compile --template docs-review-template --registry-root examples/highlevel/minimal-registry --var goal="Audit docs"
```

### 6. Inspect or Scaffold High-Level Specs

```bash
shadowflow presets list
shadowflow patterns list
shadowflow role-presets list
shadowflow registry counts --registry-root examples/highlevel/minimal-registry
shadowflow registry list --registry-root examples/highlevel/minimal-registry --kind agents
shadowflow registry export --registry-root examples/highlevel/minimal-registry --output-root ./exported-registry
shadowflow registry import --registry-root ./my-registry --preset single-reviewer --workflow-id docs_review_pack
shadowflow init tool --registry-root ./my-registry --id filesystem --kind builtin
shadowflow init role --registry-root ./my-registry --id reviewer
shadowflow init role --registry-root ./my-registry --id strict_reviewer --preset reviewer
shadowflow init skill --registry-root ./my-registry --id docs_review
shadowflow init agent --registry-root ./my-registry --id docs_reviewer --role reviewer --skill docs_review --tool filesystem
shadowflow init template --registry-root ./my-registry --id docs_review_template --agent-ref docs_reviewer --agent-node-id reviewer
shadowflow init workflow --registry-root ./my-registry --id docs_review_pack --pattern single-reviewer --goal "Audit docs"
shadowflow scaffold --registry-root ./my-registry --pattern planner-coder-reviewer --workflow-id feature_lane --goal "Ship a safe feature plan"
shadowflow init workflow --registry-root ./my-registry --id research_lane --task-kind research --goal "Collect evidence and package a final summary"
shadowflow init workflow --registry-root ./my-registry --id feature_lane --preset planner-coder-reviewer --goal "Ship a safe feature plan" --assign planner.focus="Only define execution milestones" --assign reviewer.owned_topics="regression,tests"
```

编译时如果你想直接看“这次生成了什么”，可以附带摘要：

```bash
shadowflow compile --template docs-review-template --registry-root examples/highlevel/minimal-registry --var goal="Audit docs" --summary json
```

### 7. Chat With an Executor

单轮对话：

```bash
shadowflow chat --kind cli --provider claude --parse claude-json --message "请用一句中文介绍 ShadowFlow"
```

### 8. Inspect Persisted Runtime Data

```bash
shadowflow runs list
shadowflow runs get --run-id <run_id>
shadowflow runs graph --run-id <run_id>
shadowflow checkpoints get --checkpoint-id <checkpoint_id>
shadowflow sessions list
shadowflow sessions get --session-id <session_id>
shadowflow resume --run-id <run_id> --checkpoint-id <checkpoint_id>
```

### 9. Serve HTTP API

```bash
shadowflow serve --port 8000
```

核心端点：

- `POST /workflow/validate`
- `POST /workflow/run`
- `POST /workflow/graph`
- `GET /runs`
- `GET /runs/{id}`
- `GET /runs/{id}/graph`
- `POST /chat/sessions`
- `GET /chat/sessions`
- `GET /chat/sessions/{id}`
- `POST /chat/sessions/{id}/messages`

## Official Phase 1 Examples

- [docs-gap-review](examples/runtime-contract/docs-gap-review.yaml)
- [parallel-synthesis](examples/runtime-contract/parallel-synthesis.yaml)
- [research-review-loop](examples/runtime-contract/research-review-loop.yaml)

## Executor Examples

- Generic local CLI: [cli-generic-local](examples/runtime-contract/cli-generic-local.yaml)
- Codex CLI: [cli-agent-execution](examples/runtime-contract/cli-agent-execution.yaml)
- Claude CLI: [cli-claude-execution](examples/runtime-contract/cli-claude-execution.yaml)
- OpenAI API: [api-agent-execution](examples/runtime-contract/api-agent-execution.yaml)
- Anthropic API: [api-anthropic-execution](examples/runtime-contract/api-anthropic-execution.yaml)

## High-Level Spec Example

- Minimal registry: [minimal-registry](examples/highlevel/minimal-registry)

## Built-In Presets

- `single-reviewer`
- `planner-coder-reviewer`
- `research-review-publish`

也可以把它们当作第一版 workflow pattern library：

- `shadowflow patterns list`

## Built-In Role Archetypes

- `planner`
- `coder`
- `reviewer`
- `researcher`
- `publisher`
- `qa`

推荐入口：

- `shadowflow init workflow`
- `shadowflow scaffold`

工作流层支持固定角色指派：

- 在 `WorkflowTemplateSpec.agents[].assignment` 中声明
- 或通过 `shadowflow init workflow --assign`
- 或通过 `shadowflow scaffold --assign`

工作流模板层现在还支持：

- `policy_matrix`
- `stages / lanes`
- compile-time governance validation
- `task-kind -> pattern` 的推荐式入口

运行示例：

```bash
shadowflow validate -w examples/runtime-contract/docs-gap-review.yaml
shadowflow run -w examples/runtime-contract/docs-gap-review.yaml -i "{\"goal\":\"Analyze docs gaps\"}"
```

CLI executor 示例：

```bash
shadowflow run -w examples/runtime-contract/cli-agent-execution.yaml -i "{\"goal\":\"实现一个最小 CLI 调度验证\"}"
shadowflow run -w examples/runtime-contract/cli-claude-execution.yaml -i "{\"goal\":\"实现一个最小 Claude CLI 调度验证\"}"
```

API executor 示例：

```bash
shadowflow run -w examples/runtime-contract/api-agent-execution.yaml -i "{\"goal\":\"生成一个 API 执行计划\"}"
shadowflow run -w examples/runtime-contract/api-anthropic-execution.yaml -i "{\"goal\":\"生成一个 Anthropic API 执行计划\"}"
```

## Phase 1 Focus

当前主线聚焦于：

- runtime contract
- canonical workflow schema
- unified CLI / HTTP entrypoints
- step / artifact / checkpoint result model
- writeback adapter reference implementation
- checkpoint store minimal contract
- basic parallel / barrier control flow
- 至少两个可重复执行的端到端样例

## Current Non-Goals

当前阶段明确不做：

- Shadow 全量集成
- 统一知识图谱 substrate
- 固定形态工作台
- 并行扩张 planner / memory / UI / runtime 成巨型平台

## Roadmap

### Phase 1

- [x] Unified runtime contract skeleton
- [x] CLI / HTTP shared entrypoint
- [x] Contract-aligned workflow schema document
- [x] Parallel fan-out + barrier baseline
- [x] Three contract-aligned official examples
- [ ] Example migration cleanup
- [ ] Checkpoint recovery refinement
- [ ] Legacy interface/test baseline cleanup

